import { ApexOptions } from 'apexcharts';
import { PartnerGranularity, PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';

/**
 * Shared X-axis tick strategy for both partner timeline charts.
 *
 * One pure selection of bucket indices (first + last always included, ~6–8
 * evenly spaced mid points) so volume and transactions charts stay aligned.
 * Labels sit on real buckets — not on Apex-invented intermediate timestamps.
 */

/** Target label count from chart width (px). Independent of bucket count. */
export function targetTimelineTickCount(chartWidthPx = 960): number {
  if (chartWidthPx < 400) return 4;
  if (chartWidthPx < 640) return 5;
  if (chartWidthPx < 900) return 7;
  return 8;
}

/**
 * Evenly spaced bucket indices including endpoints.
 * Returns sorted unique indices in `[0, bucketCount)`.
 */
export function selectTimelineTickIndices(bucketCount: number, maxTicks: number): number[] {
  if (bucketCount <= 0) return [];
  if (bucketCount === 1) return [0];

  const count = Math.max(2, Math.min(Math.floor(maxTicks), bucketCount));
  if (count === 2) return [0, bucketCount - 1];

  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    indices.add(Math.round((i * (bucketCount - 1)) / (count - 1)));
  }
  indices.add(0);
  indices.add(bucketCount - 1);
  return Array.from(indices).sort((a, b) => a - b);
}

/** Format a bucket date for the axis, following API granularity + active locale. */
export function formatTimelineTick(
  isoOrTs: string | number,
  granularity: PartnerGranularity,
  locale: string,
): string {
  const d = new Date(isoOrTs);
  if (Number.isNaN(d.getTime())) return '';

  switch (granularity) {
    case 'Month':
      return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    case 'Week':
      // Bucket date is the week start — day + month is the week label.
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    case 'Day':
    default:
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
}

export interface TimelineXAxisParams {
  buckets: PartnerTimelineBucket[];
  granularity: PartnerGranularity;
  locale: string;
  /** Axis label colour (from chart chrome). */
  axisColor: string;
  /** Optional measured chart width; defaults to a desktop card width. */
  chartWidthPx?: number;
}

/**
 * Apex x-axis + grid slice used by both timeline charts.
 * Category axis so ticks land on real buckets; only selected indices get text.
 *
 * Categories stay as ISO dates (annotation keys / series positions). Display text
 * is precomputed via `overwriteCategories` so we do not depend on Apex's
 * formatter `opts.i` (unreliable across Apex versions for category axes).
 */
export function buildTimelineXAxis(params: TimelineXAxisParams): Pick<ApexOptions, 'xaxis' | 'grid'> {
  const { buckets, granularity, locale, axisColor } = params;
  const maxTicks = targetTimelineTickCount(params.chartWidthPx ?? 960);
  const tickIndices = selectTimelineTickIndices(buckets.length, maxTicks);
  const tickSet = new Set(tickIndices);
  const categories = buckets.map((b) => b.date);
  const overwriteCategories = buckets.map((b, i) =>
    tickSet.has(i) ? formatTimelineTick(b.date, granularity, locale) : '',
  );

  return {
    xaxis: {
      type: 'category',
      categories,
      overwriteCategories,
      tickPlacement: 'on',
      labels: {
        show: true,
        rotate: 0,
        rotateAlways: false,
        hideOverlappingLabels: true,
        showDuplicates: false,
        trim: false,
        style: { colors: axisColor, fontSize: '11px' },
        // Fallback if overwriteCategories is ignored: map by category ISO value.
        formatter: (value: string) => {
          // When Apex passes the overwritten label, keep it; when it passes ISO, format.
          const idx = categories.indexOf(value);
          if (idx >= 0) {
            return tickSet.has(idx) ? formatTimelineTick(value, granularity, locale) : '';
          }
          return value;
        },
      },
      // Dense category axes would otherwise draw a tick per bucket (30–365).
      axisTicks: { show: false },
    },
    // Vertical grid per category would be noise on long ranges; y-grid stays.
    grid: {
      xaxis: { lines: { show: false } },
    },
  };
}

/**
 * Map timestamp-based x-annotations onto category keys (bucket ISO dates).
 * Keeps suppression-band geometry working after the axis switch to category.
 */
export function annotationsToCategories<T extends { x: number; x2?: number }>(
  annotations: T[],
  buckets: PartnerTimelineBucket[],
): Array<Omit<T, 'x' | 'x2'> & { x: string; x2?: string }> {
  if (buckets.length === 0) {
    return annotations.map((a) => ({
      ...a,
      x: new Date(a.x).toISOString(),
      x2: a.x2 != null ? new Date(a.x2).toISOString() : undefined,
    }));
  }

  const times = buckets.map((b) => new Date(b.date).getTime());

  const toCategory = (ts: number): string => {
    const exact = times.indexOf(ts);
    if (exact >= 0) return buckets[exact].date;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= ts) return buckets[i].date;
    }
    return buckets[buckets.length - 1].date;
  };

  return annotations.map((a) => ({
    ...a,
    x: toCategory(a.x),
    x2: a.x2 != null ? toCategory(a.x2) : undefined,
  }));
}

/** Y values only — pair with category x-axis from {@link buildTimelineXAxis}. */
export function timelineSeriesValues(
  points: Array<[number, number | null]>,
): Array<number | null> {
  return points.map(([, y]) => y);
}
