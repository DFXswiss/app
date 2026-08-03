import { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { SERIES_LABELS } from 'src/config/partner-dashboard.config';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { baseChartOptions } from 'src/partner-dashboard/util/chart-theme';
import { ABSENT_LABEL, formatAmount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { timelineSeries } from 'src/partner-dashboard/util/series';
import { PartnerTheme } from 'src/partner-dashboard/util/theme';
import {
  annotationsToCategories,
  buildTimelineXAxis,
  timelineSeriesValues,
} from 'src/partner-dashboard/util/timeline-axis';
import { CollapsibleTable } from './collapsible-table';
import { EmptyState } from './empty-state';
import { formatPartialValue, PartialBucketMarkers, timelineXAnnotations } from './partial-marker';

export interface VolumeTimeChartProps {
  timeline: PartnerTimeline;
  theme: PartnerTheme;
}

export function VolumeTimeChart({ timeline, theme }: VolumeTimeChartProps): JSX.Element {
  const { buckets, currency, granularity } = timeline;
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
      { name: seriesLabels.buy, data: timelineSeriesValues(timelineSeries(buckets, 'volume', 'buy')) },
      { name: seriesLabels.sell, data: timelineSeriesValues(timelineSeries(buckets, 'volume', 'sell')) },
      { name: seriesLabels.swap, data: timelineSeriesValues(timelineSeries(buckets, 'volume', 'swap')) },
    ],
    [buckets, seriesLabels],
  );

  const partialFlags = useMemo(() => buckets.map((b) => b.partial), [buckets]);
  const suppressedFlags = useMemo(() => buckets.map((b) => b.suppressed), [buckets]);
  const xAnnotations = useMemo(
    () => annotationsToCategories(timelineXAnnotations(buckets), buckets),
    [buckets],
  );
  const incompleteWord = translate('incomplete');

  const options = useMemo((): ApexOptions => {
    const base = baseChartOptions(theme);
    const axisColor = (base.xaxis?.labels?.style?.colors as string) ?? '';
    const timelineAxis = buildTimelineXAxis({
      buckets,
      granularity,
      locale,
      axisColor,
    });
    return {
      ...base,
      xaxis: {
        ...base.xaxis,
        ...timelineAxis.xaxis,
        labels: {
          ...base.xaxis?.labels,
          ...timelineAxis.xaxis?.labels,
          style: {
            ...base.xaxis?.labels?.style,
            ...timelineAxis.xaxis?.labels?.style,
          },
        },
        axisBorder: { ...base.xaxis?.axisBorder, ...timelineAxis.xaxis?.axisBorder },
        axisTicks: { ...base.xaxis?.axisTicks, ...timelineAxis.xaxis?.axisTicks },
      },
      grid: {
        ...base.grid,
        ...timelineAxis.grid,
        xaxis: { ...timelineAxis.grid?.xaxis },
      },
      yaxis: {
        labels: {
          style: { colors: axisColor },
          formatter: (val: number) =>
            val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0),
        },
      },
      annotations: {
        xaxis: xAnnotations,
      },
      tooltip: {
        ...base.tooltip,
        x: {
          formatter: (_val, opts) => {
            const idx = opts?.dataPointIndex ?? 0;
            const iso = buckets[idx]?.date;
            return iso ? new Date(iso).toLocaleDateString(locale) : '';
          },
        },
        y: {
          formatter: (val: number | null, opts) => {
            const idx = opts.dataPointIndex;
            // Geometry may interpolate suppressed points — never surface that as a value.
            if (suppressedFlags[idx] === true || val == null || Number.isNaN(val)) {
              return ABSENT_LABEL;
            }
            const partial = partialFlags[idx] === true;
            const amount = formatAmount(val, currency, 2, locale);
            return partial ? formatPartialValue(amount) : amount;
          },
        },
      },
    };
  }, [buckets, currency, granularity, locale, partialFlags, suppressedFlags, theme, xAnnotations]);

  const tableRows = buckets.map((b) => ({
    date: new Date(b.date).toLocaleDateString(locale),
    buy: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.buy, currency, 2, locale),
    sell: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.sell, currency, 2, locale),
    swap: b.volume == null ? ABSENT_LABEL : formatAmount(b.volume.swap, currency, 2, locale),
    note: b.partial ? incompleteWord : b.suppressed ? ABSENT_LABEL : '',
  }));

  const title = translate('Volume over time');
  const description = translate(
    'Shows how much was traded in each period, split into buy, sell and swap.',
  );

  return (
    <section className="partner-card partner-chart-root" data-testid="volume-time-chart">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
        {title}
      </h2>
      <p className="text-2xs partner-text-secondary mb-2" data-testid="volume-chart-description">
        {description}
      </p>
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
