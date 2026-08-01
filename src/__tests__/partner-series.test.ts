import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';
import { isPartialBucket } from 'src/partner-dashboard/components/partial-marker';
import { buildPartnerTimelineFixture } from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import { rankNamedVolumes, timelineSeries } from 'src/partner-dashboard/util/series';

function bucket(
  partial: Partial<PartnerTimelineBucket> & Pick<PartnerTimelineBucket, 'date'>,
): PartnerTimelineBucket {
  return {
    volume: null,
    transactions: null,
    suppressed: false,
    partial: false,
    ...partial,
  };
}

describe('partner timeline series', () => {
  it('interpolates suppressed buckets for geometry (no hole) while real zero stays 0', () => {
    const buckets: PartnerTimelineBucket[] = [
      bucket({
        date: '2026-06-01T00:00:00.000Z',
        volume: { buy: 100, sell: 10, swap: 5 },
        transactions: { buy: 2, sell: 1, swap: 1 },
      }),
      bucket({
        date: '2026-06-02T00:00:00.000Z',
        volume: null,
        transactions: null,
        suppressed: true,
      }),
      bucket({
        date: '2026-06-03T00:00:00.000Z',
        volume: { buy: 0, sell: 0, swap: 0 },
        transactions: { buy: 0, sell: 0, swap: 0 },
      }),
    ];

    const series = timelineSeries(buckets, 'volume', 'buy');
    expect(series).toHaveLength(3);
    expect(series[0][1]).toBe(100);
    // Geometry bridge — not null (would tear the area) and not forced to 0 (would look like zero-activity)
    expect(series[1][1]).toBe(50);
    expect(series[2][1]).toBe(0);
  });

  it('marks partial buckets separately from suppressed ones', () => {
    const partial = bucket({
      date: '2026-06-01T00:00:00.000Z',
      volume: { buy: 50, sell: 5, swap: 1 },
      transactions: { buy: 3, sell: 1, swap: 0 },
      partial: true,
    });
    const suppressed = bucket({
      date: '2026-06-02T00:00:00.000Z',
      suppressed: true,
      partial: false,
    });

    expect(isPartialBucket(partial.partial)).toBe(true);
    expect(isPartialBucket(suppressed.partial)).toBe(false);
    expect(partial.suppressed).toBe(false);
    expect(suppressed.suppressed).toBe(true);
  });

  it('fixture timeline has partial edge buckets at both ends', () => {
    const tl = buildPartnerTimelineFixture('Day');
    expect(tl.buckets[0].partial).toBe(true);
    expect(tl.buckets[tl.buckets.length - 1].partial).toBe(true);
    expect(tl.buckets.some((b) => b.suppressed)).toBe(true);
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
    // Acceptance fixtures preserved on the default 30-day day series
    expect(d30.buckets[5].volume).toEqual({ buy: 0, sell: 0, swap: 0 });
    expect(d30.buckets[5].suppressed).toBe(false);
    expect(d30.buckets[12].suppressed).toBe(true);
    expect(d30.buckets[12].volume).toBeNull();
  });

  it('ranks named volumes descending and keeps nulls last', () => {
    const ranked = rankNamedVolumes([
      { name: 'B', volume: 10, transactions: 2 },
      { name: 'A', volume: null, transactions: null },
      { name: 'C', volume: 50, transactions: 5 },
      { name: 'D', volume: 0, transactions: 0 },
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['C', 'B', 'D', 'A']);
  });
});
