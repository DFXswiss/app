import { displayNullable } from 'src/partner-dashboard/util/format';

export interface KpiTileProps {
  label: string;
  value: number | null | undefined;
  format: (n: number) => string;
  testId?: string;
}

/**
 * Pure numeric KPI tile. null → privacy gap (never drawn as 0); 0 → real zero.
 * Value is never truncated: tile grows in height; type scales down on narrow widths.
 */
export function KpiTile({ label, value, format, testId }: KpiTileProps): JSX.Element {
  const display = displayNullable(value, format);

  return (
    <div
      className="bg-dfxBlue-700 rounded-lg shadow p-3 sm:p-4 min-w-0"
      data-testid={testId ?? 'kpi-tile'}
      data-kind={display.kind}
    >
      <div className="text-2xs sm:text-xs font-medium text-dfxGray-700 leading-snug">{label}</div>
      {display.kind === 'suppressed' ? (
        <div
          className="text-base sm:text-lg md:text-xl font-bold mt-1 text-dfxGray-600"
          data-testid="kpi-suppressed"
        >
          {display.text}
        </div>
      ) : (
        <div
          className="text-base sm:text-lg md:text-xl font-bold mt-1 text-white break-words whitespace-normal leading-snug"
          data-testid="kpi-value"
        >
          {display.text}
        </div>
      )}
    </div>
  );
}
