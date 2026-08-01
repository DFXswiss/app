import { PartnerDirectionField, PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';

/**
 * Build ApexCharts series points for chart geometry.
 *
 * Suppressed buckets are linearly interpolated between neighboring real values so the
 * area/stroke continues (no visual hole). Those intermediate numbers are geometry only —
 * never show them in tooltips, tables, or labels; those paths must use `bucket.suppressed`
 * / null fields and render the absent placeholder (`ABSENT_LABEL`).
 *
 * Real zeros (suppressed === false, value 0) stay on the zero line. Non-suppressed nulls
 * remain null (no invented value).
 */
export function timelineSeries(
  buckets: PartnerTimelineBucket[],
  field: 'volume' | 'transactions',
  direction: PartnerDirectionField,
): Array<[number, number | null]> {
  const raw: Array<number | null> = buckets.map((bucket) => {
    if (bucket.suppressed) return null;
    const group = bucket[field];
    if (group == null) return null;
    return group[direction];
  });

  return buckets.map((bucket, i) => {
    const t = new Date(bucket.date).getTime();
    if (raw[i] != null) return [t, raw[i] as number];
    if (!bucket.suppressed) return [t, null];

    let leftI = -1;
    let leftV = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (raw[j] != null) {
        leftI = j;
        leftV = raw[j] as number;
        break;
      }
    }
    let rightI = -1;
    let rightV = 0;
    for (let j = i + 1; j < buckets.length; j++) {
      if (raw[j] != null) {
        rightI = j;
        rightV = raw[j] as number;
        break;
      }
    }

    let v: number;
    if (leftI >= 0 && rightI >= 0) {
      const frac = (i - leftI) / (rightI - leftI);
      v = leftV + (rightV - leftV) * frac;
    } else if (leftI >= 0) {
      v = leftV;
    } else if (rightI >= 0) {
      v = rightV;
    } else {
      v = 0;
    }
    return [t, v];
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

/** Compact sequential shade list from a single hue family (dfxBlue range). */
export const SEQUENTIAL_BAR_COLORS = [
  '#0A355C',
  '#124370',
  '#1a5a8a',
  '#2a6fa0',
  '#3d84b5',
  '#5A81BB',
  '#7a9bc9',
  '#9bb5d6',
] as const;

export function sequentialColor(index: number, total: number): string {
  if (total <= 1) return SEQUENTIAL_BAR_COLORS[0];
  const max = SEQUENTIAL_BAR_COLORS.length - 1;
  const step = Math.round((index / Math.max(total - 1, 1)) * max);
  const color = SEQUENTIAL_BAR_COLORS[Math.min(step, max)];
  return color;
}

export interface NamedVolumeRow {
  name: string;
  volume: number | null;
  transactions: number | null;
}

/** Sort descending by volume; nulls last. Aggregate tail as "Sonstige" if > maxItems. */
export function rankNamedVolumes(rows: NamedVolumeRow[], maxItems = 12): NamedVolumeRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.volume == null && b.volume == null) return 0;
    if (a.volume == null) return 1;
    if (b.volume == null) return -1;
    return b.volume - a.volume;
  });
  if (sorted.length <= maxItems) return sorted;
  const head = sorted.slice(0, maxItems - 1);
  const tail = sorted.slice(maxItems - 1);
  let vol = 0;
  let tx = 0;
  let hasVol = false;
  let hasTx = false;
  for (const row of tail) {
    if (row.volume != null) {
      vol += row.volume;
      hasVol = true;
    }
    if (row.transactions != null) {
      tx += row.transactions;
      hasTx = true;
    }
  }
  head.push({
    name: 'Sonstige',
    volume: hasVol ? vol : null,
    transactions: hasTx ? tx : null,
  });
  return head;
}
