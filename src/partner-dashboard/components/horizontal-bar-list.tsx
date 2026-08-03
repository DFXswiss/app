import { formatAmount, formatCount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { hasActivity, NamedVolumeRow, rankNamedVolumes, sequentialColor } from 'src/partner-dashboard/util/series';
import { PartnerTheme } from 'src/partner-dashboard/util/theme';
import { EmptyState } from './empty-state';

export interface HorizontalBarListProps {
  title: string;
  rows: NamedVolumeRow[];
  currency: string;
  theme?: PartnerTheme;
  compact?: boolean;
  testId?: string;
}

/**
 * Horizontal bars, descending, sequential single-hue scale, direct value labels.
 * A category with no activity in the period (zero volume AND zero transactions) is
 * dropped entirely — it never sits there permanently showing 0.
 */
export function HorizontalBarList({
  title,
  rows,
  currency,
  theme = 'dark',
  compact = false,
  testId,
}: HorizontalBarListProps): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  const ranked = rankNamedVolumes(rows.filter(hasActivity));
  const maxVolume = ranked.reduce((m, r) => Math.max(m, r.volume), 0);

  return (
    <section className="partner-card min-w-0" data-testid={testId ?? 'horizontal-bar-list'}>
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
        {title}
      </h2>
      {ranked.length === 0 ? (
        <EmptyState message={translate('No data.')} />
      ) : (
        <div className={`overflow-x-auto max-w-full ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          <ul className="space-y-2 min-w-[280px]">
            {ranked.map((row, index) => {
              const pct = maxVolume > 0 ? (row.volume / maxVolume) * 100 : 0;
              const color = sequentialColor(index, ranked.length, theme);
              return (
                <li key={`${row.name}-${index}`} className="space-y-0.5" data-testid="bar-row" data-name={row.name}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="partner-text-secondary truncate min-w-0" title={row.name}>
                      {row.name}
                    </span>
                    <span
                      className="font-medium shrink-0 tabular-nums"
                      style={{ color: 'var(--text)' }}
                    >
                      {formatAmount(row.volume, currency, 0, locale)}
                      <span className="partner-text-tertiary font-normal ml-1">
                        ({formatCount(row.transactions, locale)})
                      </span>
                    </span>
                  </div>
                  <div className="h-3 rounded partner-track overflow-hidden" role="presentation">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%`, backgroundColor: color }}
                      title={formatAmount(row.volume, currency, 2, locale)}
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
