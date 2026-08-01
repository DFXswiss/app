import { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { SERIES_COLORS, SERIES_LABELS } from 'src/config/partner-dashboard.config';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { ABSENT_LABEL, formatAmount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { timelineSeries } from 'src/partner-dashboard/util/series';
import { CollapsibleTable } from './collapsible-table';
import { EmptyState } from './empty-state';
import { formatPartialValue, PartialBucketMarkers, timelineXAnnotations } from './partial-marker';

export interface VolumeTimeChartProps {
  timeline: PartnerTimeline;
}

export function VolumeTimeChart({ timeline }: VolumeTimeChartProps): JSX.Element {
  const { buckets, currency } = timeline;
  const hasData = buckets.some((b) => b.volume != null);
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
      { name: seriesLabels.buy, data: timelineSeries(buckets, 'volume', 'buy') },
      { name: seriesLabels.sell, data: timelineSeries(buckets, 'volume', 'sell') },
      { name: seriesLabels.swap, data: timelineSeries(buckets, 'volume', 'swap') },
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
      fill: {
        type: 'solid',
        opacity: 0.55,
      },
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
          formatter: (val: number) =>
            val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0),
        },
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
            const base = formatAmount(val, currency, 2, locale);
            return partial ? formatPartialValue(base) : base;
          },
        },
      },
      markers: { size: 0, hover: { size: 4 } },
    };
  }, [currency, locale, partialFlags, suppressedFlags, xAnnotations]);

  const tableRows = buckets.map((b) => ({
    date: new Date(b.date).toLocaleDateString(locale),
    buy: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.buy, currency, 2, locale),
    sell: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.sell, currency, 2, locale),
    swap: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.swap, currency, 2, locale),
    note: b.partial ? incompleteWord : b.suppressed ? ABSENT_LABEL : '',
  }));

  const title = translate('Volume over time');

  return (
    <section className="bg-dfxBlue-700 rounded-lg shadow p-4" data-testid="volume-time-chart">
      <h2 className="text-sm font-semibold text-white mb-2">{title}</h2>
      {!hasData ? (
        <EmptyState message={translate('No volume data for the selected period.')} />
      ) : (
        <>
          <Chart type="area" height={300} options={options} series={series} />
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
