import { partialXAnnotations } from 'src/partner-dashboard/components/partial-marker';
import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';

describe('partial x-axis annotations (D4)', () => {
  const buckets: PartnerTimelineBucket[] = [
    {
      date: '2026-06-01T00:00:00.000Z',
      volume: { buy: 100, sell: 10, swap: 5 },
      transactions: { buy: 4, sell: 1, swap: 1 },
      partial: true,
    },
    {
      date: '2026-06-02T00:00:00.000Z',
      volume: { buy: 50, sell: 5, swap: 2 },
      transactions: { buy: 2, sell: 1, swap: 0 },
      partial: false,
    },
    {
      date: '2026-06-30T00:00:00.000Z',
      volume: { buy: 80, sell: 8, swap: 3 },
      transactions: { buy: 3, sell: 1, swap: 1 },
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
      expect(JSON.stringify(ann)).not.toMatch(/incomplete|unvollständig/);
    }
  });

  it('skips non-partial buckets', () => {
    const onlyMiddle = partialXAnnotations([buckets[1]]);
    expect(onlyMiddle).toHaveLength(0);
  });
});
