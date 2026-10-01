import { useSessionContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import {
  KundengelderExtract,
  KundengelderSheet,
  KundengelderSheetLine,
  KundengelderSheetRow,
  KundengelderTxList,
} from 'src/dto/dashboard.dto';
import { useDashboard } from 'src/hooks/dashboard.hook';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { withEveryBankAccount } from 'src/util/kundengelder-accounts';
import { downloadCsv, toSemicolonCsv } from 'src/util/semicolon-csv';

const CSV_HEADERS = ['Account', 'AccountKey', 'Line', 'Currency', 'Count', 'Amount', 'AmountChf'];
const SHEET_CSV_HEADERS = ['Account', 'AccountNo', 'Side', 'Date', 'Label', 'Amount', 'Currency', 'Kontrolle'];

interface OpenedLine {
  viewKey: string;
  accountKey: string;
  lineKey: string;
  list?: KundengelderTxList;
  error?: string;
}

function utcYearsFrom2020(): number[] {
  const end = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let year = 2020; year <= end; year++) {
    years.push(year);
  }
  return years;
}

function formatChf(value: number): string {
  return `${value.toLocaleString('de-CH')} CHF`;
}

function formatAmount(value: number): string {
  return value.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function balanceText(signed: number, currency: string): string {
  const amount = formatAmount(Math.abs(signed));
  if (signed > 0) return `Soll ${amount} ${currency}`;
  if (signed < 0) return `Haben ${amount} ${currency}`;
  return `${amount} ${currency}`;
}

function openingCheckText(sheet: KundengelderSheet): string {
  if (sheet.openingCheck === 'unchecked') {
    return 'Nicht überprüft, weil kein Anfangsbestand des Folgejahres in der Datenbank abgelegt ist.';
  }
  const year = sheet.periodEnd ? Number(sheet.periodEnd.slice(0, 4)) + 1 : undefined;
  const end = balanceText(sheet.closingBalance ?? 0, sheet.currency);
  const next = balanceText(sheet.nextOpeningBalance ?? 0, sheet.currency);
  const when = year ? ` ${year}` : '';
  if (sheet.openingCheck === 'verified') {
    return `Verifiziert. Der errechnete Endbestand ${end} stimmt mit dem Anfangsbestand${when} (${next}) überein.`;
  }
  return `Überprüft. Der errechnete Endbestand ${end} stimmt nicht mit dem Anfangsbestand${when} (${next}) überein.`;
}

function sideAmount(label: string | undefined, amount: number | undefined): string {
  if (!label) return '';
  if (amount == null) return label === 'Anfangsbestand' ? 'nicht abgelegt' : '';
  return formatAmount(amount);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export default function DashboardFinancialKundengelderScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Kundengelder', noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getKundengelderExtract, getDfxBanks, getKundengelderLines } = useDashboard();

  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [accountKey, setAccountKey] = useState('all');
  const [extract, setExtract] = useState<KundengelderExtract>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [opened, setOpened] = useState<OpenedLine>();
  const lineRequestId = useRef(0);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    lineRequestId.current += 1;
    setIsLoading(true);
    setOpened(undefined);
    setError(undefined);
    Promise.all([getKundengelderExtract(year), getDfxBanks()])
      .then(([data, banks]) => {
        if (!cancelled) setExtract(withEveryBankAccount(data, banks));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setExtract(undefined);
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      lineRequestId.current += 1;
    };
  }, [isLoggedIn, year]);

  function onYearChange(value: string): void {
    const next = Number(value);
    const maxYear = new Date().getUTCFullYear();
    if (!Number.isInteger(next) || next < 2020 || next > maxYear) return;
    if (next === year) return;
    lineRequestId.current += 1;
    setIsLoading(true);
    setOpened(undefined);
    setError(undefined);
    setExtract(undefined);
    setYear(next);
  }

  function onLineClick(viewKey: string, accountKey: string, lineKey: string): void {
    const currentOpened = opened;
    if (currentOpened && currentOpened.viewKey === viewKey && currentOpened.lineKey === lineKey) {
      lineRequestId.current += 1;
      setOpened(undefined);
      return;
    }

    const requestId = lineRequestId.current + 1;
    lineRequestId.current = requestId;
    setOpened({ viewKey, accountKey, lineKey });

    getKundengelderLines(year, accountKey, lineKey)
      .then((list) => {
        if (lineRequestId.current !== requestId) return;
        setOpened({ viewKey, accountKey, lineKey, list });
      })
      .catch((err: unknown) => {
        if (lineRequestId.current !== requestId) return;
        setOpened({ viewKey, accountKey, lineKey, error: errorMessage(err) });
      });
  }

  function exportCsv(data: KundengelderExtract): void {
    if (data.sheets && data.sheets.length > 0) {
      const rows = data.sheets.flatMap((sheet) => [
        ...sheet.soll.map((line) => [
          sheet.name,
          sheet.accountNo ?? '',
          'Soll',
          line.date ?? '',
          line.label,
          line.amount,
          sheet.currency,
          '',
        ]),
        [sheet.name, sheet.accountNo ?? '', 'Soll', '', 'Summe', sheet.sollSum, sheet.currency, ''],
        ...sheet.haben.map((line) => [
          sheet.name,
          sheet.accountNo ?? '',
          'Haben',
          line.date ?? '',
          line.label,
          line.amount,
          sheet.currency,
          '',
        ]),
        [sheet.name, sheet.accountNo ?? '', 'Haben', '', 'Summe', sheet.habenSum, sheet.currency, ''],
        [sheet.name, sheet.accountNo ?? '', 'Kontrolle', '', '', '', sheet.currency, sheet.control],
        ...(sheet.openingCheck
          ? [[sheet.name, sheet.accountNo ?? '', 'Prüfung', '', openingCheckText(sheet), '', sheet.currency, '']]
          : []),
      ]);
      downloadCsv(`kundengelder-${year}.csv`, toSemicolonCsv(SHEET_CSV_HEADERS, rows));
      return;
    }

    const rows = data.accounts.flatMap((account) => {
      if (account.lines.length === 0) {
        return [[account.name, account.key, '', account.currency, 0, 0, 0]];
      }
      return account.lines.map((line) => [
        account.name,
        account.key,
        line.label,
        line.currency,
        line.count,
        line.amount,
        line.amountChf,
      ]);
    });

    downloadCsv(`kundengelder-${year}.csv`, toSemicolonCsv(CSV_HEADERS, rows));
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-96">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
    );
  }

  const years = utcYearsFrom2020();
  const sheets = extract?.sheets ?? [];
  const showSheets = sheets.length > 0;

  return (
    <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Kundengelder</h1>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="kundengelder-account" className="text-sm">
            Account
          </label>
          <select
            id="kundengelder-account"
            value={accountKey}
            onChange={(event) => setAccountKey(event.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            <option value="all">All</option>
            {sheets.map((sheet) => (
              <option key={sheet.key} value={sheet.key}>
                {sheet.name}
              </option>
            ))}
          </select>
          <label htmlFor="kundengelder-year" className="text-sm">
            Year
          </label>
          <select
            id="kundengelder-year"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {extract !== undefined && <div className="text-sm">EUR rate {extract.eurRate}</div>}
          {extract !== undefined && (
            <StyledButton
              label="Export CSV"
              width={StyledButtonWidth.MIN}
              color={StyledButtonColor.STURDY_WHITE}
              disabled={extract.accounts.length === 0 && sheets.length === 0}
              onClick={() => exportCsv(extract)}
            />
          )}
        </div>
      </div>

      {error && <ErrorHint message={error} />}

      {showSheets &&
        sheets
          .filter(
            (sheet) =>
              accountKey === 'all' ||
              sheet.key === accountKey ||
              !sheets.some((item) => item.key === accountKey),
          )
          .map((sheet) => (
          <KontenblattCard
            key={sheet.key}
            sheet={sheet}
            opened={opened}
            onLine={(line) => {
              if (line.lineKey) onLineClick(sheet.key, sheet.iban ?? sheet.key, line.lineKey);
            }}
          />
        ))}

      {!showSheets &&
        extract?.accounts.map((account) => (
          <div key={account.key} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold">{account.name}</h2>
            <div className="text-sm mb-3" style={{ color: '#6b7280' }}>
              {account.iban ?? account.key}
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold">Label</th>
                    <th className="text-right py-2 px-3 font-semibold">Count</th>
                    <th className="text-right py-2 px-3 font-semibold">Amount</th>
                    <th className="text-right py-2 px-3 font-semibold">Amount CHF</th>
                  </tr>
                </thead>
                <tbody>
                  {account.lines.length === 0 && (
                    <tr>
                      <td className="py-1.5 px-3" colSpan={4}>
                        No movements
                      </td>
                    </tr>
                  )}
                  {account.lines.map((line) => {
                    return (
                      <Fragment key={line.key}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => onLineClick(account.key, account.key, line.key)}
                        >
                          <td className="py-1.5 px-3">{line.label}</td>
                          <td className="py-1.5 px-3 text-right">{line.count}</td>
                          <td className="py-1.5 px-3 text-right">
                            {line.amount.toLocaleString('de-CH')} {line.currency}
                          </td>
                          <td className="py-1.5 px-3 text-right font-medium">{formatChf(line.amountChf)}</td>
                        </tr>
                        {opened && opened.viewKey === account.key && opened.lineKey === line.key && (
                          <tr>
                            <td colSpan={4} className="py-2 px-3 bg-gray-50">
                              {opened.error && <ErrorHint message={opened.error} />}
                              {opened.list && <TxTable list={opened.list} />}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {extract !== undefined && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Live vs booked</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold">Key</th>
                  <th className="text-right py-2 px-3 font-semibold">Live</th>
                  <th className="text-right py-2 px-3 font-semibold">Booked</th>
                  <th className="text-right py-2 px-3 font-semibold">Delta</th>
                </tr>
              </thead>
              <tbody>
                {extract.diffs.map((diff) => {
                  const deltaClass = diff.delta !== 0 ? 'text-dfxRed-100' : '';
                  return (
                    <tr key={diff.key} className="border-b border-gray-100">
                      <td className="py-1.5 px-3">{diff.key}</td>
                      <td className="py-1.5 px-3 text-right">{diff.live}</td>
                      <td className="py-1.5 px-3 text-right">{diff.booked}</td>
                      <td className={`py-1.5 px-3 text-right ${deltaClass}`}>{diff.delta}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KontenblattCard({
  sheet,
  opened,
  onLine,
}: {
  sheet: KundengelderSheet;
  opened?: OpenedLine;
  onLine: (line: KundengelderSheetLine) => void;
}): JSX.Element {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold">{sheet.name}</h2>
      <div className="text-sm mb-3" style={{ color: '#6b7280' }}>
        {sheet.accountNo && <span>{sheet.accountNo}</span>}
        {sheet.accountNo && sheet.iban && <span> · </span>}
        {sheet.iban && <span>{sheet.iban}</span>}
        {(sheet.accountNo || sheet.iban) && <span> · </span>}
        <span>{sheet.currency}</span>
        {sheet.periodStart && sheet.periodEnd && (
          <span>
            {' '}
            · {sheet.periodStart} – {sheet.periodEnd}
          </span>
        )}
      </div>
      {sheet.rows && sheet.rows.length > 0 ? (
        <SheetTable sheet={sheet} opened={opened} onLine={onLine} />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SheetSide
          title="Soll"
          lines={sheet.soll}
          sum={sheet.sollSum}
          currency={sheet.currency}
          sheetKey={sheet.key}
          opened={opened}
          onLine={onLine}
        />
        <SheetSide
          title="Haben"
          lines={sheet.haben}
          sum={sheet.habenSum}
          currency={sheet.currency}
          sheetKey={sheet.key}
          opened={opened}
          onLine={onLine}
        />
      </div>
      )}
      <div className="mt-3 flex flex-wrap gap-6 text-sm font-medium">
        <span>Summe Soll {formatAmount(sheet.sollSum)} {sheet.currency}</span>
        <span>Summe Haben {formatAmount(sheet.habenSum)} {sheet.currency}</span>
      </div>
      <div className={`mt-1 text-sm font-medium ${sheet.control !== 0 ? 'text-dfxRed-100' : ''}`}>
        Kontrolle {formatAmount(sheet.control)} {sheet.currency}
      </div>
      {sheet.openingCheck && <OpeningCheck sheet={sheet} />}
    </div>
  );
}

function SheetTable({
  sheet,
  opened,
  onLine,
}: {
  sheet: KundengelderSheet;
  opened?: OpenedLine;
  onLine: (line: KundengelderSheetLine) => void;
}): JSX.Element {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-semibold">Soll</th>
            <th className="text-right py-2 px-3 font-semibold">Betrag</th>
            <th className="text-left py-2 px-3 font-semibold">Haben</th>
            <th className="text-right py-2 px-3 font-semibold">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {(sheet.rows ?? []).map((row, index) => (
            <SheetRowView
              key={`${index}-${row.sollLabel ?? ''}-${row.habenLabel ?? ''}`}
              row={row}
              sheet={sheet}
              opened={opened}
              onLine={onLine}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SheetRowView({
  row,
  sheet,
  opened,
  onLine,
}: {
  row: KundengelderSheetRow;
  sheet: KundengelderSheet;
  opened?: OpenedLine;
  onLine: (line: KundengelderSheetLine) => void;
}): JSX.Element {
  const sollOpen = opened && row.sollLineKey != null && opened.viewKey === sheet.key && opened.lineKey === row.sollLineKey;
  const habenOpen =
    opened && row.habenLineKey != null && opened.viewKey === sheet.key && opened.lineKey === row.habenLineKey;
  return (
    <>
      <tr className={`border-b border-gray-100 ${row.section ? 'font-semibold' : ''}`}>
        <AmountCell
          label={row.sollLabel}
          amount={row.sollAmount}
          lineKey={row.sollLineKey}
          onClick={() => row.sollLineKey && onLine({ label: row.sollLabel ?? '', amount: row.sollAmount ?? 0, lineKey: row.sollLineKey })}
        />
        <AmountCell
          label={row.habenLabel}
          amount={row.habenAmount}
          lineKey={row.habenLineKey}
          onClick={() =>
            row.habenLineKey && onLine({ label: row.habenLabel ?? '', amount: row.habenAmount ?? 0, lineKey: row.habenLineKey })
          }
        />
      </tr>
      {(sollOpen || habenOpen) && (
        <tr>
          <td colSpan={4} className="py-2 px-3 bg-gray-50">
            {opened?.error && <ErrorHint message={opened.error} />}
            {opened?.list && <TxTable list={opened.list} />}
          </td>
        </tr>
      )}
    </>
  );
}

function AmountCell({
  label,
  amount,
  lineKey,
  onClick,
}: {
  label?: string;
  amount?: number;
  lineKey?: string;
  onClick: () => void;
}): JSX.Element {
  const clickable = Boolean(lineKey);
  return (
    <>
      <td
        className={`py-1.5 px-3 ${clickable ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
        onClick={() => clickable && onClick()}
      >
        {label ?? ''}
      </td>
      <td
        className={`py-1.5 px-3 text-right ${clickable ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
        onClick={() => clickable && onClick()}
      >
        {label ? sideAmount(label, amount) : ''}
      </td>
    </>
  );
}

function OpeningCheck({ sheet }: { sheet: KundengelderSheet }): JSX.Element {
  const mismatch = sheet.openingCheck === 'mismatch';
  return (
    <p className={`mt-3 text-sm ${mismatch ? 'text-dfxRed-100' : ''}`}>{openingCheckText(sheet)}</p>
  );
}

function SheetSide({
  title,
  lines,
  sum,
  currency,
  sheetKey,
  opened,
  onLine,
}: {
  title: string;
  lines: KundengelderSheetLine[];
  sum: number;
  currency: string;
  sheetKey: string;
  opened?: OpenedLine;
  onLine: (line: KundengelderSheetLine) => void;
}): JSX.Element {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 font-semibold">Date</th>
          <th className="text-left py-2 px-3 font-semibold">{title}</th>
          <th className="text-right py-2 px-3 font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => {
          const open = opened && opened.viewKey === sheetKey && line.lineKey != null && opened.lineKey === line.lineKey;
          return (
            <Fragment key={`${index}-${line.date ?? ''}-${line.label}-${line.amount}`}>
              <tr
                className={`border-b border-gray-100 ${line.lineKey ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                onClick={() => line.lineKey && onLine(line)}
              >
                <td className="py-1.5 px-3">{line.date ?? ''}</td>
                <td className="py-1.5 px-3">{line.label}</td>
                <td className="py-1.5 px-3 text-right">
                  {line.amount.toLocaleString('de-CH')} {currency}
                </td>
              </tr>
              {open && (
                <tr>
                  <td colSpan={3} className="py-2 px-3 bg-gray-50">
                    {opened?.error && <ErrorHint message={opened.error} />}
                    {opened?.list && <TxTable list={opened.list} />}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr className="border-t border-gray-300">
          <td className="py-1.5 px-3" />
          <td className="py-1.5 px-3 font-semibold">Summe</td>
          <td className="py-1.5 px-3 text-right font-semibold">
            {sum.toLocaleString('de-CH')} {currency}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function TxTable({ list }: { list: KundengelderTxList }): JSX.Element {
  if (list.rows.length === 0) {
    return (
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td>No transactions</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-1 px-2 font-semibold">ID</th>
          <th className="text-left py-1 px-2 font-semibold">Booking date</th>
          <th className="text-left py-1 px-2 font-semibold">Type</th>
          <th className="text-right py-1 px-2 font-semibold">Amount</th>
          <th className="text-right py-1 px-2 font-semibold">After fee</th>
          <th className="text-left py-1 px-2 font-semibold">Instruction ID</th>
        </tr>
      </thead>
      <tbody>
        {list.rows.map((tx) => (
          <tr key={tx.id} className="border-b border-gray-100">
            <td className="py-1 px-2">{tx.id}</td>
            <td className="py-1 px-2">{tx.bookingDate ?? ''}</td>
            <td className="py-1 px-2">{tx.type}</td>
            <td className="py-1 px-2 text-right">{tx.amount ?? ''}</td>
            <td className="py-1 px-2 text-right">{tx.afterFee ?? ''}</td>
            <td className="py-1 px-2">{tx.instructionId ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
