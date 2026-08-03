import { useMemo } from 'react';
import { PARTNER_GRANULARITIES, PartnerGranularity } from 'src/dto/partner-statistic.dto';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export type PeriodDays = 30 | 90 | 365;

export interface PeriodControlsProps {
  periodDays: PeriodDays;
  granularity: PartnerGranularity;
  /** @deprecated Ignored — active filters use design-pod --primary, not partner magenta. */
  accent?: string;
  onPeriodChange: (days: PeriodDays) => void;
  onGranularityChange: (g: PartnerGranularity) => void;
}

const PERIOD_DAYS: PeriodDays[] = [30, 90, 365];

const GRANULARITY_KEYS: Record<PartnerGranularity, string> = {
  Day: 'Day',
  Week: 'Week',
  Month: 'Month',
};

export function PeriodControls({
  periodDays,
  granularity,
  onPeriodChange,
  onGranularityChange,
}: PeriodControlsProps): JSX.Element {
  const { translate } = usePartnerTranslation();

  const periodOptions = useMemo(
    () =>
      PERIOD_DAYS.map((days) => ({
        days,
        label: translate(`${days} days` as '30 days'),
      })),
    [translate],
  );

  const granularityOptions = useMemo(
    () =>
      PARTNER_GRANULARITIES.map((value) => ({
        value,
        label: translate(GRANULARITY_KEYS[value]),
      })),
    [translate],
  );

  return (
    <div
      className="flex flex-wrap gap-4 items-center"
      data-testid="period-controls"
      role="toolbar"
      aria-label={translate('Period and granularity')}
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={translate('Period')}>
        {periodOptions.map((opt) => {
          const active = opt.days === periodDays;
          return (
            <button
              key={opt.days}
              type="button"
              onClick={() => onPeriodChange(opt.days)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active ? 'partner-btn-active' : 'partner-btn-idle'
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={translate('Granularity')}>
        {granularityOptions.map((opt) => {
          const active = opt.value === granularity;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onGranularityChange(opt.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                active ? 'partner-btn-active' : 'partner-btn-idle'
              }`}
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
