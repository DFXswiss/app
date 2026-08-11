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
import { buildTimelineXAxis, timelineSeriesValues } from 'src/partner-dashboard/util/timeline-axis';
import { CollapsibleTable } from './collapsible-table';
import { EmptyState } from './empty-state';

export interface VolumeTimeChartProps {
  timeline: PartnerTimeline;
  theme: PartnerTheme;
}

export function VolumeTimeChart({ timeline, theme }: VolumeTimeChartProps): JSX.Element {
  const { buckets, currency, granularity } = timeline;
  // Every bucket always carries a real volume group — "no data" only means an empty period.
  const hasData = buckets.length > 0;
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
          formatter: (val: number) => {
            if (Number.isNaN(val)) {
              return ABSENT_LABEL;
            }
            return formatAmount(val, currency, 2, locale);
          },
        },
      },
    };
  }, [buckets, currency, granularity, locale, theme]);

  const tableRows = buckets.map((b) => ({
    date: new Date(b.date).toLocaleDateString(locale),
    buy: formatAmount(b.volume.buy, currency, 2, locale),
    sell: formatAmount(b.volume.sell, currency, 2, locale),
    swap: formatAmount(b.volume.swap, currency, 2, locale),
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
          <CollapsibleTable
            title={title}
            columns={[
              { key: 'date', header: translate('Date') },
              { key: 'buy', header: seriesLabels.buy, align: 'right' },
              { key: 'sell', header: seriesLabels.sell, align: 'right' },
              { key: 'swap', header: seriesLabels.swap, align: 'right' },
            ]}
            rows={tableRows}
          />
        </>
      )}
    </section>
  );
}
