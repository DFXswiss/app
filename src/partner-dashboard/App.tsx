import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPartnerBrand } from 'src/config/partner-dashboard.config';
import { PartnerGranularity, PartnerStatistic, PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { usePartnerDashboard } from 'src/hooks/partner-dashboard.hook';
import { CompletionBlock } from './components/completion-block';
import { ErrorState } from './components/error-state';
import { PartnerHeader } from './components/header';
import { HorizontalBarList } from './components/horizontal-bar-list';
import { KpiTile } from './components/kpi-tile';
import { PartialLegendNote } from './components/partial-marker';
import { PeriodControls, PeriodDays } from './components/period-controls';
import { ReferralBlock } from './components/referral-block';
import { DashboardSkeleton } from './components/skeleton';
import { TransactionsTimeChart } from './components/transactions-time-chart';
import { VolumeTimeChart } from './components/volume-time-chart';
import { formatAmount, formatAmountWhole, formatCount } from './util/format';
import { usePartnerTranslation } from './util/i18n';

function periodRange(days: PeriodDays): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function PartnerDashboardApp(): JSX.Element {
  const brand = getPartnerBrand();
  const { getPartnerStatistic, getPartnerTimeline, isFixture } = usePartnerDashboard();
  const { translate, locale } = usePartnerTranslation();

  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [granularity, setGranularity] = useState<PartnerGranularity>('Day');
  const [statistic, setStatistic] = useState<PartnerStatistic | null>(null);
  const [timeline, setTimeline] = useState<PartnerTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const range = useMemo(() => periodRange(periodDays), [periodDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = { from: range.from, to: range.to, granularity };
      const [stat, tl] = await Promise.all([getPartnerStatistic(query), getPartnerTimeline(query)]);
      setStatistic(stat);
      setTimeline(tl);
    } catch (err) {
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
  }, [getPartnerStatistic, getPartnerTimeline, range.from, range.to, granularity, translate]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const currency = statistic?.currency ?? 'CHF';
  const hasPartial = timeline?.buckets.some((b) => b.partial) === true;

  const assetRows = useMemo(() => {
    if (!statistic) return [];
    // Aggregate by asset name across directions for the bar list
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
      // If either side was only-null and the other had values, keep the sum; if both null stay null
      const bothNullVolume = a.volume == null && prev.volume == null;
      const bothNullTx = a.transactions == null && prev.transactions == null;
      map.set(key, {
        volume: bothNullVolume ? null : nextVol,
        transactions: bothNullTx ? null : nextTx,
      });
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [statistic]);

  return (
    <div className="min-h-screen w-full bg-dfxBlue-800 text-white overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <PartnerHeader brand={brand} isFixture={isFixture} />

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
                <VolumeTimeChart timeline={timeline} />
                <TransactionsTimeChart timeline={timeline} />
                <PartialLegendNote hasPartial={hasPartial} />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <HorizontalBarList
                title={translate('Volume by cryptocurrency')}
                rows={assetRows}
                currency={currency}
                testId="bars-assets"
              />
              <HorizontalBarList
                title={translate('Fiat currencies')}
                rows={statistic.breakdown.fiatCurrencies}
                currency={currency}
                compact
                testId="bars-fiat"
              />
              <HorizontalBarList
                title={translate('Blockchains')}
                rows={statistic.breakdown.blockchains}
                currency={currency}
                compact
                testId="bars-blockchains"
              />
              <HorizontalBarList
                title={translate('Payment methods')}
                rows={statistic.breakdown.paymentMethods}
                currency={currency}
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
