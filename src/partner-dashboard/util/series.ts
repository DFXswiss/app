import { PartnerDirectionField, PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';
import { PartnerTheme, SEQUENTIAL_BAR_COLORS_BY_THEME } from './theme';

/**
 * Build ApexCharts series points for chart geometry.
 *
 * The API contract guarantees every bucket carries a real `volume`/`transactions`
 * group for every direction (days without activity are filled with real zeros
 * server-side) — there is no "absent" case to represent. A thin day is a low
 * point on the curve; a day with no activity is the zero point. Never a hole.
 * The return type has no `null` so a gap cannot be reintroduced here by accident.
 */
export function timelineSeries(
  buckets: PartnerTimelineBucket[],
  field: 'volume' | 'transactions',
  direction: PartnerDirectionField,
): Array<[number, number]> {
  return buckets.map((bucket) => {
    const t = new Date(bucket.date).getTime();
    return [t, bucket[field][direction]];
  });
}

export function bucketIsPartial(buckets: PartnerTimelineBucket[], index: number): boolean {
  const bucket = buckets[index];
  return bucket != null && bucket.partial === true;
}

/** Opacity for a bucket: partial edge buckets are drawn paler. */
export function bucketOpacity(partial: boolean): number {
  return partial ? 0.35 : 0.75;
}

/** @deprecated Prefer sequentialColor(index, total, theme). Dark palette fallback. */
export const SEQUENTIAL_BAR_COLORS = SEQUENTIAL_BAR_COLORS_BY_THEME.dark;

export function sequentialColor(
  index: number,
  total: number,
  theme: PartnerTheme = 'dark',
): string {
  const palette = SEQUENTIAL_BAR_COLORS_BY_THEME[theme];
  if (total <= 1) return palette[0];
  const max = palette.length - 1;
  const step = Math.round((index / Math.max(total - 1, 1)) * max);
  return palette[Math.min(step, max)];
}

export interface NamedVolumeRow {
  name: string;
  volume: number;
  transactions: number;
}

/** Sort descending by volume. Aggregate tail as "Sonstige" if > maxItems. */
export function rankNamedVolumes(rows: NamedVolumeRow[], maxItems = 12): NamedVolumeRow[] {
  const sorted = [...rows].sort((a, b) => b.volume - a.volume);
  if (sorted.length <= maxItems) return sorted;
  const head = sorted.slice(0, maxItems - 1);
  const tail = sorted.slice(maxItems - 1);
  let vol = 0;
  let tx = 0;
  for (const row of tail) {
    vol += row.volume;
    tx += row.transactions;
  }
  head.push({ name: 'Sonstige', volume: vol, transactions: tx });
  return head;
}
