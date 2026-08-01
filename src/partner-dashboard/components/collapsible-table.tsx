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

/** Accessible numbers-as-table toggle for chart series. */
export function CollapsibleTable({ title, columns, rows, defaultOpen = false }: CollapsibleTableProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const { translate } = usePartnerTranslation();

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-dfxGray-700 hover:text-dfxGray-600 underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? translate('Hide table') : translate('Show as table')}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto max-w-full">
          <table className="w-full text-xs text-dfxGray-600" aria-label={title}>
            <thead>
              <tr className="border-b border-dfxBlue-500">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-1.5 px-2 font-semibold text-dfxGray-700 ${
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
                <tr key={idx} className="border-b border-dfxBlue-600/40">
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
