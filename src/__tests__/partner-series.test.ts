import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';
import { buildPartnerTimelineFixture } from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import {
  hasActivity,
  rankNamedVolumes,
  sequentialColor,
  timelineSeries,
} from 'src/partner-dashboard/util/series';

function bucket(
  partial: Partial<PartnerTimelineBucket> & Pick<PartnerTimelineBucket, 'date'>,
): PartnerTimelineBucket {
  return {
    volume: { buy: 0, sell: 0, swap: 0 },
    transactions: { buy: 0, sell: 0, swap: 0 },
    partial: false,
    ...partial,
  };
}

describe('partner timeline series', () => {
  it('never returns a gap: every point is a real number, a day with no activity is the zero point', () => {
    const buckets: PartnerTimelineBucket[] = [
      bucket({
        date: '2026-06-01T00:00:00.000Z',
        volume: { buy: 100, sell: 10, swap: 5 },
        transactions: { buy: 2, sell: 1, swap: 1 },
      }),
      bucket({
        date: '2026-06-02T00:00:00.000Z',
        volume: { buy: 0, sell: 0, swap: 0 },
        transactions: { buy: 0, sell: 0, swap: 0 },
      }),
    ];

    const series = timelineSeries(buckets, 'volume', 'buy');
    expect(series).toHaveLength(2);
    expect(series[0][1]).toBe(100);
    // A day with no activity is the zero point on the curve — never a hole
    expect(series[1][1]).toBe(0);
    // The return type itself forbids null (Array<[number, number]>) — assert every
    // value really is a finite number at runtime too, not just at compile time.
    for (const field of ['volume', 'transactions'] as const) {
      for (const direction of ['buy', 'sell', 'swap'] as const) {
        for (const [, y] of timelineSeries(buckets, field, direction)) {
          expect(typeof y).toBe('number');
          expect(Number.isFinite(y)).toBe(true);
        }
      }
    }
  });

  it('passes every non-zero value through unchanged, including thin single-digit days (no withholding by magnitude)', () => {
    // Deliberately small, non-zero counts — the exact shape a k-anonymity threshold
    // used to null out. Every one of these must reach the series untouched.
    const buckets: PartnerTimelineBucket[] = [
      bucket({
        date: '2026-06-01T00:00:00.000Z',
        volume: { buy: 3, sell: 1, swap: 4 },
        transactions: { buy: 1, sell: 2, swap: 3 },
      }),
    ];

    expect(timelineSeries(buckets, 'volume', 'buy')[0][1]).toBe(3);
    expect(timelineSeries(buckets, 'volume', 'sell')[0][1]).toBe(1);
    expect(timelineSeries(buckets, 'volume', 'swap')[0][1]).toBe(4);
    expect(timelineSeries(buckets, 'transactions', 'buy')[0][1]).toBe(1);
    expect(timelineSeries(buckets, 'transactions', 'sell')[0][1]).toBe(2);
    expect(timelineSeries(buckets, 'transactions', 'swap')[0][1]).toBe(3);
  });

  it('fixture timeline still carries the partial flag from the API contract (data, not UI)', () => {
    // The dashboard renders nothing from `partial` anymore, but the API still sends it —
    // the field must survive on the data model even though no component reads it.
    const tl = buildPartnerTimelineFixture('Day');
    expect(tl.buckets[0].partial).toBe(true);
    expect(tl.buckets[tl.buckets.length - 1].partial).toBe(true);
  });

  it('fixture timeline bucket count grows with the requested period (30 / 90 / 365)', () => {
    const end = '2026-06-30T23:59:59.000Z';
    const rangeFor = (days: number) => {
      const from = new Date(end);
      from.setUTCDate(from.getUTCDate() - (days - 1));
      from.setUTCHours(0, 0, 0, 0);
      return { from: from.toISOString(), to: end };
    };
    const d30 = buildPartnerTimelineFixture('Day', rangeFor(30));
    const d90 = buildPartnerTimelineFixture('Day', rangeFor(90));
    const d365 = buildPartnerTimelineFixture('Day', rangeFor(365));
    expect(d30.buckets.length).toBe(30);
    expect(d90.buckets.length).toBe(90);
    expect(d365.buckets.length).toBe(365);
    expect(d30.buckets.length).toBeLessThan(d90.buckets.length);
    expect(d90.buckets.length).toBeLessThan(d365.buckets.length);
    // Acceptance fixture preserved on the default 30-day day series
    expect(d30.buckets[5].volume).toEqual({ buy: 0, sell: 0, swap: 0 });
    // Every other bucket carries real, non-zero data — the fixture is real throughout
    expect(d30.buckets[12].volume.buy).toBeGreaterThan(0);
  });

  it('fixture timeline Month granularity steps by ~30 days (fewer buckets than Day)', () => {
    const end = '2026-06-30T23:59:59.000Z';
    const from = new Date(end);
    from.setUTCDate(from.getUTCDate() - 364);
    from.setUTCHours(0, 0, 0, 0);
    const range = { from: from.toISOString(), to: end };
    const month = buildPartnerTimelineFixture('Month', range);
    const day = buildPartnerTimelineFixture('Day', range);
    expect(month.granularity).toBe('Month');
    // 365 days / 30 step ≈ 13 buckets — far fewer than daily
    expect(month.buckets.length).toBeLessThan(day.buckets.length);
    expect(month.buckets.length).toBeGreaterThanOrEqual(12);
    expect(month.buckets.length).toBeLessThanOrEqual(13);
  });

  it('buildPartnerTimelineFixture() without args uses Day default and default range', () => {
    const tl = buildPartnerTimelineFixture();
    expect(tl.granularity).toBe('Day');
    expect(tl.buckets.length).toBe(30);
  });

  it('coarse granularity with a short window yields bucketCount < 3 (zeroIdx = -1 branch)', () => {
    // 7-day window + Month step (30) → single bucket → zeroIdx falls to -1
    const tl = buildPartnerTimelineFixture('Month', {
      from: '2026-06-24T00:00:00.000Z',
      to: '2026-06-30T23:59:59.000Z',
    });
    expect(tl.buckets.length).toBe(1);
    // The only bucket is still partial (edge), not forced to the zero marker
    expect(tl.buckets[0].partial).toBe(true);
  });

  it('ranks named volumes descending', () => {
    const ranked = rankNamedVolumes([
      { name: 'B', volume: 10, transactions: 2 },
      { name: 'C', volume: 50, transactions: 5 },
      { name: 'D', volume: 0, transactions: 0 },
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['C', 'B', 'D']);
  });

  it('aggregates the tail as Sonstige when more rows than maxItems', () => {
    // 15 rows, maxItems 5 → head of 4 + one "Sonstige" summing the remaining 11
    const rows = Array.from({ length: 15 }, (_, i) => ({
      name: `Asset-${i}`,
      volume: 100 - i,
      transactions: i + 1,
    }));
    const ranked = rankNamedVolumes(rows, 5);
    expect(ranked).toHaveLength(5);
    expect(ranked.slice(0, 4).map((r) => r.name)).toEqual([
      'Asset-0',
      'Asset-1',
      'Asset-2',
      'Asset-3',
    ]);
    const sonstige = ranked[4];
    expect(sonstige.name).toBe('Sonstige');
    // Tail starts at index 4 (maxItems - 1) of the volume-sorted list
    const tail = [...rows].sort((a, b) => b.volume - a.volume).slice(4);
    expect(sonstige.volume).toBe(tail.reduce((s, r) => s + r.volume, 0));
    expect(sonstige.transactions).toBe(tail.reduce((s, r) => s + r.transactions, 0));
  });

  it('returns the full sorted list when length equals maxItems (no Sonstige)', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      name: `R${i}`,
      volume: i + 1,
      transactions: 1,
    }));
    const ranked = rankNamedVolumes(rows, 3);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.name)).not.toContain('Sonstige');
  });

  it('hasActivity drops only rows with zero volume AND zero transactions', () => {
    expect(hasActivity({ volume: 0, transactions: 0 })).toBe(false);
    // Either side alone being non-zero is still real activity
    expect(hasActivity({ volume: 0, transactions: 5 })).toBe(true);
    expect(hasActivity({ volume: 42, transactions: 0 })).toBe(true);
    expect(hasActivity({ volume: 42, transactions: 5 })).toBe(true);
  });

  it('sequentialColor defaults theme to dark and returns the first shade when total <= 1', () => {
    // Default-arg branch: omit theme → dark palette
    const defaulted = sequentialColor(0, 5);
    const explicitDark = sequentialColor(0, 5, 'dark');
    expect(defaulted).toBe(explicitDark);

    // total <= 1 → always palette[0]
    expect(sequentialColor(0, 1, 'light')).toBe(sequentialColor(0, 1, 'light'));
    expect(sequentialColor(99, 0, 'light')).toBe(sequentialColor(0, 1, 'light'));
  });
});
