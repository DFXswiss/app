import { useState } from 'react';
import {
  CompletionState,
  SERIES_LABELS,
  STATE_COLORS,
} from 'src/config/partner-dashboard.config';
import {
  PARTNER_DIRECTION_FIELDS,
  PartnerCompletion,
  PartnerDirectionField,
  PartnerPaymentInfoDirection,
  PartnerSettlementDirection,
} from 'src/dto/partner-statistic.dto';
import { formatCount, formatPercent } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { KpiTile } from './kpi-tile';

const DIRECTIONS = PARTNER_DIRECTION_FIELDS;

export interface CompletionSegment {
  label: string;
  value: number | null;
  state: CompletionState;
  color: string;
}

/** Pure helper for tests and rendering — Stage A segments, shared state scale. English base labels. */
export function stageASegments(data: PartnerPaymentInfoDirection): CompletionSegment[] {
  return [
    { label: 'Payment received', value: data.paymentReceived, state: 'good', color: STATE_COLORS.good },
    { label: 'Waiting for payment', value: data.waitingForPayment, state: 'pending', color: STATE_COLORS.pending },
    { label: 'No payment', value: data.noPaymentReceived, state: 'absent', color: STATE_COLORS.absent },
  ];
}

/** Pure helper for tests and rendering — Stage B segments, same state scale as Stage A. */
export function stageBSegments(data: PartnerSettlementDirection): CompletionSegment[] {
  return [
    { label: 'Delivered', value: data.delivered, state: 'good', color: STATE_COLORS.good },
    { label: 'In progress', value: data.inProgress, state: 'pending', color: STATE_COLORS.pending },
    { label: 'Rejected', value: data.rejected, state: 'rejected', color: STATE_COLORS.rejected },
  ];
}

export interface CompletionBlockProps {
  completion: PartnerCompletion;
}

function InfoTooltip({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const { translate } = usePartnerTranslation();
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <button
        type="button"
        className="w-4 h-4 rounded-full text-2xs partner-muted-fill partner-text-secondary hover:opacity-90"
        aria-label={translate('More information')}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-10 left-0 top-5 w-64 p-2 text-2xs leading-snug partner-tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function StackedDirectionBar({
  segments,
  testId,
}: {
  segments: CompletionSegment[];
  testId: string;
}): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  const known = segments.filter((s): s is CompletionSegment & { value: number } => s.value != null);
  const total = known.reduce((s, x) => s + x.value, 0);
  const displaySegments = segments.map((s) => ({ ...s, label: translate(s.label) }));

  if (known.length === 0) {
    return (
      <div data-testid={testId}>
        <div className="h-4 rounded partner-gap-bar" />
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div
        className="flex h-4 rounded overflow-hidden partner-track"
        role="img"
        aria-label={displaySegments.map((s) => `${s.label}: ${s.value ?? '–'}`).join(', ')}
      >
        {known.map((seg) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          if (pct <= 0) return null;
          const label = translate(seg.label);
          return (
            <div
              key={seg.label}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${label}: ${formatCount(seg.value, locale)}`}
              data-state={seg.state}
              data-color={seg.color}
              data-testid={`segment-${seg.state}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-2xs partner-text-tertiary">
        {displaySegments.map((seg) => (
          <span
            key={seg.label}
            className="inline-flex items-center gap-1"
            data-state={seg.state}
            data-color={seg.color}
            data-testid={`legend-${seg.state}`}
          >
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: seg.color }} aria-hidden="true" />
            {seg.label}: {seg.value == null ? '–' : formatCount(seg.value, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StageARow({
  direction,
  data,
}: {
  direction: PartnerDirectionField;
  data: PartnerPaymentInfoDirection;
}): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  return (
    <div className="space-y-1.5" data-testid={`stage-a-${direction}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium partner-text-secondary">{translate(SERIES_LABELS[direction])}</span>
        <span className="partner-text-tertiary">
          {translate('Rate: {{rate}}', {
            rate: data.receivedRate == null ? '–' : formatPercent(data.receivedRate, 1, locale),
          })}
        </span>
      </div>
      <StackedDirectionBar testId={`stage-a-bar-${direction}`} segments={stageASegments(data)} />
      <p className="text-2xs partner-text-tertiary">
        {translate('Requested:')}{' '}
        {data.requested == null ? (
          <span data-testid={`stage-a-requested-null-${direction}`}>–</span>
        ) : (
          formatCount(data.requested, locale)
        )}
      </p>
    </div>
  );
}

function StageBRow({
  direction,
  data,
}: {
  direction: PartnerDirectionField;
  data: PartnerSettlementDirection;
}): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  return (
    <div className="space-y-1.5" data-testid={`stage-b-${direction}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium partner-text-secondary">{translate(SERIES_LABELS[direction])}</span>
        <span className="partner-text-tertiary">
          {translate('Rate: {{rate}}', {
            rate: data.deliveredRate == null ? '–' : formatPercent(data.deliveredRate, 1, locale),
          })}
        </span>
      </div>
      <StackedDirectionBar testId={`stage-b-bar-${direction}`} segments={stageBSegments(data)} />
      <p className="text-2xs partner-text-tertiary">
        {translate('Received:')} {data.received == null ? '–' : formatCount(data.received, locale)}
      </p>
    </div>
  );
}

function overallRate(
  directions: readonly PartnerDirectionField[],
  pick: (d: PartnerDirectionField) => number | null,
  den: (d: PartnerDirectionField) => number | null,
): number | null {
  let num = 0;
  let denom = 0;
  let any = false;
  for (const d of directions) {
    const n = pick(d);
    const dd = den(d);
    if (n == null || dd == null) continue;
    any = true;
    num += n;
    denom += dd;
  }
  if (!any || denom === 0) return null;
  return num / denom;
}

/**
 * Two separate completion stages — never a funnel and never labelled as "Conversion".
 * State colours come only from STATE_COLORS (not SERIES_COLORS).
 */
export function CompletionBlock({ completion }: CompletionBlockProps): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  const stageARate = overallRate(
    DIRECTIONS,
    (d) => completion.paymentInfoRequests[d].paymentReceived,
    (d) => completion.paymentInfoRequests[d].requested,
  );
  const stageBRate = overallRate(
    DIRECTIONS,
    (d) => completion.settlement[d].delivered,
    (d) => completion.settlement[d].received,
  );

  return (
    <div className="space-y-4" data-testid="completion-block">
      <section className="partner-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {translate('Payment info requests with successful payment')}
            <InfoTooltip
              text={translate(
                'A payment info request is created every time payment information is retrieved (e.g. on every amount change in the interface), not once per purchase intent. The rate is therefore not a conversion rate.',
              )}
            />
          </h2>
          <div className="w-full sm:w-48">
            <KpiTile
              label={translate('Stage A — rate')}
              value={stageARate}
              format={(n) => formatPercent(n, 1, locale)}
              testId="stage-a-rate-kpi"
            />
          </div>
        </div>
        <div className="space-y-4">
          {DIRECTIONS.map((d) => (
            <StageARow key={d} direction={d} data={completion.paymentInfoRequests[d]} />
          ))}
        </div>
      </section>

      <section className="partner-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {translate('Received payments that were delivered')}
            <InfoTooltip
              text={translate(
                'Share of received payments that were delivered — including rejected and still-in-progress transactions.',
              )}
            />
          </h2>
          <div className="w-full sm:w-48">
            <KpiTile
              label={translate('Stage B — rate')}
              value={stageBRate}
              format={(n) => formatPercent(n, 1, locale)}
              testId="stage-b-rate-kpi"
            />
          </div>
        </div>
        <div className="space-y-4">
          {DIRECTIONS.map((d) => (
            <StageBRow key={d} direction={d} data={completion.settlement[d]} />
          ))}
        </div>
      </section>
    </div>
  );
}
