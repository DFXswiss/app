import {
  partialXAnnotations,
  suppressedXAnnotations,
  timelineXAnnotations,
} from 'src/partner-dashboard/components/partial-marker';
import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';

describe('partial x-axis annotations (D4)', () => {
  const buckets: PartnerTimelineBucket[] = [
    {
      date: '2026-06-01T00:00:00.000Z',
      volume: { buy: 100, sell: 10, swap: 5 },
      transactions: { buy: 4, sell: 1, swap: 1 },
      suppressed: false,
      partial: true,
    },
    {
      date: '2026-06-02T00:00:00.000Z',
      volume: { buy: 50, sell: 5, swap: 2 },
      transactions: { buy: 2, sell: 1, swap: 0 },
      suppressed: false,
      partial: false,
    },
    {
      date: '2026-06-30T00:00:00.000Z',
      volume: { buy: 80, sell: 8, swap: 3 },
      transactions: { buy: 3, sell: 1, swap: 1 },
      suppressed: false,
      partial: true,
    },
  ];

  it('emits pale bands for partial buckets without any in-chart text label', () => {
    const annotations = partialXAnnotations(buckets);
    expect(annotations).toHaveLength(2);
    for (const ann of annotations) {
      expect(ann.fillColor).toBeTruthy();
      expect(ann.opacity).toBeGreaterThan(0);
      // No label property — text in the plot area overpainted the Y-axis
      expect(ann).not.toHaveProperty('label');
      expect(JSON.stringify(ann)).not.toMatch(/unvollständig/);
    }
  });

  it('skips non-partial buckets', () => {
    const onlyMiddle = partialXAnnotations([buckets[1]]);
    expect(onlyMiddle).toHaveLength(0);
  });
});

describe('suppressed x-axis annotations', () => {
  const buckets: PartnerTimelineBucket[] = [
    {
      date: '2026-06-01T00:00:00.000Z',
      volume: { buy: 100, sell: 10, swap: 5 },
      transactions: { buy: 4, sell: 1, swap: 1 },
      suppressed: false,
      partial: false,
    },
    {
      date: '2026-06-02T00:00:00.000Z',
      volume: null,
      transactions: null,
      suppressed: true,
      partial: false,
    },
    {
      date: '2026-06-03T00:00:00.000Z',
      volume: { buy: 0, sell: 0, swap: 0 },
      transactions: { buy: 0, sell: 0, swap: 0 },
      suppressed: false,
      partial: false,
    },
  ];

  it('emits a band only for suppressed buckets, not for real zero — no in-chart text label', () => {
    const annotations = suppressedXAnnotations(buckets);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).not.toHaveProperty('label');
    expect(annotations[0].fillColor).toBeTruthy();
    expect(annotations[0].opacity).toBeGreaterThan(0);
    expect(annotations[0].x).toBe(new Date(buckets[1].date).getTime());
    // Real zero day (index 2) is not the annotation start
    expect(annotations[0].x).not.toBe(new Date(buckets[2].date).getTime());
  });

  it('merges contiguous suppressed days into one range', () => {
    const multi: PartnerTimelineBucket[] = [
      { ...buckets[0], date: '2026-06-01T00:00:00.000Z', suppressed: false },
      { ...buckets[1], date: '2026-06-02T00:00:00.000Z', suppressed: true },
      { ...buckets[1], date: '2026-06-03T00:00:00.000Z', suppressed: true },
      {
        date: '2026-06-04T00:00:00.000Z',
        volume: { buy: 10, sell: 1, swap: 0 },
        transactions: { buy: 1, sell: 0, swap: 0 },
        suppressed: false,
        partial: false,
      },
    ];
    const annotations = suppressedXAnnotations(multi);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].x).toBe(new Date(multi[1].date).getTime());
    expect(annotations[0].x2).toBe(new Date(multi[3].date).getTime());
  });

  it('timelineXAnnotations includes both partial and suppressed bands', () => {
    const mixed: PartnerTimelineBucket[] = [
      {
        date: '2026-06-01T00:00:00.000Z',
        volume: { buy: 100, sell: 10, swap: 5 },
        transactions: { buy: 4, sell: 1, swap: 1 },
        suppressed: false,
        partial: true,
      },
      {
        date: '2026-06-02T00:00:00.000Z',
        volume: null,
        transactions: null,
        suppressed: true,
        partial: false,
      },
    ];
    const combined = timelineXAnnotations(mixed);
    expect(combined.length).toBe(2);
    // Partial + suppressed bands, neither carries an in-chart text label
    for (const ann of combined) {
      expect(ann).not.toHaveProperty('label');
    }
  });
});

