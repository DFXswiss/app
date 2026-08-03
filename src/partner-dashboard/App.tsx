import { useCallback, useEffect, useMemo, useState } from 'react';
import { PartnerBrand } from 'src/config/partner-dashboard.config';
import { PartnerGranularity, PartnerStatistic, PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { usePartnerAuth } from 'src/hooks/partner-auth.hook';
import { PartnerApiError, usePartnerDashboard } from 'src/hooks/partner-dashboard.hook';
import { CompletionBlock } from './components/completion-block';
import { ErrorState } from './components/error-state';
import { PartnerHeader } from './components/header';
import { HorizontalBarList } from './components/horizontal-bar-list';
import { KpiTile } from './components/kpi-tile';
import { LoginScreen } from './components/login-screen';
import { PartialLegendNote } from './components/partial-marker';
import { PeriodControls, PeriodDays } from './components/period-controls';
import { ReferralBlock } from './components/referral-block';
import { DashboardSkeleton } from './components/skeleton';
import { TransactionsTimeChart } from './components/transactions-time-chart';
import { VolumeTimeChart } from './components/volume-time-chart';
import './styles/partner.css';
import {
  DEFAULT_BRAND_REGISTRY,
  loadBrandRegistry,
  resolveBrandFromToken,
  resolveFixtureBrand,
  ResolvedPartnerBrand,
} from './util/brands';
import { formatAmount, formatAmountWhole, formatCount } from './util/format';
import { usePartnerTranslation } from './util/i18n';
import { ensureSuppressedHatchPattern, usePartnerTheme } from './util/theme';

function periodRange(days: PeriodDays): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function toPartnerBrand(resolved: ResolvedPartnerBrand): PartnerBrand {
  return {
    key: resolved.key,
    displayName: resolved.displayName,
    title: resolved.title,
    accent: resolved.accent,
    logoUrl: resolved.logoUrl,
    isFallback: resolved.isFallback,
  };
}

export default function PartnerDashboardApp(): JSX.Element {
  const auth = usePartnerAuth();
  const { getPartnerStatistic, getPartnerTimeline, isFixture } = usePartnerDashboard();
  const { translate, locale, partnerLanguage, setPartnerLanguage } = usePartnerTranslation();
  const { theme, setTheme } = usePartnerTheme();

  const [brand, setBrand] = useState<PartnerBrand>(() =>
    toPartnerBrand(
      isFixture
        ? resolveFixtureBrand(DEFAULT_BRAND_REGISTRY)
        : resolveBrandFromToken(DEFAULT_BRAND_REGISTRY, auth.session),
    ),
  );
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [granularity, setGranularity] = useState<PartnerGranularity>('Day');
  const [statistic, setStatistic] = useState<PartnerStatistic | null>(null);
  const [timeline, setTimeline] = useState<PartnerTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const range = useMemo(() => periodRange(periodDays), [periodDays]);

  // Resolve brand from runtime registry + session (or fixture Cake entry).
  // Fixture mode uses the baked-in DEFAULT registry only — no network, not even brands.json.
  useEffect(() => {
    if (isFixture) {
      setBrand(toPartnerBrand(resolveFixtureBrand(DEFAULT_BRAND_REGISTRY)));
      return;
    }
    let cancelled = false;
    void loadBrandRegistry().then((registry) => {
      if (cancelled) return;
      setBrand(toPartnerBrand(resolveBrandFromToken(registry, auth.session)));
    });
    return () => {
      cancelled = true;
    };
  }, [isFixture, auth.session, auth.isAuthenticated]);

  const { isAuthenticated, invalidateSession } = auth;

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      setStatistic(null);
      setTimeline(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = { from: range.from, to: range.to, granularity };
      const [stat, tl] = await Promise.all([getPartnerStatistic(query), getPartnerTimeline(query)]);
      setStatistic(stat);
      setTimeline(tl);
    } catch (err) {
      if (err instanceof PartnerApiError && err.status === 401) {
        invalidateSession();
        setStatistic(null);
        setTimeline(null);
        setError(null);
        return;
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : translate('Partner metrics could not be loaded.');
      setError(message);
      setStatistic(null);
      setTimeline(null);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    invalidateSession,
    getPartnerStatistic,
    getPartnerTimeline,
    range.from,
    range.to,
    granularity,
    translate,
  ]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    ensureSuppressedHatchPattern();
  }, [theme]);

  const currency = statistic?.currency ?? 'CHF';
  const hasPartial = timeline?.buckets.some((b) => b.partial) === true;

  const assetRows = useMemo(() => {
    if (!statistic) return [];
    const map = new Map<string, { volume: number | null; transactions: number | null }>();
    for (const a of statistic.breakdown.assets) {
      const key = a.blockchain ? `${a.name} (${a.blockchain})` : a.name;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { volume: a.volume, transactions: a.transactions });
        continue;
      }
      const nextVol =
        a.volume == null && prev.volume == null
          ? null
          : (prev.volume ?? 0) + (a.volume ?? 0);
      const nextTx =
        a.transactions == null && prev.transactions == null
          ? null
          : (prev.transactions ?? 0) + (a.transactions ?? 0);
      const bothNullVolume = a.volume == null && prev.volume == null;
      const bothNullTx = a.transactions == null && prev.transactions == null;
      map.set(key, {
        volume: bothNullVolume ? null : nextVol,
        transactions: bothNullTx ? null : nextTx,
      });
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [statistic]);

  const themeClass = theme === 'light' ? 'theme-light' : 'theme-dark';

  // Auth gate: without a valid token (and not fixture), only the login screen is shown.
  // No KPI markup, no partner brand, no metrics fetch.
  if (!isAuthenticated) {
    return (
      <div
        id="partner-dashboard-root"
        className={`partner-dashboard ${themeClass}`}
        data-theme={theme}
        data-testid="partner-dashboard-root"
        data-auth="required"
      >
        <LoginScreen
          theme={theme}
          onThemeChange={setTheme}
          language={partnerLanguage}
          onLanguageChange={setPartnerLanguage}
          requestChallenge={auth.requestChallenge}
          signIn={auth.signIn}
        />
      </div>
    );
  }

  return (
    <div
      id="partner-dashboard-root"
      className={`partner-dashboard ${themeClass}`}
      data-theme={theme}
      data-testid="partner-dashboard-root"
      data-auth="ok"
      data-brand-fallback={brand.isFallback ? 'true' : 'false'}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <PartnerHeader
          brand={brand}
          isFixture={isFixture}
          theme={theme}
          onThemeChange={setTheme}
          language={partnerLanguage}
          onLanguageChange={setPartnerLanguage}
          onLogout={isFixture ? undefined : auth.logout}
        />

        <PeriodControls
          periodDays={periodDays}
          granularity={granularity}
          accent={brand.accent}
          onPeriodChange={setPeriodDays}
          onGranularityChange={setGranularity}
        />

        {loading && <DashboardSkeleton />}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => setReloadToken((t) => t + 1)} />
        )}

        {!loading && !error && statistic && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="kpi-grid">
              <KpiTile
                label={translate('Total volume')}
                value={statistic.totals.volume.total}
                format={(n) => formatAmountWhole(n, currency, locale)}
                testId="kpi-volume"
              />
              <KpiTile
                label={translate('Transactions')}
                value={statistic.totals.transactions.total}
                format={(n) => formatCount(n, locale)}
                testId="kpi-transactions"
              />
              <KpiTile
                label={translate('Average transaction size')}
                value={statistic.totals.averageTransactionVolume}
                format={(n) => formatAmount(n, currency, 2, locale)}
                testId="kpi-avg"
              />
              <KpiTile
                label={translate('Active users')}
                value={statistic.totals.activeUsers}
                format={(n) => formatCount(n, locale)}
                testId="kpi-active-users"
              />
              <KpiTile
                label={translate('New users')}
                value={statistic.totals.newUsers}
                format={(n) => formatCount(n, locale)}
                testId="kpi-new-users"
              />
              <KpiTile
                label={translate('Registered users (total)')}
                value={statistic.allTime.registeredUsers}
                format={(n) => formatCount(n, locale)}
                testId="kpi-registered"
              />
            </div>

            <ReferralBlock referral={statistic.referral} />

            {timeline && (
              <div className="space-y-4">
                <VolumeTimeChart timeline={timeline} theme={theme} />
                <TransactionsTimeChart timeline={timeline} theme={theme} />
                <PartialLegendNote hasPartial={hasPartial} />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <HorizontalBarList
                title={translate('Volume by cryptocurrency')}
                rows={assetRows}
                currency={currency}
                theme={theme}
                testId="bars-assets"
              />
              <HorizontalBarList
                title={translate('Fiat currencies')}
                rows={statistic.breakdown.fiatCurrencies}
                currency={currency}
                theme={theme}
                compact
                testId="bars-fiat"
              />
              <HorizontalBarList
                title={translate('Blockchains')}
                rows={statistic.breakdown.blockchains}
                currency={currency}
                theme={theme}
                compact
                testId="bars-blockchains"
              />
              <HorizontalBarList
                title={translate('Payment methods')}
                rows={statistic.breakdown.paymentMethods}
                currency={currency}
                theme={theme}
                compact
                testId="bars-payment-methods"
              />
            </div>

            <CompletionBlock completion={statistic.completion} />
          </>
        )}
      </div>
    </div>
  );
}
