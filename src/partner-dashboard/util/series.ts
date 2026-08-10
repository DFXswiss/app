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

/** @deprecated Prefer sequentialColor(index, total, theme). Dark palette fallback. */
export const SEQUENTIAL_BAR_COLORS = SEQUENTIAL_BAR_COLORS_BY_THEME.dark;

export function sequentialColor(
  index: number,
  total: number,
  theme: PartnerTheme = 'dark',
): string {
  const palette = SEQUENTIAL_BAR_COLORS_BY_THEME[theme];
  if (total <= 1) return palette[0];
  // Cycle the contrast-safe palette so long lists never fall below 3:1.
  return palette[index % palette.length];
}

export interface NamedVolumeRow {
  name: string;
  volume: number;
  transactions: number;
}

/**
 * A row is unused (no activity at all) only when both volume and transactions are
 * exactly zero. A zero-volume row with real transactions (e.g. free transfers) or a
 * zero-transaction row with volume is still real activity and must not be dropped.
 */
export function hasActivity(row: Pick<NamedVolumeRow, 'volume' | 'transactions'>): boolean {
  return row.volume !== 0 || row.transactions !== 0;
}

/**
 * Sort descending by volume. Aggregate the tail into one "other" row when the list
 * exceeds `maxItems`, then re-sort so a large aggregate does not sit last and
 * inflate `maxVolume` for the bar scale.
 *
 * `otherLabel` is supplied by the caller so it can go through i18n (default English
 * base key "Other" — never hard-code a locale-specific word here).
 */
export function rankNamedVolumes(
  rows: NamedVolumeRow[],
  maxItems = 12,
  otherLabel = 'Other',
): NamedVolumeRow[] {
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
  head.push({ name: otherLabel, volume: vol, transactions: tx });
  return head.sort((a, b) => b.volume - a.volume);
}
