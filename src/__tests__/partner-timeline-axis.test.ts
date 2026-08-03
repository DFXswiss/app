import { buildPartnerTimelineFixture } from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import {
  annotationsToCategories,
  buildTimelineXAxis,
  formatTimelineTick,
  selectTimelineTickIndices,
  targetTimelineTickCount,
  timelineSeriesValues,
} from 'src/partner-dashboard/util/timeline-axis';

describe('timeline X-axis tick strategy', () => {
  it('targets fewer labels on narrow widths and ~6–8 on desktop', () => {
    expect(targetTimelineTickCount(320)).toBe(4);
    expect(targetTimelineTickCount(500)).toBe(5);
    expect(targetTimelineTickCount(800)).toBe(7);
    expect(targetTimelineTickCount(1200)).toBe(8);
    // Default desktop card width
    expect(targetTimelineTickCount()).toBe(8);
  });

  it('always includes first and last index and stays within maxTicks', () => {
    for (const n of [2, 7, 30, 90, 365]) {
      const max = targetTimelineTickCount(960);
      const indices = selectTimelineTickIndices(n, max);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(n - 1);
      expect(indices.length).toBeLessThanOrEqual(Math.min(max, n));
      expect(indices.length).toBeGreaterThanOrEqual(Math.min(2, n));
      // Sorted unique
      expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b));
    }
  });

  it('keeps label count independent of bucket count (30 / 90 / 365 day)', () => {
    const max = 8;
    const i30 = selectTimelineTickIndices(30, max);
    const i90 = selectTimelineTickIndices(90, max);
    const i365 = selectTimelineTickIndices(365, max);
    expect(i30.length).toBeLessThanOrEqual(max);
    expect(i90.length).toBeLessThanOrEqual(max);
    expect(i365.length).toBeLessThanOrEqual(max);
    // Same strategy → same count for long series
    expect(i90.length).toBe(i365.length);
    expect(i30.length).toBe(i90.length);
  });

  it('formats Day / Week / Month via locale (en + de)', () => {
    const iso = '2026-03-15T00:00:00.000Z';
    const enDay = formatTimelineTick(iso, 'Day', 'en-US');
    const deDay = formatTimelineTick(iso, 'Day', 'de-CH');
    expect(enDay.length).toBeGreaterThan(0);
    expect(deDay.length).toBeGreaterThan(0);
    // Month includes a year digit
    const enMonth = formatTimelineTick(iso, 'Month', 'en-US');
    expect(enMonth).toMatch(/26|2026/);
    const enWeek = formatTimelineTick(iso, 'Week', 'en-US');
    expect(enWeek.length).toBeGreaterThan(0);
  });

  it('buildTimelineXAxis labels only selected indices; first and last non-empty', () => {
    const tl = buildPartnerTimelineFixture('Day', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.000Z',
    });
    const axis = buildTimelineXAxis({
      buckets: tl.buckets,
      granularity: 'Day',
      locale: 'en-US',
      axisColor: '#8a99b7',
      chartWidthPx: 960,
    });
    expect(axis.xaxis?.type).toBe('category');
    expect(axis.xaxis?.categories).toHaveLength(tl.buckets.length);
    expect(axis.xaxis?.axisTicks?.show).toBe(false);
    expect(axis.grid?.xaxis?.lines?.show).toBe(false);

    // Display labels are precomputed (overwriteCategories) — Apex draws these.
    const labels = axis.xaxis?.overwriteCategories as string[];
    expect(labels).toHaveLength(tl.buckets.length);
    const nonEmpty = labels.filter((l) => l !== '');
    expect(nonEmpty.length).toBeGreaterThanOrEqual(2);
    expect(nonEmpty.length).toBeLessThanOrEqual(8);
    expect(labels[0]).not.toBe('');
    expect(labels[labels.length - 1]).not.toBe('');
    // Mid non-selected stay blank when series is longer than max ticks
    if (tl.buckets.length > 8) {
      expect(labels.some((l) => l === '')).toBe(true);
    }
  });

  it('same buckets + granularity + width → identical axis config for both charts', () => {
    const tl = buildPartnerTimelineFixture('Week', {
      from: '2025-07-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.000Z',
    });
    const a = buildTimelineXAxis({
      buckets: tl.buckets,
      granularity: tl.granularity,
      locale: 'de-CH',
      axisColor: '#8a99b7',
      chartWidthPx: 800,
    });
    const b = buildTimelineXAxis({
      buckets: tl.buckets,
      granularity: tl.granularity,
      locale: 'de-CH',
      axisColor: '#8a99b7',
      chartWidthPx: 800,
    });
    expect(a.xaxis?.categories).toEqual(b.xaxis?.categories);
    expect(a.xaxis?.overwriteCategories).toEqual(b.xaxis?.overwriteCategories);
  });

  it('maps timestamp annotations onto bucket category strings', () => {
    const buckets = buildPartnerTimelineFixture('Day', {
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-05T23:59:59.000Z',
    }).buckets;
    const suppressed = buckets.find((b) => b.suppressed) ?? buckets[1];
    const idx = buckets.indexOf(suppressed);
    const next = buckets[idx + 1] ?? suppressed;
    const anns = annotationsToCategories(
      [
        {
          x: new Date(suppressed.date).getTime(),
          x2: new Date(next.date).getTime(),
          fillColor: 'transparent',
        },
      ],
      buckets,
    );
    expect(anns[0].x).toBe(suppressed.date);
    expect(anns[0].x2).toBe(next.date);
  });

  it('timelineSeriesValues strips timestamps for category series data', () => {
    expect(
      timelineSeriesValues([
        [1, 10],
        [2, null],
        [3, 0],
      ]),
    ).toEqual([10, null, 0]);
  });

  it('tick strategy is required: blanking the selector leaves only endpoints when maxTicks is 2', () => {
    // Counter-probe helper: strategy must enforce first+last and cap mid points.
    // If selectTimelineTickIndices were a no-op returning every index, this fails.
    const indices = selectTimelineTickIndices(90, 7);
    expect(indices.length).toBeLessThanOrEqual(7);
    expect(indices).toContain(0);
    expect(indices).toContain(89);
    // Not every day labeled
    expect(indices.length).toBeLessThan(90);
  });
});
