import { FILTER_ACTIVE_COLOR } from 'src/config/partner-dashboard.config';
import { PartnerGranularity } from 'src/dto/partner-statistic.dto';

export type PeriodDays = 30 | 90 | 365;

export interface PeriodControlsProps {
  periodDays: PeriodDays;
  granularity: PartnerGranularity;
  /** @deprecated Ignored — active filters use FILTER_ACTIVE_COLOR (dfxBlue), not partner magenta. */
  accent?: string;
  onPeriodChange: (days: PeriodDays) => void;
  onGranularityChange: (g: PartnerGranularity) => void;
}

const PERIOD_OPTIONS: { days: PeriodDays; label: string }[] = [
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 365, label: '365 Tage' },
];

const GRANULARITY_OPTIONS: { value: PartnerGranularity; label: string }[] = [
  { value: 'day', label: 'Tag' },
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
];

export function PeriodControls({
  periodDays,
  granularity,
  onPeriodChange,
  onGranularityChange,
}: PeriodControlsProps): JSX.Element {
  return (
    <div
      className="flex flex-wrap gap-4 items-center"
      data-testid="period-controls"
      role="toolbar"
      aria-label="Zeitraum und Granularität"
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zeitraum">
        {PERIOD_OPTIONS.map((opt) => {
          const active = opt.days === periodDays;
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => onPeriodChange(opt.days)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active ? 'text-white' : 'bg-dfxBlue-700 text-dfxGray-600 hover:text-white'
              }`}
              style={active ? { backgroundColor: FILTER_ACTIVE_COLOR } : undefined}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Granularität">
        {GRANULARITY_OPTIONS.map((opt) => {
          const active = opt.value === granularity;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onGranularityChange(opt.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active ? 'text-white' : 'bg-dfxBlue-700 text-dfxGray-600 hover:text-white'
              }`}
              style={active ? { backgroundColor: FILTER_ACTIVE_COLOR } : undefined}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
