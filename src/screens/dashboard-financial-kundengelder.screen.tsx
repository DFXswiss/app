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

type SheetLineWithKey = KundengelderSheetLine & { lineKey: string };

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

function openedLabel(sheet: KundengelderSheet, opened: OpenedLine): string {
  for (const row of sheet.rows ?? []) {
    if (row.sollLineKey === opened.lineKey && row.sollLabel) return row.sollLabel;
    if (row.habenLineKey === opened.lineKey && row.habenLabel) return row.habenLabel;
  }
  return opened.lineKey;
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
  const [accountKey, setAccountKey] = useState('');
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

        if (sheet.rows && sheet.rows.length > 0) {
          const fromRows = sheet.rows.flatMap((row) => {
            const records: Array<Array<string | number>> = [];
            if (row.sollLabel || row.sollAmount != null) {
              records.push([
                sheet.name,
                sheet.accountNo ?? '',
                'Soll',
                movementDate(sheet.soll, row.sollLineKey),
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
                movementDate(sheet.haben, row.habenLineKey),
                row.habenLabel ?? '',
                row.habenAmount ?? '',
                sheet.currency,
                '',
              ]);
            }
            return records;
          });
          return [...fromRows, summeSoll, summeHaben, kontrolle, ...pruefung];
        }

        return [
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
          summeSoll,
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
          summeHaben,
          kontrolle,
          ...pruefung,
        ];
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
              opened={opened}
              onLine={(line) => onLineClick(sheet.key, sheet.iban ?? sheet.key, line.lineKey)}
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
                  {account.lines.map((line) => {
                    return (
                      <Fragment key={line.key}>
                        <tr
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => onLineClick(account.key, account.iban ?? account.key, line.key)}
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
  opened,
  onLine,
}: {
  sheet: KundengelderSheet;
  opened?: OpenedLine;
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  const hasRows = Boolean(sheet.rows && sheet.rows.length > 0);
  return (
    <div data-sheet={sheet.key} className="bg-white rounded-lg shadow p-4">
      {hasRows ? (
        <SheetDocument sheet={sheet} opened={opened} onLine={onLine} />
      ) : (
        <>
          <h2 className="text-lg font-semibold">{sheet.name}</h2>
          <div className="text-sm mb-3 space-y-0.5" style={{ color: '#374151' }}>
            {sheet.accountNo && (
              <div>
                <span className="font-medium">Kontonummer</span> <span>{sheet.accountNo}</span>
              </div>
            )}
            {sheet.iban && (
              <div>
                <span className="font-medium">Bankkonto</span> <span>{sheet.iban}</span>
              </div>
            )}
            {sheet.periodStart && (
              <div>
                <span className="font-medium">Startdatum</span> <span>{sheet.periodStart}</span>
              </div>
            )}
            {sheet.periodEnd && (
              <div>
                <span className="font-medium">Enddatum</span> <span>{sheet.periodEnd}</span>
              </div>
            )}
          </div>
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
          <div className="mt-3 flex flex-wrap gap-6 text-sm font-medium">
            <span>
              Summe Soll {formatAmount(sheet.sollSum)} {sheet.currency}
            </span>
            <span>
              Summe Haben {formatAmount(sheet.habenSum)} {sheet.currency}
            </span>
          </div>
          <div className={`mt-1 text-sm font-medium ${sheet.control !== 0 ? 'text-dfxRed-100' : ''}`}>
            Kontrolle {formatAmount(sheet.control)} {sheet.currency}
          </div>
        </>
      )}
      {sheet.openingCheck && <OpeningCheck sheet={sheet} />}
      {hasRows && opened && opened.viewKey === sheet.key && (
        <Bookings title={openedLabel(sheet, opened)} opened={opened} />
      )}
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
  opened,
  onLine,
}: {
  sheet: KundengelderSheet;
  opened?: OpenedLine;
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
      <SheetTable sheet={sheet} rows={sheet.rows ?? []} opened={opened} onLine={onLine} />
    </>
  );
}

const LEDGER_CELL = 'border border-black px-2 py-1 align-top break-words';

function SheetTable({
  sheet,
  rows,
  opened,
  onLine,
}: {
  sheet: KundengelderSheet;
  rows: KundengelderSheetRow[];
  opened?: OpenedLine;
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
            <SheetRowView
              key={`${index}-${row.sollLabel ?? ''}-${row.habenLabel ?? ''}`}
              row={row}
              sheet={sheet}
              opened={opened}
              onLine={onLine}
            />
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
  sheet,
  opened,
  onLine,
}: {
  row: KundengelderSheetRow;
  sheet: KundengelderSheet;
  opened?: OpenedLine;
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  const sollOpen =
    opened && row.sollLineKey != null && opened.viewKey === sheet.key && opened.lineKey === row.sollLineKey;
  const habenOpen =
    opened && row.habenLineKey != null && opened.viewKey === sheet.key && opened.lineKey === row.habenLineKey;
  const band = rowBand(row);
  return (
    <tr
      className={row.section ? 'font-semibold' : undefined}
      style={{
        backgroundColor: band,
        boxShadow: sollOpen || habenOpen ? 'inset 0 0 0 2px #111827' : undefined,
      }}
    >
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

function Bookings({ title, opened }: { title: string; opened: OpenedLine }): JSX.Element {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">Buchungen · {title}</h3>
      {opened.error && <ErrorHint message={opened.error} />}
      {opened.list && <TxTable list={opened.list} />}
    </div>
  );
}

function OpeningCheck({ sheet }: { sheet: KundengelderSheet }): JSX.Element {
  const mismatch = sheet.openingCheck === 'mismatch';
  return <p className={`mt-3 text-sm ${mismatch ? 'text-dfxRed-100' : ''}`}>{openingCheckText(sheet)}</p>;
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
  onLine: (line: SheetLineWithKey) => void;
}): JSX.Element {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2 px-3 font-semibold">Datum</th>
          <th className="text-left py-2 px-3 font-semibold">{title}</th>
          <th className="text-right py-2 px-3 font-semibold">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => {
          const open = opened && opened.viewKey === sheetKey && line.lineKey != null && opened.lineKey === line.lineKey;
          return (
            <Fragment key={`${index}-${line.date ?? ''}-${line.label}-${line.amount}`}>
              <tr
                className={`border-b border-gray-100 ${line.lineKey ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                onClick={() => {
                  const { lineKey } = line;
                  if (lineKey) onLine({ ...line, lineKey });
                }}
              >
                <td className="py-1.5 px-3">{line.date ?? ''}</td>
                <td className="py-1.5 px-3">{line.label}</td>
                <td className="py-1.5 px-3 text-right">
                  {formatAmount(line.amount)} {currency}
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
            {formatAmount(sum)} {currency}
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
