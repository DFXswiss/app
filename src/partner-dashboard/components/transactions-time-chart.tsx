import { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { SERIES_COLORS, SERIES_LABELS } from 'src/config/partner-dashboard.config';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { ABSENT_LABEL, formatCount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { timelineSeries } from 'src/partner-dashboard/util/series';
import { CollapsibleTable } from './collapsible-table';
import { EmptyState } from './empty-state';
import { formatPartialValue, PartialBucketMarkers, timelineXAnnotations } from './partial-marker';

export interface TransactionsTimeChartProps {
  timeline: PartnerTimeline;
}

/** Separate chart for transaction counts — never a second Y-axis on the volume chart. */
export function TransactionsTimeChart({ timeline }: TransactionsTimeChartProps): JSX.Element {
  const { buckets } = timeline;
  const hasData = buckets.some((b) => b.transactions != null);
  const { translate, locale } = usePartnerTranslation();

  const seriesLabels = useMemo(
    () => ({
      buy: translate(SERIES_LABELS.buy),
      sell: translate(SERIES_LABELS.sell),
      swap: translate(SERIES_LABELS.swap),
    }),
    [translate],
  );

  const series = useMemo(
    () => [
      { name: seriesLabels.buy, data: timelineSeries(buckets, 'transactions', 'buy') },
      { name: seriesLabels.sell, data: timelineSeries(buckets, 'transactions', 'sell') },
      { name: seriesLabels.swap, data: timelineSeries(buckets, 'transactions', 'swap') },
    ],
    [buckets, seriesLabels],
  );

  const partialFlags = useMemo(() => buckets.map((b) => b.partial), [buckets]);
  const suppressedFlags = useMemo(() => buckets.map((b) => b.suppressed), [buckets]);
  const xAnnotations = useMemo(() => timelineXAnnotations(buckets), [buckets]);
  const incompleteWord = translate('incomplete');

  const options = useMemo((): ApexOptions => {
    return {
      chart: {
        type: 'area',
        stacked: true,
        toolbar: { show: false },
        background: '0',
        zoom: { enabled: false },
        animations: { enabled: false },
      },
      theme: { mode: 'dark' },
      stroke: { width: 1.5, curve: 'smooth' },
      colors: [SERIES_COLORS.buy, SERIES_COLORS.sell, SERIES_COLORS.swap],
      dataLabels: { enabled: false },
      fill: { type: 'solid', opacity: 0.55 },
      grid: { borderColor: '#0A355C', strokeDashArray: 3 },
      xaxis: {
        type: 'datetime',
        labels: { datetimeUTC: false, style: { colors: '#9AA5B8' } },
        axisBorder: { color: '#0A355C' },
        axisTicks: { color: '#0A355C' },
      },
      yaxis: {
        labels: {
          style: { colors: '#9AA5B8' },
          formatter: (val: number) => formatCount(Math.round(val), locale),
        },
        forceNiceScale: true,
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        labels: { colors: '#D6DBE2' },
      },
      annotations: {
        xaxis: xAnnotations,
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: 'dark',
        x: { format: 'dd MMM yyyy' },
        y: {
          formatter: (val: number | null, opts) => {
            const idx = opts.dataPointIndex;
            // Geometry may interpolate suppressed points — never surface that as a value.
            if (suppressedFlags[idx] === true || val == null || Number.isNaN(val)) {
              return ABSENT_LABEL;
            }
            const partial = partialFlags[idx] === true;
            const base = formatCount(Math.round(val), locale);
            return partial ? formatPartialValue(base) : base;
          },
        },
      },
      markers: { size: 0, hover: { size: 4 } },
    };
  }, [locale, partialFlags, suppressedFlags, xAnnotations]);

  const tableRows = buckets.map((b) => ({
    date: new Date(b.date).toLocaleDateString(locale),
    buy: b.transactions == null ? ABSENT_LABEL : formatCount(b.transactions.buy, locale),
    sell: b.transactions == null ? ABSENT_LABEL : formatCount(b.transactions.sell, locale),
    swap: b.transactions == null ? ABSENT_LABEL : formatCount(b.transactions.swap, locale),
    note: b.partial ? incompleteWord : b.suppressed ? ABSENT_LABEL : '',
  }));

  const title = translate('Count over time');

  return (
    <section className="bg-dfxBlue-700 rounded-lg shadow p-4" data-testid="transactions-time-chart">
      <h2 className="text-sm font-semibold text-white mb-2">{title}</h2>
      {!hasData ? (
        <EmptyState message={translate('No transaction data for the selected period.')} />
      ) : (
        <>
          <Chart type="area" height={280} options={options} series={series} />
          <PartialBucketMarkers buckets={buckets} />
          <CollapsibleTable
            title={title}
            columns={[
              { key: 'date', header: translate('Date') },
              { key: 'buy', header: seriesLabels.buy, align: 'right' },
              { key: 'sell', header: seriesLabels.sell, align: 'right' },
              { key: 'swap', header: seriesLabels.swap, align: 'right' },
              { key: 'note', header: translate('Note') },
            ]}
            rows={tableRows}
          />
        </>
      )}
    </section>
  );
}
