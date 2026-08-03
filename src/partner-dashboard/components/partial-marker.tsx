import { PARTIAL_BAND_COLOR } from 'src/config/partner-dashboard.config';
import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';
import { getPartnerLocale, partnerTranslate, usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

/**
 * Visual treatment helper for partial timeline buckets (period edge).
 * Incomplete coverage is shown as chips under the chart — not as chart bands
 * (bands doubled the chips and dirtied the volume chart).
 */
export function PartialLegendNote({ hasPartial }: { hasPartial: boolean }): JSX.Element | null {
  const { translate } = usePartnerTranslation();
  if (!hasPartial) return null;
  return (
    <p className="text-2xs partner-text-tertiary mt-1" data-testid="partial-legend">
      {translate(
        'Dates marked incomplete only partially cover the selected period (start or end of the range).',
      )}
    </p>
  );
}

export function isPartialBucket(partial: boolean | undefined): boolean {
  return partial === true;
}

/**
 * Visible chips for every partial edge bucket — so partial coverage is obvious without hovering.
 */
export function PartialBucketMarkers({ buckets }: { buckets: PartnerTimelineBucket[] }): JSX.Element | null {
  const { translate, locale } = usePartnerTranslation();
  const partials = buckets.filter((b) => b.partial);
  if (partials.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5 mt-2"
      data-testid="partial-markers"
      aria-label={translate('Incomplete period sections')}
    >
      {partials.map((b) => {
        const label = new Date(b.date).toLocaleDateString(locale, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        return (
          <span
            key={b.date}
            data-testid="partial-marker"
            data-partial="true"
            data-date={b.date}
            className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded partner-chip"
          >
            {label} · {translate('incomplete')}
          </span>
        );
      })}
    </div>
  );
}

export interface PartialXAnnotation {
  x: number;
  x2: number;
  fillColor: string;
  opacity: number;
  borderColor: string;
  /** Intentionally no text label — labels overpaint the Y-axis (see D4). */
}

/**
 * ApexCharts x-axis annotations for partial buckets.
 * No longer used in timeline charts (chips under the chart carry the message).
 * Kept so existing unit tests of the helper remain meaningful.
 */
export function partialXAnnotations(buckets: PartnerTimelineBucket[]): PartialXAnnotation[] {
  const annotations: PartialXAnnotation[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    if (!bucket.partial) continue;
    const t = new Date(bucket.date).getTime();
    const next = buckets[i + 1];
    const t2 = next ? new Date(next.date).getTime() : t + 24 * 60 * 60 * 1000;
    annotations.push({
      x: t,
      x2: t2,
      fillColor: PARTIAL_BAND_COLOR,
      opacity: 0.22,
      borderColor: 'transparent',
    });
  }
  return annotations;
}

/** Pure helper for tooltips outside React — uses current i18n language. */
export function formatPartialValue(base: string): string {
  return partnerTranslate('{{value}} (incomplete)', { value: base });
}

export function formatBucketDate(iso: string, locale: string = getPartnerLocale()): string {
  return new Date(iso).toLocaleDateString(locale);
}
