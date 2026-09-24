import { SupportIssueInternalState, SupportIssueType } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { FilterSelect, GroupedIssueTable, IssueTable, TabButton } from 'src/components/support/issue-table';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitSupport } from 'src/hooks/realunit-support.hook';
import { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';
import { countOpenIssueGroups, groupOpenIssues, typeLabel } from 'src/util/support-helpers';

type PagedTab = 'OnHold' | 'Canceled' | 'Completed';
type Tab = 'open' | PagedTab;

const OPEN_STATES = [SupportIssueInternalState.CREATED, SupportIssueInternalState.PENDING];
const PAGED_TABS: PagedTab[] = ['OnHold', 'Canceled', 'Completed'];
const PAGE_SIZE = 20;

interface TabData {
  issues: SupportIssueListItem[];
  total: number;
  loaded: boolean;
  loading: boolean;
}

const emptyTabData: TabData = { issues: [], total: 0, loaded: false, loading: false };

export default function RealunitSupportScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { getIssueList, getIssueCounts, getIssueActivity } = useRealunitSupport();
  const { navigate } = useNavigation();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openIssues, setOpenIssues] = useState<SupportIssueListItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('open');

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');

  const [tabs, setTabs] = useState<Record<PagedTab, TabData>>({
    OnHold: { ...emptyTabData },
    Canceled: { ...emptyTabData },
    Completed: { ...emptyTabData },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [newMessageCount, setNewMessageCount] = useState(0);
  const baselineRef = useRef<Date>(new Date());

  const loadOpenIssues = useCallback(
    (query: string): void => {
      setIsLoading(true);
      setError(undefined);

      const params: Record<string, string> = { states: OPEN_STATES.join(',') };
      if (typeFilter) params.type = typeFilter;
      if (query) params.query = query;

      getIssueList(params)
        .then((res) => setOpenIssues(res.data))
        .catch((e: Error) => setError(e.message ?? 'Unknown error'))
        .finally(() => setIsLoading(false));
    },
    [typeFilter, getIssueList],
  );

  useEffect(() => {
    getIssueCounts()
      .then((counts) =>
        setTabs((prev) => ({
          OnHold: { ...prev.OnHold, total: counts[SupportIssueInternalState.ON_HOLD] ?? 0 },
          Canceled: { ...prev.Canceled, total: counts[SupportIssueInternalState.CANCELED] ?? 0 },
          Completed: { ...prev.Completed, total: counts[SupportIssueInternalState.COMPLETED] ?? 0 },
        })),
      )
      .catch(() => undefined);
  }, [getIssueCounts]);

  const loadPaged = useCallback(
    (state: PagedTab, skip: number, query: string, append: boolean): void => {
      setTabs((prev) => ({ ...prev, [state]: { ...prev[state], loading: true } }));
      setError(undefined);

      getIssueList({ states: state, take: PAGE_SIZE, skip, query: query || undefined })
        .then((res) => {
          setTabs((prev) => ({
            ...prev,
            [state]: {
              issues: append ? [...prev[state].issues, ...res.data] : res.data,
              total: res.total,
              loaded: true,
              loading: false,
            },
          }));
        })
        .catch((e: Error) => {
          setError(e.message ?? 'Unknown error');
          setTabs((prev) => ({ ...prev, [state]: { ...prev[state], loading: false } }));
        });
    },
    [getIssueList],
  );

  useEffect(() => {
    if (activeTab !== 'open' && !tabs[activeTab].loaded) loadPaged(activeTab, 0, '', false);
  }, [activeTab, loadPaged]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === 'open') loadOpenIssues(searchQuery);
      else loadPaged(activeTab, 0, searchQuery, false);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, activeTab, loadPaged, loadOpenIssues]);

  useEffect(() => {
    const tick = (): void => {
      getIssueActivity(baselineRef.current)
        .then((res) => setNewMessageCount(res.count))
        .catch(() => undefined);
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [getIssueActivity]);

  // The "new messages" badge only renders on the Open tab, so a reload always targets the open list.
  const reloadAfterActivity = useCallback((): void => {
    baselineRef.current = new Date();
    setNewMessageCount(0);
    loadOpenIssues(searchQuery);
  }, [searchQuery, loadOpenIssues]);

  useLayoutOptions({
    title: translate('screens/support', 'RealUnit Support'),
    backButton: true,
    noMaxWidth: true,
  });

  const openIssueGroups = useMemo(() => groupOpenIssues(openIssues, stateFilter), [openIssues, stateFilter]);
  const openIssueCount = countOpenIssueGroups(openIssueGroups);

  const currentTab = activeTab === 'open' ? null : tabs[activeTab];
  const displayedIssues = currentTab?.issues ?? [];
  const displayedTotal = currentTab?.total ?? 0;
  const isTabLoading = activeTab === 'open' ? isLoading : tabs[activeTab].loading;
  const hasMore = currentTab != null && displayedIssues.length < displayedTotal;

  return (
    <div className="w-full flex flex-col gap-3 flex-1 min-h-0 text-left">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-lg shadow-sm p-3 flex-1 min-w-[150px]">
          <div className="text-xs text-dfxGray-700">{translate('screens/support', 'Open Issues')}</div>
          <div className="text-2xl font-bold text-dfxBlue-800">{openIssueCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dfxGray-400">
        <TabButton
          label={`Open (${openIssueCount})`}
          active={activeTab === 'open'}
          onClick={() => setActiveTab('open')}
        />
        {PAGED_TABS.map((tab) => (
          <TabButton
            key={tab}
            label={`${tab} (${tabs[tab].total})`}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          />
        ))}
      </div>

      {/* Filters - only for Open tab */}
      {activeTab === 'open' && (
        <div className="flex gap-3 flex-wrap items-end">
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={Object.values(SupportIssueType).map((t) => ({
              value: t,
              label: translate('screens/support', typeLabel(t)),
            }))}
          />
          <FilterSelect
            label="State"
            value={stateFilter}
            onChange={setStateFilter}
            options={OPEN_STATES.map((s) => ({ value: s, label: s }))}
          />
          <button
            className="px-3 py-1.5 text-xs text-dfxGray-700 hover:text-dfxBlue-800 transition-colors"
            onClick={() => {
              setTypeFilter('');
              setStateFilter('');
            }}
          >
            {translate('general/actions', 'Reset')}
          </button>
          {newMessageCount > 0 && (
            <button
              className="ml-auto px-3 py-1 text-xs text-white bg-dfxRed-100 rounded-full hover:bg-dfxRed-150 transition-colors"
              onClick={reloadAfterActivity}
            >
              {newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'} — load
            </button>
          )}
        </div>
      )}

      {/* Search - all tabs (server-side) */}
      <div className="flex flex-col gap-1">
        <input
          className="px-3 py-1.5 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={translate('screens/support', 'Search by ID, UID, name, clerk, message...')}
        />
      </div>

      {/* Content */}
      {error && <ErrorHint message={error} />}
      {isTabLoading && (activeTab === 'open' ? openIssueCount === 0 : displayedIssues.length === 0) ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : activeTab === 'open' ? (
        <GroupedIssueTable
          groups={openIssueGroups}
          showDepartment={false}
          onRowClick={(issue) => navigate(`/realunit/support/issue/${issue.id}`)}
        />
      ) : (
        <>
          <IssueTable
            issues={displayedIssues}
            showDepartment={false}
            onRowClick={(issue) => navigate(`/realunit/support/issue/${issue.id}`)}
          />
          {hasMore && (
            <button
              className="px-4 py-2 text-sm text-dfxBlue-400 hover:text-dfxBlue-800 transition-colors self-center disabled:opacity-50"
              onClick={() => loadPaged(activeTab as PagedTab, displayedIssues.length, searchQuery, true)}
              disabled={isTabLoading}
            >
              {isTabLoading ? 'Loading...' : `Load more (${displayedIssues.length} / ${displayedTotal})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
