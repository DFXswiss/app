import { useSessionContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { Fragment, useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { KundengelderAccount, KundengelderExtract, KundengelderLine, KundengelderTxList } from 'src/dto/dashboard.dto';
import { useDashboard } from 'src/hooks/dashboard.hook';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { downloadCsv, toSemicolonCsv } from 'src/util/semicolon-csv';

const CSV_HEADERS = ['Account', 'AccountKey', 'Line', 'Currency', 'Count', 'Amount', 'AmountChf'];

interface OpenedLine {
  accountKey: string;
  lineKey: string;
  list?: KundengelderTxList;
  error?: string;
}

function utcYearsFrom2022(): number[] {
  const end = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let year = 2022; year <= end; year++) {
    years.push(year);
  }
  return years;
}

function formatChf(value: number): string {
  return `${value.toLocaleString('de-CH')} CHF`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export default function DashboardFinancialKundengelderScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Kundengelder', noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getKundengelderExtract, getKundengelderLines } = useDashboard();

  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [extract, setExtract] = useState<KundengelderExtract>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [opened, setOpened] = useState<OpenedLine>();

  useEffect(() => {
    if (!isLoggedIn) return;

    setIsLoading(true);
    setOpened(undefined);
    setError(undefined);

    getKundengelderExtract(year)
      .then(setExtract)
      .catch((err: unknown) => {
        setExtract(undefined);
        setError(errorMessage(err));
      })
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, year]);

  function onYearChange(value: string): void {
    const next = Number(value);
    if (!Number.isInteger(next)) return;
    setYear(next);
  }

  function onLineClick(account: KundengelderAccount, line: KundengelderLine): void {
    const currentOpened = opened;
    if (currentOpened && currentOpened.accountKey === account.key && currentOpened.lineKey === line.key) {
      setOpened(undefined);
      return;
    }

    const accountKey = account.key;
    const lineKey = line.key;
    setOpened({ accountKey, lineKey });

    getKundengelderLines(year, accountKey, lineKey)
      .then((list) => {
        setOpened((current) =>
          current && current.accountKey === accountKey && current.lineKey === lineKey
            ? { accountKey, lineKey, list }
            : current,
        );
      })
      .catch((err: unknown) => {
        setOpened((current) =>
          current && current.accountKey === accountKey && current.lineKey === lineKey
            ? { accountKey, lineKey, error: errorMessage(err) }
            : current,
        );
      });
  }

  function exportCsv(): void {
    if (!extract) return;

    const rows = extract.accounts.flatMap((account) =>
      account.lines.map((line) => [
        account.name,
        account.key,
        line.label,
        line.currency,
        line.count,
        line.amount,
        line.amountChf,
      ]),
    );

    downloadCsv(`kundengelder-${year}.csv`, toSemicolonCsv(CSV_HEADERS, rows));
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-96">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
    );
  }

  const years = utcYearsFrom2022();
  const csvDisabled = !extract || extract.accounts.length === 0;

  return (
    <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Kundengelder</h1>
        <div className="flex flex-wrap items-center gap-4">
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
          <StyledButton
            label="Export CSV"
            width={StyledButtonWidth.MIN}
            color={StyledButtonColor.STURDY_WHITE}
            disabled={csvDisabled}
            onClick={exportCsv}
          />
        </div>
      </div>

      {error && <ErrorHint message={error} />}

      {extract?.accounts.map((account) => (
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
                {account.lines.map((line) => {
                  const currentOpened = opened;
                  const isOpen =
                    currentOpened !== undefined &&
                    currentOpened.accountKey === account.key &&
                    currentOpened.lineKey === line.key;
                  return (
                    <Fragment key={line.key}>
                      <tr
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => onLineClick(account, line)}
                      >
                        <td className="py-1.5 px-3">{line.label}</td>
                        <td className="py-1.5 px-3 text-right">{line.count}</td>
                        <td className="py-1.5 px-3 text-right">
                          {line.amount.toLocaleString('de-CH')} {line.currency}
                        </td>
                        <td className="py-1.5 px-3 text-right font-medium">{formatChf(line.amountChf)}</td>
                      </tr>
                      {isOpen && currentOpened && (
                        <tr>
                          <td colSpan={4} className="py-2 px-3 bg-gray-50">
                            {currentOpened.error && <ErrorHint message={currentOpened.error} />}
                            {currentOpened.list && <TxTable list={currentOpened.list} />}
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

      {extract !== undefined && extract.diffs !== undefined && (
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
