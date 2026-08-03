import { useCallback, useEffect, useMemo, useState } from 'react';
import { PartnerBrand } from 'src/config/partner-dashboard.config';
import { PartnerGranularity, PartnerStatistic, PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { usePartnerAuth } from 'src/hooks/partner-auth.hook';
import { PartnerApiError, usePartnerDashboard } from 'src/hooks/partner-dashboard.hook';
import { ErrorState } from './components/error-state';
import { PartnerHeader } from './components/header';
import { HorizontalBarList } from './components/horizontal-bar-list';
import { KpiTile } from './components/kpi-tile';
import { LoginScreen } from './components/login-screen';
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
import {
  computeConversionRate,
  formatAmount,
  formatAmountWhole,
  formatCount,
  formatPercent,
} from './util/format';
import { usePartnerTranslation } from './util/i18n';
import { usePartnerTheme } from './util/theme';

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

  const currency = statistic?.currency ?? 'CHF';
  const conversionRate =
    statistic != null
      ? computeConversionRate(statistic.allTime.tradingUsers, statistic.allTime.registeredUsers)
      : null;

  const assetRows = useMemo(() => {
    if (!statistic) return [];
    const map = new Map<string, { volume: number; transactions: number }>();
    for (const a of statistic.breakdown.assets) {
      const key = a.blockchain ? `${a.name} (${a.blockchain})` : a.name;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { volume: a.volume, transactions: a.transactions });
        continue;
      }
      map.set(key, {
        volume: prev.volume + a.volume,
        transactions: prev.transactions + a.transactions,
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

        {loading && <DashboardSkeleton />}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => setReloadToken((t) => t + 1)} />
        )}

        {!loading && !error && statistic && (
          <>
            <section className="space-y-3" data-testid="kpi-period-section">
              <h2
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--text)' }}
                data-testid="kpi-period-heading"
              >
                {translate('This period')}
              </h2>
              <PeriodControls
                periodDays={periodDays}
                granularity={granularity}
                accent={brand.accent}
                onPeriodChange={setPeriodDays}
                onGranularityChange={setGranularity}
              />
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="kpi-grid">
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
              </div>
            </section>

            <section className="space-y-3 mt-1" data-testid="kpi-alltime-section">
              <h2
                className="text-xs font-semibold uppercase tracking-wide mb-3 partner-text-tertiary"
                data-testid="kpi-alltime-heading"
              >
                {translate('All-time totals')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-alltime-grid">
                <KpiTile
                  label={translate('Registered users (total)')}
                  value={statistic.allTime.registeredUsers}
                  format={(n) => formatCount(n, locale)}
                  testId="kpi-registered"
                />
                <KpiTile
                  label={translate('Trading users (total)')}
                  value={statistic.allTime.tradingUsers}
                  format={(n) => formatCount(n, locale)}
                  caption={
                    conversionRate == null
                      ? translate('No registered users yet')
                      : `${formatPercent(conversionRate, 1, locale)} ${translate('of registered users')}`
                  }
                  testId="kpi-trading-users"
                />
                <KpiTile
                  label={translate('Lifetime volume')}
                  value={statistic.allTime.volume.total}
                  format={(n) => formatAmountWhole(n, currency, locale)}
                  caption={`${translate('Buy')}: ${formatAmountWhole(statistic.allTime.volume.buy, currency, locale)} · ${translate(
                    'Sell',
                  )}: ${formatAmountWhole(statistic.allTime.volume.sell, currency, locale)}`}
                  testId="kpi-lifetime-volume"
                />
              </div>
            </section>

            <ReferralBlock referral={statistic.referral} />

            {timeline && (
              <div className="space-y-4">
                <VolumeTimeChart timeline={timeline} theme={theme} />
                <TransactionsTimeChart timeline={timeline} theme={theme} />
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
          </>
        )}
      </div>
    </div>
  );
}
