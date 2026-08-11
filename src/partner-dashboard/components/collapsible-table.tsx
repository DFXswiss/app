import { useState } from 'react';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface TableColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

export interface CollapsibleTableProps {
  title: string;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  defaultOpen?: boolean;
}

/** Body rows visible without scrolling; beyond this the body scrolls under a sticky header. */
export const TABLE_SCROLL_ROW_LIMIT = 20;

/**
 * Max height for header + N body rows, derived from line-height + vertical cell padding
 * (py-1.5 → 0.75rem). Uses 1lh so the cap grows when font-size / line-height changes —
 * not a hard-coded pixel row height.
 */
export function tableScrollMaxHeight(rowLimit: number = TABLE_SCROLL_ROW_LIMIT): string {
  return `calc((1lh + 0.75rem) * ${rowLimit + 1})`;
}

/** Accessible numbers-as-table toggle for chart series. */
export function CollapsibleTable({ title, columns, rows, defaultOpen = false }: CollapsibleTableProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const { translate } = usePartnerTranslation();

  const needsScroll = rows.length > TABLE_SCROLL_ROW_LIMIT;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs partner-text-tertiary hover:opacity-90 underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? translate('Hide table') : translate('Show as table')}
      </button>
      {open && (
        <div
          className={`mt-2 max-w-full text-xs ${needsScroll ? 'overflow-auto' : 'overflow-x-auto'}`}
          style={needsScroll ? { maxHeight: tableScrollMaxHeight() } : undefined}
          data-testid="collapsible-table-scroll"
          data-scrollable={needsScroll ? 'true' : 'false'}
        >
          <table className="w-full text-xs partner-text-secondary" aria-label={title}>
            <thead
              className={needsScroll ? 'sticky top-0 z-[1]' : undefined}
              style={needsScroll ? { background: 'var(--bg)' } : undefined}
            >
              <tr className="border-b partner-table-border" style={{ borderColor: 'var(--border)' }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-1.5 px-2 font-semibold partner-text-tertiary ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-1.5 px-2 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {row[col.key] ?? '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
