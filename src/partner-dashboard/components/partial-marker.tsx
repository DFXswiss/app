import { PARTIAL_BAND_COLOR, SUPPRESSED_BAND_COLOR } from 'src/config/partner-dashboard.config';
import { PartnerTimelineBucket } from 'src/dto/partner-statistic.dto';
import { getPartnerLocale, partnerTranslate, usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

/**
 * Visual treatment helper for partial timeline buckets (period edge).
 * Used by charts/tooltips; also rendered as a legend note when any bucket is partial.
 */
export function PartialLegendNote({ hasPartial }: { hasPartial: boolean }): JSX.Element | null {
  const { translate } = usePartnerTranslation();
  if (!hasPartial) return null;
  return (
    <p className="text-2xs text-dfxGray-700 mt-1" data-testid="partial-legend">
      <span
        className="inline-block w-3 h-2 mr-1 align-middle rounded-sm opacity-50 bg-dfxGray-700"
        aria-hidden="true"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)',
        }}
      />
      {translate(
        'Pale / hatched sections are incomplete — they only partially cover the period (period edge).',
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
            className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded border border-dashed border-dfxGray-700 text-dfxGray-600 bg-dfxBlue-800"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(154,165,184,0.15) 3px, rgba(154,165,184,0.15) 6px)',
            }}
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

export interface SuppressedXAnnotation {
  x: number;
  x2: number;
  fillColor: string;
  opacity: number;
  borderColor: string;
  /** Intentionally no text label — band alone marks suppressed days vs real zero. */
}

/**
 * ApexCharts x-axis annotations for partial buckets: pale band only, no in-chart text.
 * Explanation lives in chips under the chart and in tooltips.
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

/**
 * ApexCharts x-axis annotations for suppressed buckets: darker band only, no in-chart text.
 * Contiguous suppressed days merge into one range so the chart stays quiet.
 * Real zero days (suppressed === false) are never included.
 */
export function suppressedXAnnotations(buckets: PartnerTimelineBucket[]): SuppressedXAnnotation[] {
  const annotations: SuppressedXAnnotation[] = [];
  let i = 0;

  while (i < buckets.length) {
    if (!buckets[i].suppressed) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < buckets.length && buckets[i].suppressed) {
      i += 1;
    }
    const end = i - 1;
    const t = new Date(buckets[start].date).getTime();
    const after = buckets[end + 1];
    const t2 = after
      ? new Date(after.date).getTime()
      : new Date(buckets[end].date).getTime() + 24 * 60 * 60 * 1000;

    annotations.push({
      x: t,
      x2: t2,
      fillColor: SUPPRESSED_BAND_COLOR,
      opacity: 0.28,
      borderColor: 'transparent',
    });
  }

  return annotations;
}

/** Combined x-axis annotations for timeline charts (partial + suppressed). */
export function timelineXAnnotations(
  buckets: PartnerTimelineBucket[],
): Array<PartialXAnnotation | SuppressedXAnnotation> {
  return [...partialXAnnotations(buckets), ...suppressedXAnnotations(buckets)];
}

/** Pure helper for tooltips outside React — uses current i18n language. */
export function formatPartialValue(base: string): string {
  return partnerTranslate('{{value}} (incomplete)', { value: base });
}

export function formatBucketDate(iso: string, locale: string = getPartnerLocale()): string {
  return new Date(iso).toLocaleDateString(locale);
}
