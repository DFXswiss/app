import { formatAmount, formatCount } from 'src/partner-dashboard/util/format';
import { NamedVolumeRow, rankNamedVolumes, sequentialColor } from 'src/partner-dashboard/util/series';
import { EmptyState } from './empty-state';

export interface HorizontalBarListProps {
  title: string;
  rows: NamedVolumeRow[];
  currency: string;
  compact?: boolean;
  testId?: string;
}

/**
 * Horizontal bars, descending, sequential single-hue scale, direct value labels.
 * null volume → privacy gap row (never drawn as zero bar).
 */
export function HorizontalBarList({
  title,
  rows,
  currency,
  compact = false,
  testId,
}: HorizontalBarListProps): JSX.Element {
  const ranked = rankNamedVolumes(rows);
  const maxVolume = ranked.reduce((m, r) => {
    if (r.volume == null) return m;
    return Math.max(m, r.volume);
  }, 0);

  return (
    <section
      className="bg-dfxBlue-700 rounded-lg shadow p-4 min-w-0"
      data-testid={testId ?? 'horizontal-bar-list'}
    >
      <h2 className="text-sm font-semibold text-white mb-3">{title}</h2>
      {ranked.length === 0 ? (
        <EmptyState message="Keine Daten." />
      ) : (
        <div className={`overflow-x-auto max-w-full ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          <ul className="space-y-2 min-w-[280px]">
            {ranked.map((row, index) => {
              if (row.volume == null) {
                return (
                  <li
                    key={`${row.name}-suppressed-${index}`}
                    className="space-y-0.5"
                    data-testid="bar-suppressed"
                    data-name={row.name}
                  >
                    <div className="flex justify-between text-xs text-dfxGray-700">
                      <span className="truncate pr-2">{row.name}</span>
                      <span className="shrink-0">–</span>
                    </div>
                    <div className="h-3 rounded bg-dfxBlue-600/50 border border-dashed border-dfxGray-800" />
                  </li>
                );
              }

              const pct = maxVolume > 0 ? (row.volume / maxVolume) * 100 : 0;
              const color = sequentialColor(index, ranked.length);
              return (
                <li key={`${row.name}-${index}`} className="space-y-0.5" data-testid="bar-row" data-name={row.name}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-dfxGray-600 truncate min-w-0" title={row.name}>
                      {row.name}
                    </span>
                    <span className="text-white font-medium shrink-0 tabular-nums">
                      {formatAmount(row.volume, currency, 0)}
                      {row.transactions != null && (
                        <span className="text-dfxGray-700 font-normal ml-1">
                          ({formatCount(row.transactions)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 rounded bg-dfxBlue-800 overflow-hidden" role="presentation">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%`, backgroundColor: color }}
                      title={formatAmount(row.volume, currency)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
