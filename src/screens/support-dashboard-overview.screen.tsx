import { SupportIssueInternalState, SupportIssueType, useAuthContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useSupportDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { STAFF_NAME_MISSING } from 'src/components/compliance/staff-identity';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { isAssignedToMe, SupportIssueListItem, useSupportDashboard } from 'src/hooks/support-dashboard.hook';
import { formatDateTimeShort } from 'src/util/compliance-helpers';
import {
  computeStatistics,
  customerWaitingHours,
  DEFAULT_STAT_PERIOD_DAYS,
  ESCALATION_HOURS,
  formatElapsed,
  reasonLabel,
  STAT_PERIODS,
  TicketBucket,
  TicketStatistics,
  trendLabel,
  typeLabel,
  WAIT_TIER_HOURS,
  waitTier,
} from 'src/util/support-helpers';

type DashboardTab = 'overview' | 'statistics';

// Terminal/resting states a ticket can settle in — everything else is "open" and still needs
// attention. Defined as the complement of these so any new non-terminal state the backend adds
// (e.g. InProgress / InClarification, api#3950) is automatically included in the overview filters
// instead of silently dropping such tickets from My tickets / Waiting / Escalations.
const TERMINAL_STATES: SupportIssueInternalState[] = [
  SupportIssueInternalState.COMPLETED,
  SupportIssueInternalState.CANCELED,
  SupportIssueInternalState.ON_HOLD,
];
const OPEN_STATES = Object.values(SupportIssueInternalState).filter((s) => !TERMINAL_STATES.includes(s));
const REFRESH_MS = 60_000;

export default function SupportDashboardOverviewScreen(): JSX.Element {
  useSupportDashboardGuard();

  const { translate, locale } = useSettingsContext();
  const { getIssueList, getIssueStatistics } = useSupportDashboard();
  const { name: verifiedName, isLoading: isLoadingName, error: nameError } = useStaffVerifiedName();
  const { session } = useAuthContext();
  const { navigate } = useNavigation();

  const canIdentifyMine = session?.account != null || Boolean(verifiedName);
  const mineLoading = isLoadingName && session?.account == null;

  const [issues, setIssues] = useState<SupportIssueListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => new Date());

  const [tab, setTab] = useState<DashboardTab>('overview');
  const [waitFilter, setWaitFilter] = useState<number>(ESCALATION_HOURS);
  const [statsPeriod, setStatsPeriod] = useState<number>(DEFAULT_STAT_PERIOD_DAYS);
  const [statistics, setStatistics] = useState<TicketStatistics>();
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string>();
  const statsRequestId = useRef(0);

  const baselineLoaded = useRef(false);

  const loadIssues = useCallback(
    (showSpinner: boolean): void => {
      if (showSpinner) setIsLoading(true);
      getIssueList({ states: OPEN_STATES.join(',') })
        .then((res) => {
          setIssues(res.data);
          setError(undefined);
          setNow(new Date());
        })
        .catch((e: Error) => setError(e.message ?? 'Unknown error'))
        .finally(() => setIsLoading(false));
    },
    [getIssueList],
  );

  useEffect(() => {
    if (baselineLoaded.current) return;
    baselineLoaded.current = true;
    loadIssues(true);
  }, [loadIssues]);

  // keep counts and timers fresh
  useEffect(() => {
    const id = setInterval(() => loadIssues(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadIssues]);

  const scrollToSection = useCallback((id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Statistics are loaded for the selected period. Primary source is the server aggregate;
  // if that endpoint is unavailable we fall back to computing from the most recent tickets.
  // Statistics are stored with their stable bucket keys and localized at render time. Loading them
  // per language instead would make a language switch a refetch: the chart would blank behind a
  // spinner, and a failing refetch would replace statistics that were already correct.
  const loadStats = useCallback(
    (periodDays: number): void => {
      // The period selector can retrigger this while a load is in flight, so only the newest
      // request may write - otherwise a slow earlier response lands last and wins.
      const requestId = ++statsRequestId.current;
      const isCurrent = (): boolean => requestId === statsRequestId.current;

      // clear any prior error up front so a stale error can't mask freshly loaded stats
      // (the fallback success path below sets `statistics` without touching `statsError`)
      setStatsError(undefined);
      setStatsLoading(true);
      getIssueStatistics(periodDays)
        .then((dto) => {
          // An empty, unparseable or misshaped 200 body reaches us as undefined or without a
          // usable trend. Reading dto.trend used to throw here and drop into the fallback below;
          // keep that, or the view spins forever. Check the shape, not just truthiness: a
          // non-array trend would pass and then throw in the render-time memo instead.
          if (!Array.isArray(dto?.trend)) throw new Error('Invalid statistics response');
          if (isCurrent()) setStatistics(dto);
        })
        .catch(() => {
          if (!isCurrent()) return;
          return getIssueList({ take: 1000 }).then((res) => {
            if (isCurrent()) setStatistics(computeStatistics(res.data, periodDays));
          });
        })
        .catch((e: Error) => {
          if (isCurrent()) setStatsError(e.message ?? 'Unknown error');
        })
        .finally(() => {
          if (isCurrent()) setStatsLoading(false);
        });
    },
    [getIssueStatistics, getIssueList],
  );

  const localizedStatistics = useMemo(
    () =>
      statistics && {
        ...statistics,
        trend: statistics.trend.map((b) => ({
          key: trendLabel(b.key, statistics.granularity, locale),
          count: b.count,
        })),
      },
    [statistics, locale],
  );

  useEffect(() => {
    if (tab === 'statistics') loadStats(statsPeriod);
  }, [tab, statsPeriod, loadStats]);

  const stats = useMemo(() => {
    const mine = issues
      .filter((i) => isAssignedToMe(i, session?.account, verifiedName))
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    // tickets where the customer is waiting, sorted by waiting time (longest first)
    const waitingSorted = issues
      .map((i) => ({ issue: i, hours: customerWaitingHours(i, now) ?? -1 }))
      .filter((x) => x.hours >= 0)
      .sort((a, b) => b.hours - a.hours);

    // cumulative counts per threshold (≥1h ⊇ ≥12h ⊇ ≥24h; the ≥24h bucket = escalated)
    const waitingLongerThan = WAIT_TIER_HOURS.map((h) => waitingSorted.filter((x) => x.hours >= h).length);

    // open limit increase requests, oldest first
    const limitRequests = issues
      .filter((i) => i.type === SupportIssueType.LIMIT_REQUEST)
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

    return { mine, waitingSorted, waitingLongerThan, limitRequests };
  }, [issues, verifiedName, now, session?.account]);

  const waitingList = useMemo(
    () => stats.waitingSorted.filter((x) => x.hours >= waitFilter).map((x) => x.issue),
    [stats.waitingSorted, waitFilter],
  );

  useLayoutOptions({
    title: translate('screens/support', 'Support Dashboard'),
    backButton: false,
    noMaxWidth: true,
    noPadding: true,
  });

  return (
    <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-5 flex-1 min-h-0 p-4 md:p-6 text-left">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-dfxBlue-800">{translate('screens/support', 'Your support overview')}</h1>
        <button
          className="px-4 py-2 bg-dfxBlue-400 text-white rounded-lg text-sm hover:bg-dfxBlue-800 transition-colors"
          onClick={() => navigate('/support/dashboard/all')}
        >
          {translate('screens/support', 'View all tickets')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dfxGray-400">
        <TabButton
          label={translate('screens/support', 'Overview')}
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
        />
        <TabButton
          label={translate('screens/support', 'Statistics')}
          active={tab === 'statistics'}
          onClick={() => setTab('statistics')}
        />
      </div>

      {tab === 'statistics' && (
        <StatisticsView
          statistics={localizedStatistics}
          loading={statsLoading}
          error={statsError}
          period={statsPeriod}
          onPeriodChange={setStatsPeriod}
        />
      )}

      {tab === 'overview' && error && <ErrorHint message={error} />}

      {tab === 'overview' &&
        (isLoading && issues.length === 0 ? (
          <StyledLoadingSpinner size={SpinnerSize.LG} />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard
                label={translate('screens/support', 'My tickets')}
                value={
                  <span title={translate('screens/support', '{{count}} open tickets total', { count: issues.length })}>
                    {canIdentifyMine ? stats.mine.length : '–'}
                    <span className="text-lg font-semibold text-dfxGray-700 ml-2">/ {issues.length}</span>
                  </span>
                }
                onClick={() => scrollToSection('my-tickets')}
              />
              <WaitTierCard
                counts={stats.waitingLongerThan}
                selected={waitFilter}
                onSelect={(hours) => {
                  setWaitFilter(hours);
                  scrollToSection('waiting');
                }}
              />
            </div>

            {/* Waiting tickets — filtered by the selected wait tier (24h = escalations) */}
            <Section
              anchorId="waiting"
              title={
                waitFilter >= ESCALATION_HOURS
                  ? translate('screens/support', 'Escalations')
                  : translate('screens/support', 'Waiting tickets')
              }
              subtitle={translate('screens/support', 'Customer waiting longer than {{hours}}h for a reply', {
                hours: waitFilter,
              })}
              count={waitingList.length}
              accent={waitFilter >= ESCALATION_HOURS ? 'danger' : 'neutral'}
            >
              {waitingList.length === 0 ? (
                <EmptyState
                  text={
                    waitFilter >= ESCALATION_HOURS
                      ? translate('screens/support', 'No escalations — all customers replied to in time')
                      : translate('screens/support', 'No tickets waiting this long')
                  }
                />
              ) : (
                <IssueList
                  issues={waitingList}
                  now={now}
                  onClick={(i) => navigate(`/support/dashboard/issue/${i.id}`)}
                />
              )}
            </Section>

            {/* Limit requests — kept prominent, compliance handles these directly */}
            <Section
              anchorId="limit-requests"
              title={translate('screens/support', 'Limit requests')}
              subtitle={translate('screens/support', 'Open limit increase requests')}
              count={stats.limitRequests.length}
              accent="info"
            >
              {stats.limitRequests.length === 0 ? (
                <EmptyState text={translate('screens/support', 'No open limit requests')} />
              ) : (
                <IssueList
                  issues={stats.limitRequests}
                  now={now}
                  onClick={(i) => navigate(`/support/dashboard/issue/${i.id}`)}
                />
              )}
            </Section>

            {/* My tickets */}
            <Section
              anchorId="my-tickets"
              title={translate('screens/support', 'My tickets')}
              subtitle={translate('screens/support', 'Tickets assigned to me')}
              count={canIdentifyMine ? stats.mine.length : undefined}
              accent="neutral"
            >
              {mineLoading ? (
                <div className="flex justify-center py-6">
                  <StyledLoadingSpinner size={SpinnerSize.LG} />
                </div>
              ) : nameError && !canIdentifyMine ? (
                <EmptyState
                  text={translate('screens/support', 'Could not load your verified name: {{error}}', {
                    error: nameError,
                  })}
                />
              ) : !canIdentifyMine ? (
                <EmptyState text={translate('screens/support', STAFF_NAME_MISSING)} />
              ) : stats.mine.length === 0 ? (
                <EmptyState text={translate('screens/support', 'No tickets assigned to you')} />
              ) : (
                <IssueList
                  issues={stats.mine}
                  now={now}
                  onClick={(i) => navigate(`/support/dashboard/issue/${i.id}`)}
                />
              )}
            </Section>
          </>
        ))}
    </div>
  );
}

// --- Sub-components ---

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'text-dfxBlue-800 border-b-2 border-dfxBlue-800' : 'text-dfxGray-700 hover:text-dfxBlue-800'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value, onClick }: { label: string; value: ReactNode; onClick?: () => void }): JSX.Element {
  return (
    <div
      className={`bg-white rounded-lg shadow-sm px-4 py-3 flex flex-col gap-0.5 ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
    >
      <div className="text-xs text-dfxGray-700 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold leading-tight text-dfxBlue-800">{value}</div>
    </div>
  );
}

// Customer-waiting card with rising-severity tiers (1h / 12h / 24h; ≥24h = escalated).
// Counts are cumulative ("waiting longer than X"); clicking a pill filters the list below.
function WaitTierCard({
  counts,
  selected,
  onSelect,
}: {
  counts: number[];
  selected: number;
  onSelect: (hours: number) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const tiers = [
    { hours: 1, label: '1h', pill: 'bg-dfxGray-300 text-dfxBlue-800', ring: 'ring-dfxGray-600' },
    { hours: 12, label: '12h', pill: 'bg-dfxYellow-500/20 text-dfxYellow-700', ring: 'ring-dfxYellow-500' },
    { hours: 24, label: '24h', pill: 'bg-dfxRed-100/15 text-dfxRed-100', ring: 'ring-dfxRed-100' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex flex-col gap-2 justify-center">
      <div className="text-xs text-dfxGray-700 uppercase tracking-wide">
        {translate('screens/support', 'Waiting longer than')}
      </div>
      <div className="flex items-center gap-2">
        {tiers.map((t, i) => {
          const active = selected === t.hours;
          return (
            <button
              key={t.label}
              onClick={() => onSelect(t.hours)}
              className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1 transition ${t.pill} ${
                active ? `ring-2 ${t.ring}` : 'opacity-80 hover:opacity-100'
              }`}
            >
              <span className="text-xl font-bold leading-none">{counts[i] ?? 0}</span>
              <span className="text-2xs font-medium opacity-70">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section({
  anchorId,
  title,
  subtitle,
  count,
  accent,
  action,
  children,
}: {
  anchorId?: string;
  title: string;
  subtitle: string;
  count?: number;
  accent: 'danger' | 'info' | 'neutral';
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const bar = accent === 'danger' ? 'bg-dfxRed-100' : accent === 'info' ? 'bg-dfxBlue-400' : 'bg-dfxGray-500';
  const pill =
    accent === 'danger'
      ? 'bg-dfxRed-100 text-white'
      : accent === 'info'
        ? 'bg-dfxBlue-400/10 text-dfxBlue-800'
        : 'bg-dfxGray-400 text-dfxBlue-800';

  return (
    <div id={anchorId} className="bg-white rounded-lg shadow-sm flex flex-col overflow-hidden scroll-mt-4">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-dfxGray-300">
        <span className={`mt-0.5 w-1.5 h-9 rounded-full shrink-0 ${bar}`} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-dfxBlue-800 leading-tight tracking-tight">{title}</h2>
            {count != null && <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pill}`}>{count}</span>}
          </div>
          <span className="text-xs text-dfxGray-700 mt-1">{subtitle}</span>
        </div>
        {action && <div className="ml-auto shrink-0 self-center">{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <div className="px-4 py-6 text-sm text-dfxGray-700">{text}</div>;
}

function StatisticsView({
  statistics,
  loading,
  error,
  period,
  onPeriodChange,
}: {
  statistics?: TicketStatistics;
  loading: boolean;
  error?: string;
  period: number;
  onPeriodChange: (days: number) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <div className="flex flex-col gap-4">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-dfxGray-700">{translate('screens/support', 'Period')}:</span>
        <div className="inline-flex rounded-lg border border-dfxGray-400 overflow-hidden">
          {STAT_PERIODS.map((p) => (
            <button
              key={p.days}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.days ? 'bg-dfxBlue-400 text-white' : 'bg-white text-dfxBlue-800 hover:bg-dfxGray-300'
              }`}
              onClick={() => onPeriodChange(p.days)}
            >
              {translate('screens/support', p.labelKey, p.labelParams)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorHint message={error} />
      ) : loading || !statistics ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={translate('screens/support', 'New tickets')} value={statistics.total} />
            <StatCard
              label={translate('screens/support', 'Avg messages / ticket')}
              value={statistics.avgMessages.toFixed(1)}
            />
            <StatCard label={translate('screens/support', 'Tickets / day')} value={statistics.perDay.toFixed(1)} />
            <StatCard
              label={translate('screens/support', 'Avg resolution time')}
              value={statistics.avgResolutionHours > 0 ? formatElapsed(statistics.avgResolutionHours) : '–'}
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-base font-bold text-dfxBlue-800">{translate('screens/support', 'New tickets')}</h2>
            <BarChart data={statistics.trend} />
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2.5">
            <h2 className="text-base font-bold text-dfxBlue-800">
              {translate('screens/support', 'Resolution time by type')}
            </h2>
            {statistics.resolutionByType.length === 0 ? (
              <span className="text-xs text-dfxGray-700">
                {translate('screens/support', 'No resolved tickets yet')}
              </span>
            ) : (
              statistics.resolutionByType.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-dfxBlue-800 truncate">{translate('screens/support', typeLabel(r.key))}</span>
                  <span className="text-dfxGray-700 whitespace-nowrap">
                    {formatElapsed(r.avgHours)} <span className="text-2xs">· {r.count}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BarChart({ data }: { data: TicketBucket[] }): JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.count));
  // with many bars (e.g. 30 days) thin out labels and per-bar counts to avoid clutter
  const dense = data.length > 16;
  const labelStep = Math.ceil(data.length / 12);

  return (
    <div className="flex items-end gap-1 h-44 mt-4">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
          {!dense && <span className="text-2xs text-dfxGray-700">{d.count}</span>}
          <div
            className="w-full bg-dfxBlue-400 rounded-t-sm min-h-[2px] transition-all"
            style={{ height: `${(d.count / max) * 100}%` }}
            title={`${d.key}: ${d.count}`}
          />
          <span className="text-2xs text-dfxGray-700 whitespace-nowrap">
            {!dense || i % labelStep === 0 ? d.key : ' '}
          </span>
        </div>
      ))}
    </div>
  );
}

function IssueList({
  issues,
  now,
  onClick,
}: {
  issues: SupportIssueListItem[];
  now: Date;
  onClick: (issue: SupportIssueListItem) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <ul className="divide-y divide-dfxGray-300">
      {issues.map((issue) => {
        const waiting = customerWaitingHours(issue, now);
        const tier = waiting != null ? waitTier(waiting) : 0;
        const escalated = tier === 3;
        const waitBadge =
          tier === 3
            ? 'bg-dfxRed-100 text-white'
            : tier === 2
              ? 'bg-dfxYellow-500/20 text-dfxYellow-700'
              : 'bg-dfxGray-300 text-dfxGray-800';

        return (
          <li
            key={issue.id}
            className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-dfxGray-300 transition-colors"
            onClick={() => onClick(issue)}
          >
            {/* status dot — red only for escalations, neutral otherwise */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${escalated ? 'bg-dfxRed-100' : 'bg-dfxGray-500'}`}
              title={
                escalated
                  ? translate('screens/support', 'Escalated')
                  : waiting != null
                    ? translate('screens/support', 'Awaiting reply')
                    : translate('screens/support', 'Replied')
              }
            />

            {/* main */}
            <div className="min-w-0 flex-1">
              <span className="text-sm text-dfxBlue-800 truncate font-medium">{issue.name}</span>
              <div className="text-xs text-dfxGray-700 truncate">
                {translate('screens/support', typeLabel(issue.type))} ·{' '}
                {translate('screens/support', reasonLabel(issue.reason))}
                {issue.clerk ? ` · ${issue.clerk}` : ''}
              </div>
            </div>

            {/* waiting badge (tiered) or last activity */}
            <div className="shrink-0 text-right">
              {waiting != null ? (
                <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${waitBadge}`}>
                  {translate('screens/support', 'Waiting')} {formatElapsed(waiting)}
                </span>
              ) : (
                <span className="text-2xs text-dfxGray-700">{formatDateTimeShort(issue.created)}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
