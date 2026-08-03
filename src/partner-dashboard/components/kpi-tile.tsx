import { displayNullable } from 'src/partner-dashboard/util/format';

export interface KpiTileProps {
  label: string;
  value: number | null | undefined;
  format: (n: number) => string;
  testId?: string;
}

/**
 * Pure numeric KPI tile. null → genuinely absent (never drawn as 0); 0 → real zero.
 * Value is never truncated: tile grows in height; type scales down on narrow widths.
 */
export function KpiTile({ label, value, format, testId }: KpiTileProps): JSX.Element {
  const display = displayNullable(value, format);

  return (
    <div
      className="partner-card-tight min-w-0"
      data-testid={testId ?? 'kpi-tile'}
      data-kind={display.kind}
    >
      <div className="text-2xs sm:text-xs font-medium partner-text-tertiary leading-snug">{label}</div>
      {display.kind === 'absent' ? (
        <div
          className="text-base sm:text-lg md:text-xl font-bold mt-1 partner-text-secondary"
          data-testid="kpi-absent"
        >
          {display.text}
        </div>
      ) : (
        <div
          className="text-base sm:text-lg md:text-xl font-bold mt-1 break-words whitespace-normal leading-snug"
          style={{ color: 'var(--text)' }}
          data-testid="kpi-value"
        >
          {display.text}
        </div>
      )}
    </div>
  );
}
