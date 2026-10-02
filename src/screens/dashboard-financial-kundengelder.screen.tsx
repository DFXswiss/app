import { useSessionContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

type SheetLineWithKey = KundengelderSheetLine & { lineKey: string };

function initialYear(params: URLSearchParams): number {
  const year = Number(params.get('year'));
  const maxYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > maxYear) return maxYear;
  return year;
}

function linesSearch(
  current: URLSearchParams,
  year: number,
  sheetKey: string,
  account: string,
  lineKey: string,
  label: string,
): string {
  const params = new URLSearchParams(current);
  params.set('year', String(year));
  params.set('sheet', sheetKey);
  params.set('account', account);
  params.set('line', lineKey);
  params.set('label', label);
  return params.toString();
}

function sheetSearch(current: URLSearchParams, query: LinesQuery | undefined): string {
  const params = new URLSearchParams(current);
  params.delete('account');
  params.delete('line');
  params.delete('label');
  if (!query) {
    params.delete('year');
    params.delete('sheet');
  } else {
    params.set('year', String(query.year));
    params.set('sheet', query.sheet);
  }
  return params.toString();
}

interface LinesQuery {
  year: number;
  sheet: string;
  account: string;
  line: string;
  label: string;
}

function readLinesQuery(params: URLSearchParams): LinesQuery | undefined {
  const year = Number(params.get('year'));
  const account = params.get('account') ?? '';
  const line = params.get('line') ?? '';
  const maxYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > maxYear || !account || !line) return undefined;
  return {
    year,
    sheet: params.get('sheet') || account,
    account,
    line,
    label: params.get('label') || line,
  };
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

function accountOptionLabel(sheet: KundengelderSheet): string {
  if (!sheet.iban) return sheet.name;
  if (sheet.name.replace(/\s/g, '').includes(sheet.iban)) return sheet.name;
  return `${sheet.name} · ${sheet.iban}`;
}

const DIFF_CURRENCIES = ['CHF', 'EUR', 'USD', 'AED', 'AUD'];

function splitDiffKey(
  key: string,
  sheets: KundengelderSheet[],
  accounts: KundengelderExtract['accounts'],
): { account: string; position: string } {
  const known = ['CheckoutLtdCHF', 'CheckoutLtdEUR', 'CryptoCrypto'];
  for (const prefix of known) {
    if (key !== prefix && !key.startsWith(`${prefix}|`)) continue;
    const named = sheets.find((item) => item.key === prefix) ?? accounts.find((item) => item.key === prefix);
    return { account: named?.name ?? prefix, position: key === prefix ? key : key.slice(prefix.length + 1) };
  }

  const sep = key.indexOf('|');
  const head = sep === -1 ? key : key.slice(0, sep);
  let position = sep === -1 ? key : key.slice(sep + 1);
  let currency: string | undefined;
  for (const code of DIFF_CURRENCIES) {
    if (!position.endsWith(`|${code}`)) continue;
    currency = code;
    position = position.slice(0, -(code.length + 1));
    break;
  }

  const sameAccount = (iban: string | undefined, accountKey: string, accountCurrency: string): boolean =>
    (iban === head || accountKey === head) && (!currency || accountCurrency === currency);
  const named =
    sheets.find((item) => sameAccount(item.iban, item.key, item.currency)) ??
    accounts.find((item) => sameAccount(item.iban, item.key, item.currency)) ??
    sheets.find((item) => item.iban === head || item.key === head) ??
    accounts.find((item) => item.iban === head || item.key === head);
  return { account: named?.name ?? (currency ? `${head} ${currency}` : head), position };
}

function sideAmount(label: string, amount: number | undefined): string {
  if (amount == null) return label === 'Anfangsbestand' ? 'nicht abgelegt' : '';
  return formatAmount(amount);
}

interface KontenblattDisplayRow extends KundengelderSheetRow {
  sollDate?: string;
  habenDate?: string;
}

/**
 * A sheet without template rows is still the T-account.
 * Stored side lines stay on it. A bank with neither gets the empty opening and a zero balance.
 */
function kontenblattRows(sheet: KundengelderSheet): KontenblattDisplayRow[] {
  if (sheet.rows && sheet.rows.length > 0) return sheet.rows.map((row) => ({ ...row }));
  if (sheet.soll.length === 0 && sheet.haben.length === 0) {
    return [{ sollLabel: 'Anfangsbestand' }, { habenLabel: 'Saldo', habenAmount: 0 }];
  }
  const count = Math.max(sheet.soll.length, sheet.haben.length);
  const rows: KontenblattDisplayRow[] = [];
  for (let index = 0; index < count; index++) {
    const left = sheet.soll[index];
    const right = sheet.haben[index];
    rows.push({
      ...(left
        ? { sollLabel: left.label, sollAmount: left.amount, sollLineKey: left.lineKey, sollDate: left.date }
        : {}),
      ...(right
        ? { habenLabel: right.label, habenAmount: right.amount, habenLineKey: right.lineKey, habenDate: right.date }
        : {}),
    });
  }
  return rows;
}

function movementDate(lines: KundengelderSheetLine[], lineKey: string | undefined): string {
  if (!lineKey) return '';
  return lines.find((line) => line.lineKey === lineKey)?.date ?? '';
}

/** Fills from the Kontenblatt template. One colour covers the whole category row. */
const BAND_BY_LABEL: Record<string, string> = {
  'BuyCrypto after Fee': '#d9ead3',
  'BuyCrypto Fee': '#d9ead3',
  'FiatFiat after Fee': '#f4cccc',
  'BuyFiat after Fee': '#f4cccc',
  'FiatFiat Fee': '#a4c2f4',
  FiatFiat: '#a4c2f4',
  BuyCryptoReturn: '#b7b7b7',
  'BuyCryptoReturn-Chargeback': '#b7b7b7',
  BankTxReturn: '#d9d2e9',
  'BankTxReturn-Chargeback': '#d9d2e9',
  BankTxRepeat: '#fce5cd',
  'BankTxRepeat-Chargeback': '#fce5cd',
  Kraken: '#e6b8af',
  'Internal von Checkout': '#e6b8af',
  Unknown: '#d5a6bd',
  '% Gebühren Bank': '#d5a6bd',
  'Gebühr Checkout': '#d5a6bd',
  'Storno Gebühren Bank': '#d5a6bd',
  BankAccountFee: '#d5a6bd',
  'Kommission Gebühren': '#d5a6bd',
};

function bandForLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const known = BAND_BY_LABEL[label];
  if (known) return known;
  if (label === 'Internal' || label.startsWith('Internal von ') || label.startsWith('Internal an ')) return '#fff2cc';
  return undefined;
}

function rowBand(row: KundengelderSheetRow): string | undefined {
  if (row.section) return undefined;
  return bandForLabel(row.sollLabel) ?? bandForLabel(row.habenLabel);
}

function amountFill(label: string | undefined): string | undefined {
  if (label === 'Anfangsbestand') return '#ffff00';
  if (label === 'Saldo') return '#ff9900';
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export default function DashboardFinancialKundengelderScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Kundengelder', noMaxWidth: true });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn } = useSessionContext();
  const { getKundengelderExtract, getDfxBanks } = useDashboard();

  const [year, setYear] = useState(() => initialYear(searchParams));
  const [accountKey, setAccountKey] = useState(() => searchParams.get('sheet') ?? '');
  const [extract, setExtract] = useState<KundengelderExtract>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setIsLoading(true);
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
    };
  }, [isLoggedIn, year]);

  function onYearChange(value: string): void {
    const next = Number(value);
    const maxYear = new Date().getUTCFullYear();
    if (!Number.isInteger(next) || next < 2020 || next > maxYear) return;
    if (next === year) return;
    setIsLoading(true);
    setError(undefined);
    setExtract(undefined);
    setYear(next);
  }

  function onLineClick(sheetKey: string, account: string, lineKey: string, label: string): void {
    const search = linesSearch(searchParams, year, sheetKey, account, lineKey, label);
    navigate(`/dashboard/financial/kundengelder/lines?${search}`);
  }

  function exportCsv(data: KundengelderExtract): void {
    if (data.sheets && data.sheets.length > 0) {
      const rows = data.sheets.flatMap((sheet) => {
        const summeSoll = [sheet.name, sheet.accountNo ?? '', 'Soll', '', 'Summe', sheet.sollSum, sheet.currency, ''];
        const summeHaben = [
          sheet.name,
          sheet.accountNo ?? '',
          'Haben',
          '',
          'Summe',
          sheet.habenSum,
          sheet.currency,
          '',
        ];
        const kontrolle = [sheet.name, sheet.accountNo ?? '', 'Kontrolle', '', '', '', sheet.currency, sheet.control];
        const pruefung = sheet.openingCheck
          ? [[sheet.name, sheet.accountNo ?? '', 'Prüfung', '', openingCheckText(sheet), '', sheet.currency, '']]
          : [];

        const fromRows = kontenblattRows(sheet).flatMap((row) => {
          const records: Array<Array<string | number>> = [];
          if (row.sollLabel || row.sollAmount != null) {
            records.push([
              sheet.name,
              sheet.accountNo ?? '',
              'Soll',
              row.sollDate ?? movementDate(sheet.soll, row.sollLineKey),
              row.sollLabel ?? '',
              row.sollAmount ?? '',
              sheet.currency,
              '',
            ]);
          }
          if (row.habenLabel || row.habenAmount != null) {
            records.push([
              sheet.name,
              sheet.accountNo ?? '',
              'Haben',
              row.habenDate ?? movementDate(sheet.haben, row.habenLineKey),
              row.habenLabel ?? '',
              row.habenAmount ?? '',
              sheet.currency,
              '',
            ]);
          }
          return records;
        });
        return [...fromRows, summeSoll, summeHaben, kontrolle, ...pruefung];
      });
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
  const selectedKey = sheets.some((sheet) => sheet.key === accountKey) ? accountKey : (sheets[0]?.key ?? '');

  return (
    <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Kundengelder</h1>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor="kundengelder-account" className="text-sm">
            Konto
          </label>
          <select
            id="kundengelder-account"
            value={selectedKey}
            onChange={(event) => setAccountKey(event.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {sheets.map((sheet) => (
              <option key={sheet.key} value={sheet.key}>
                {accountOptionLabel(sheet)}
              </option>
            ))}
          </select>
          <label htmlFor="kundengelder-year" className="text-sm">
            Jahr
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
          {extract !== undefined && <div className="text-sm">EUR-Kurs {extract.eurRate}</div>}
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
          .filter((sheet) => sheet.key === selectedKey)
          .map((sheet) => (
            <KontenblattCard
              key={sheet.key}
              sheet={sheet}
              onLine={(line) => onLineClick(sheet.key, sheet.iban ?? sheet.key, line.lineKey, line.label)}
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
                    <th className="text-left py-2 px-3 font-semibold">Bezeichnung</th>
                    <th className="text-right py-2 px-3 font-semibold">Anzahl</th>
                    <th className="text-right py-2 px-3 font-semibold">Betrag</th>
                    <th className="text-right py-2 px-3 font-semibold">Betrag CHF</th>
                  </tr>
                </thead>
                <tbody>
                  {account.lines.length === 0 && (
                    <tr>
                      <td className="py-1.5 px-3" colSpan={4}>
                        Keine Bewegungen
                      </td>
                    </tr>
                  )}
                  {account.lines.map((line) => (
                    <tr
                      key={line.key}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => onLineClick(account.key, account.iban ?? account.key, line.key, line.label)}
                    >
                      <td className="py-1.5 px-3">{line.label}</td>
                      <td className="py-1.5 px-3 text-right">{line.count}</td>
                      <td className="py-1.5 px-3 text-right">
                        {line.amount.toLocaleString('de-CH')} {line.currency}
                      </td>
                      <td className="py-1.5 px-3 text-right font-medium">{formatChf(line.amountChf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {extract !== undefined && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Abweichung zur Buchhaltung</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-semibold">Konto</th>
                  <th className="text-left py-2 px-3 font-semibold">Position</th>
                  <th className="text-right py-2 px-3 font-semibold">Live</th>
                  <th className="text-right py-2 px-3 font-semibold">Gebucht</th>
                  <th className="text-right py-2 px-3 font-semibold">Differenz</th>
                </tr>
              </thead>
              <tbody>
                {extract.diffs.map((diff) => {
                  const deltaClass = diff.delta !== 0 ? 'text-dfxRed-100' : '';
                  const parts = splitDiffKey(diff.key, sheets, extract.accounts);
                  return (
                    <tr key={diff.key} className="border-b border-gray-100">
                      <td className="py-1.5 px-3">{parts.account}</td>
                      <td className="py-1.5 px-3">{parts.position}</td>
                      <td className="py-1.5 px-3 text-right">{formatAmount(diff.live)}</td>
                      <td className="py-1.5 px-3 text-right">{formatAmount(diff.booked)}</td>
                      <td className={`py-1.5 px-3 text-right ${deltaClass}`}>{formatAmount(diff.delta)}</td>
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
  onLine,
}: {
  sheet: KundengelderSheet;
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  return (
    <div data-sheet={sheet.key} className="bg-white rounded-lg shadow p-4">
      <SheetDocument sheet={sheet} onLine={onLine} />
      {sheet.openingCheck && <OpeningCheck sheet={sheet} />}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <tr>
      <td className="border border-black px-2 py-1">{label}</td>
      <td className="border border-black px-2 py-1 text-right">{value}</td>
    </tr>
  );
}

function SheetDocument({
  sheet,
  onLine,
}: {
  sheet: KundengelderSheet;
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1" colSpan={2}>
              <h2 className="text-base font-bold">{sheet.name}</h2>
            </td>
          </tr>
          {sheet.accountNo && <MetaRow label="Kontonummer" value={sheet.accountNo} />}
          {sheet.iban && <MetaRow label="Bankkonto" value={sheet.iban} />}
          {sheet.periodStart && <MetaRow label="Startdatum" value={sheet.periodStart} />}
          {sheet.periodEnd && <MetaRow label="Enddatum" value={sheet.periodEnd} />}
        </tbody>
      </table>
      <SheetTable sheet={sheet} rows={kontenblattRows(sheet)} onLine={onLine} />
    </>
  );
}

const LEDGER_CELL = 'border border-black px-2 py-1 align-top break-words';

function SheetTable({
  sheet,
  rows,
  onLine,
}: {
  sheet: KundengelderSheet;
  rows: KundengelderSheetRow[];
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  return (
    <div className="mt-4 overflow-auto">
      <table aria-label="Kontenblatt" className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: '34%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '34%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={`${LEDGER_CELL} text-left font-semibold`} colSpan={2}>
              Soll
            </th>
            <th className={`${LEDGER_CELL} text-left font-semibold`} colSpan={2}>
              Haben
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <SheetRowView key={`${index}-${row.sollLabel ?? ''}-${row.habenLabel ?? ''}`} row={row} onLine={onLine} />
          ))}
          <tr className="font-semibold">
            <td className={LEDGER_CELL}>Summe</td>
            <td className={`${LEDGER_CELL} text-right tabular-nums`}>{formatAmount(sheet.sollSum)}</td>
            <td className={LEDGER_CELL}>Summe</td>
            <td className={`${LEDGER_CELL} text-right tabular-nums`}>{formatAmount(sheet.habenSum)}</td>
          </tr>
          <tr className="font-semibold">
            <td className={LEDGER_CELL}>Kontrolle</td>
            <td className={`${LEDGER_CELL} text-right tabular-nums ${sheet.control !== 0 ? 'text-dfxRed-100' : ''}`}>
              {formatAmount(sheet.control)}
            </td>
            <td className={LEDGER_CELL} />
            <td className={LEDGER_CELL} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SheetRowView({
  row,
  onLine,
}: {
  row: KundengelderSheetRow;
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  const band = rowBand(row);
  return (
    <tr className={row.section ? 'font-semibold' : undefined} style={{ backgroundColor: band }}>
      <AmountCell
        label={row.sollLabel}
        amount={row.sollAmount}
        lineKey={row.sollLineKey}
        onClick={() =>
          row.sollLineKey &&
          onLine({ label: row.sollLabel ?? '', amount: row.sollAmount ?? 0, lineKey: row.sollLineKey })
        }
      />
      <AmountCell
        label={row.habenLabel}
        amount={row.habenAmount}
        lineKey={row.habenLineKey}
        onClick={() =>
          row.habenLineKey &&
          onLine({ label: row.habenLabel ?? '', amount: row.habenAmount ?? 0, lineKey: row.habenLineKey })
        }
      />
    </tr>
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
  const click = clickable ? 'cursor-pointer' : '';
  return (
    <>
      <td className={`${LEDGER_CELL} ${click}`} onClick={() => clickable && onClick()}>
        {label ?? ''}
      </td>
      <td
        className={`${LEDGER_CELL} text-right tabular-nums ${click}`}
        style={amountFill(label) ? { backgroundColor: amountFill(label) } : undefined}
        onClick={() => clickable && onClick()}
      >
        {label ? sideAmount(label, amount) : ''}
      </td>
    </>
  );
}

function OpeningCheck({ sheet }: { sheet: KundengelderSheet }): JSX.Element {
  const mismatch = sheet.openingCheck === 'mismatch';
  return <p className={`mt-3 text-sm ${mismatch ? 'text-dfxRed-100' : ''}`}>{openingCheckText(sheet)}</p>;
}

export function DashboardFinancialKundengelderLinesScreen(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  const query = useMemo(() => readLinesQuery(new URLSearchParams(search)), [search]);
  const { isLoggedIn } = useSessionContext();
  const { getKundengelderLines } = useDashboard();
  const [list, setList] = useState<KundengelderTxList>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  function onBack(): void {
    const next = sheetSearch(new URLSearchParams(search), query);
    navigate(`/dashboard/financial/kundengelder${next ? `?${next}` : ''}`);
  }

  useAdminGuard();
  useLayoutOptions({ title: 'Kundengelder', backButton: true, onBack, noMaxWidth: true });

  useEffect(() => {
    if (!isLoggedIn) return;
    const parsed = readLinesQuery(new URLSearchParams(search));
    if (!parsed) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(undefined);
    setList(undefined);
    getKundengelderLines(parsed.year, parsed.account, parsed.line)
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, search, getKundengelderLines]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-96">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
    );
  }

  if (!query) {
    return (
      <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
        <h1 className="text-lg font-semibold">Buchungen</h1>
        <ErrorHint message="Die Buchung fehlt." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      <div className="bg-white rounded-lg shadow p-4">
        <h1 className="mb-2 text-lg font-semibold">Buchungen · {query.label}</h1>
        {error && <ErrorHint message={error} />}
        {list && <TxTable list={list} />}
      </div>
    </div>
  );
}

function TxTable({ list }: { list: KundengelderTxList }): JSX.Element {
  if (list.rows.length === 0) {
    return (
      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td>Keine Buchungen</td>
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
          <th className="text-left py-1 px-2 font-semibold">Buchungsdatum</th>
          <th className="text-left py-1 px-2 font-semibold">Art</th>
          <th className="text-right py-1 px-2 font-semibold">Betrag</th>
          <th className="text-right py-1 px-2 font-semibold">Nach Gebühr</th>
          <th className="text-left py-1 px-2 font-semibold">Instruktion</th>
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
