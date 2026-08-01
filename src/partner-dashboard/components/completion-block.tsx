import { useState } from 'react';
import {
  CompletionState,
  SERIES_LABELS,
  STATE_COLORS,
} from 'src/config/partner-dashboard.config';
import {
  PartnerCompletion,
  PartnerDirection,
  PartnerPaymentInfoDirection,
  PartnerSettlementDirection,
} from 'src/dto/partner-statistic.dto';
import { formatCount, formatPercent } from 'src/partner-dashboard/util/format';
import { KpiTile } from './kpi-tile';

const DIRECTIONS: PartnerDirection[] = ['buy', 'sell', 'swap'];

export interface CompletionSegment {
  label: string;
  value: number | null;
  state: CompletionState;
  color: string;
}

/** Pure helper for tests and rendering — Stage A segments, shared state scale. */
export function stageASegments(data: PartnerPaymentInfoDirection): CompletionSegment[] {
  return [
    { label: 'Zahlung eingegangen', value: data.paymentReceived, state: 'good', color: STATE_COLORS.good },
    { label: 'Wartet auf Zahlung', value: data.waitingForPayment, state: 'pending', color: STATE_COLORS.pending },
    { label: 'Keine Zahlung', value: data.noPaymentReceived, state: 'absent', color: STATE_COLORS.absent },
  ];
}

/** Pure helper for tests and rendering — Stage B segments, same state scale as Stage A. */
export function stageBSegments(data: PartnerSettlementDirection): CompletionSegment[] {
  return [
    { label: 'Ausgeliefert', value: data.delivered, state: 'good', color: STATE_COLORS.good },
    { label: 'In Bearbeitung', value: data.inProgress, state: 'pending', color: STATE_COLORS.pending },
    { label: 'Abgelehnt', value: data.rejected, state: 'rejected', color: STATE_COLORS.rejected },
  ];
}

export interface CompletionBlockProps {
  completion: PartnerCompletion;
}

function InfoTooltip({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <button
        type="button"
        className="w-4 h-4 rounded-full text-2xs bg-dfxBlue-500 text-dfxGray-600 hover:text-white"
        aria-label="Mehr Informationen"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-10 left-0 top-5 w-64 p-2 text-2xs leading-snug bg-dfxBlue-800 border border-dfxBlue-500 rounded shadow text-dfxGray-600"
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
  const known = segments.filter((s): s is CompletionSegment & { value: number } => s.value != null);
  const total = known.reduce((s, x) => s + x.value, 0);

  if (known.length === 0) {
    return (
      <div data-testid={testId}>
        <div className="h-4 rounded bg-dfxBlue-600/50 border border-dashed border-dfxGray-800" />
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <div
        className="flex h-4 rounded overflow-hidden bg-dfxBlue-800"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value ?? '–'}`).join(', ')}
      >
        {known.map((seg) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={seg.label}
              className="h-full"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${formatCount(seg.value)}`}
              data-state={seg.state}
              data-color={seg.color}
              data-testid={`segment-${seg.state}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-2xs text-dfxGray-700">
        {segments.map((seg) => (
          <span
            key={seg.label}
            className="inline-flex items-center gap-1"
            data-state={seg.state}
            data-color={seg.color}
            data-testid={`legend-${seg.state}`}
          >
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: seg.color }} aria-hidden="true" />
            {seg.label}: {seg.value == null ? '–' : formatCount(seg.value)}
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
  direction: PartnerDirection;
  data: PartnerPaymentInfoDirection;
}): JSX.Element {
  return (
    <div className="space-y-1.5" data-testid={`stage-a-${direction}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-dfxGray-600">{SERIES_LABELS[direction]}</span>
        <span className="text-dfxGray-700">
          Rate: {data.receivedRate == null ? '–' : formatPercent(data.receivedRate)}
        </span>
      </div>
      <StackedDirectionBar testId={`stage-a-bar-${direction}`} segments={stageASegments(data)} />
      <p className="text-2xs text-dfxGray-700">
        Angefragt:{' '}
        {data.requested == null ? (
          <span data-testid={`stage-a-requested-null-${direction}`}>–</span>
        ) : (
          formatCount(data.requested)
        )}
      </p>
    </div>
  );
}

function StageBRow({
  direction,
  data,
}: {
  direction: PartnerDirection;
  data: PartnerSettlementDirection;
}): JSX.Element {
  return (
    <div className="space-y-1.5" data-testid={`stage-b-${direction}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-dfxGray-600">{SERIES_LABELS[direction]}</span>
        <span className="text-dfxGray-700">
          Rate: {data.deliveredRate == null ? '–' : formatPercent(data.deliveredRate)}
        </span>
      </div>
      <StackedDirectionBar testId={`stage-b-bar-${direction}`} segments={stageBSegments(data)} />
      <p className="text-2xs text-dfxGray-700">
        Eingegangen: {data.received == null ? '–' : formatCount(data.received)}
      </p>
    </div>
  );
}

function overallRate(
  directions: PartnerDirection[],
  pick: (d: PartnerDirection) => number | null,
  den: (d: PartnerDirection) => number | null,
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
      <section className="bg-dfxBlue-700 rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">
            Zahlungsinfo-Abrufe mit erfolgter Zahlung
            <InfoTooltip text="Ein Zahlungsinfo-Abruf entsteht bei jedem Abruf der Zahlungsinformationen (z. B. bei jeder Betragsänderung in der Oberfläche), nicht einmal pro Kaufabsicht. Die Rate ist daher keine Conversion-Rate." />
          </h2>
          <div className="w-full sm:w-48">
            <KpiTile
              label="Stufe A — Rate"
              value={stageARate}
              format={(n) => formatPercent(n)}
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

      <section className="bg-dfxBlue-700 rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">
            Eingegangene Zahlungen, die ausgeliefert wurden
            <InfoTooltip text="Anteil der eingegangenen Zahlungen, die ausgeliefert wurden — inklusive abgelehnter und noch in Bearbeitung befindlicher Vorgänge." />
          </h2>
          <div className="w-full sm:w-48">
            <KpiTile
              label="Stufe B — Rate"
              value={stageBRate}
              format={(n) => formatPercent(n)}
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
