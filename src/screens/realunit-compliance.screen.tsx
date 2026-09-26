import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from 'src/components/confirm-dialog';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitCustomerListDto, RealUnitNameCheckBatchDto } from 'src/dto/realunit-compliance.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { useRealunitCompliance } from 'src/hooks/realunit-compliance.hook';
import { formatDate } from 'src/util/compliance-helpers';
import {
  BalanceFilter,
  filterCustomers,
  InsiderFilter,
} from 'src/util/realunit-customer-filter';

type PendingConfirm = { type: 'row'; id: number } | { type: 'all' };

export default function RealunitComplianceScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { searchCustomers, screenCustomer, startNameCheckBatch, getNameCheckBatch } = useRealunitCompliance();
  const { navigate } = useNavigation();

  const [searchKey, setSearchKey] = useState('');
  const [results, setResults] = useState<RealUnitCustomerListDto[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all');
  const [insiderFilter, setInsiderFilter] = useState<InsiderFilter>('all');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [batch, setBatch] = useState<RealUnitNameCheckBatchDto>();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>();
  const [isConfirming, setIsConfirming] = useState(false);
  const lastSearchKeyRef = useRef<string | undefined>();
  const listLoadGenerationRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const pollInFlightRef = useRef(false);
  const pollGenerationRef = useRef(0);

  useLayoutOptions({
    title: translate('screens/compliance', 'RealUnit Compliance'),
    backButton: true,
    noMaxWidth: true,
  });

  function clearPoll(): void {
    pollGenerationRef.current++;
    if (pollRef.current !== undefined) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }

  function loadCustomers(key?: string): void {
    const generation = ++listLoadGenerationRef.current;
    lastSearchKeyRef.current = key;
    setIsLoading(true);
    setError(undefined);
    setResults(undefined);
    setIsSearchActive(!!key);
    searchCustomers(key)
      .then((res) => {
        if (generation !== listLoadGenerationRef.current) return;
        setResults(res);
      })
      .catch((e: Error) => {
        if (generation !== listLoadGenerationRef.current) return;
        setError(e.message ?? 'Unknown error');
      })
      .finally(() => {
        if (generation !== listLoadGenerationRef.current) return;
        setIsLoading(false);
      });
  }

  function startPolling(): void {
    clearPoll();
    const generation = pollGenerationRef.current;
    pollRef.current = setInterval(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      getNameCheckBatch()
        .then((status) => {
          if (generation !== pollGenerationRef.current) return;
          settleBatch(status, true);
          if (status.status === 'Running') return;
          clearPoll();
        })
        .catch((e: Error) => {
          if (generation !== pollGenerationRef.current) return;
          setError(e.message ?? 'Unknown error');
        })
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, 2000);
  }

  function settleBatch(status: RealUnitNameCheckBatchDto, reload: boolean): void {
    setBatch(status);
    if (status.status === 'Failed') {
      setError(status.error ?? 'Unknown error');
      return;
    }
    if (reload && status.status !== 'Running') loadCustomers(lastSearchKeyRef.current);
  }

  // Do not load customers on open. One GET of the name-check batch on mount; poll while running.
  useEffect(() => {
    const generation = pollGenerationRef.current;
    getNameCheckBatch()
      .then((status) => {
        if (generation !== pollGenerationRef.current) return;
        settleBatch(status, false);
        if (status.status === 'Running') startPolling();
      })
      .catch((e: Error) => {
        if (generation !== pollGenerationRef.current) return;
        setError(e.message ?? 'Unknown error');
      });
    return () => {
      listLoadGenerationRef.current++;
      clearPoll();
    };
  }, []);

  function handleSearch(): void {
    const key = searchKey.trim();
    if (!key) return;
    loadCustomers(key);
  }

  function handleLoadAll(): void {
    loadCustomers();
  }

  function handleConfirmScreen(): void {
    if (!pendingConfirm || isConfirming) return;
    const action = pendingConfirm;
    setIsConfirming(true);
    setError(undefined);
    const done = (): void => {
      setIsConfirming(false);
      setPendingConfirm(undefined);
    };
    if (action.type === 'row') {
      const listGeneration = listLoadGenerationRef.current;
      screenCustomer(action.id)
        .then(() => {
          if (listGeneration !== listLoadGenerationRef.current) return;
          loadCustomers(lastSearchKeyRef.current);
        })
        .catch((e: Error) => {
          if (listGeneration !== listLoadGenerationRef.current) return;
          setError(e.message ?? 'Unknown error');
        })
        .finally(() => {
          done();
        });
      return;
    }
    const generation = pollGenerationRef.current;
    startNameCheckBatch()
      .then((status) => {
        if (generation !== pollGenerationRef.current) return;
        settleBatch(status, true);
        done();
        if (status.status === 'Running') startPolling();
      })
      .catch((e: Error) => {
        if (generation !== pollGenerationRef.current) return;
        setError(e.message ?? 'Unknown error');
      })
      .finally(() => {
        if (generation !== pollGenerationRef.current) return;
        done();
      });
  }

  function formatNameCheckResult(customer: RealUnitCustomerListDto): string {
    switch (customer.lastNameCheckStatus) {
      case 'NoMatch':
        return translate('screens/compliance', 'No match');
      case 'MatchWithoutBirthday':
        return translate('screens/compliance', 'Match without Birthday');
      case 'MatchWithBirthday': {
        const label = translate('screens/compliance', 'Match with Birthday');
        return customer.lastNameCheckEvaluation ? label : `${label} (${translate('screens/compliance', 'Open')})`;
      }
      default:
        return '-';
    }
  }

  const displayedResults = useMemo(
    () => results && (isSearchActive ? results : filterCustomers(results, balanceFilter, insiderFilter)),
    [results, isSearchActive, balanceFilter, insiderFilter],
  );

  const hiddenCount = results && displayedResults ? results.length - displayedResults.length : 0;
  const isBatchRunning = batch?.status === 'Running';
  const screeningLocked = batch == null || isBatchRunning || isConfirming;

  return (
    <div className="w-full flex flex-col gap-3 text-left">
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="px-3 py-1.5 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 flex-1"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading && !isConfirming) handleSearch();
            }}
            placeholder={translate('screens/compliance', 'Search by ID, email, phone or name...')}
          />
          <button
            className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
            onClick={handleSearch}
            disabled={isLoading || isConfirming || !searchKey.trim()}
          >
            {isLoading ? '…' : translate('general/actions', 'Search')}
          </button>
          <button
            className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            onClick={handleLoadAll}
            disabled={isLoading || isConfirming}
          >
            {translate('screens/compliance', 'Load all customers')}
          </button>
          <button
            className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            onClick={() => setPendingConfirm({ type: 'all' })}
            disabled={isLoading || screeningLocked}
          >
            {batch?.status === 'Running'
              ? translate('screens/compliance', 'Screening {{done}} / {{total}}', {
                  done: batch.done,
                  total: batch.total,
                })
              : translate('screens/compliance', 'Screen all')}
          </button>
        </div>
        {error && <ErrorHint message={error} />}
      </div>

      {isLoading && <StyledLoadingSpinner size={SpinnerSize.LG} />}

      {!results && !isLoading && (
        <p className="p-4 text-sm text-dfxGray-700 bg-white rounded-lg shadow-sm">
          {translate('screens/compliance', 'No customers loaded. Search for a name or load all customers.')}
        </p>
      )}

      {results && !isLoading && (
        <div className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dfxBlue-800">
          <span className="font-semibold">
            {translate('screens/compliance', 'Customers')}: {displayedResults?.length ?? 0}
            {hiddenCount > 0 ? ` / ${results.length}` : ''}
          </span>
          {!isSearchActive && (
            <>
              <label className="flex items-center gap-1.5">
                {translate('screens/compliance', 'Balance')}
                <select
                  className="px-2 py-1 border border-dfxGray-400 rounded bg-white"
                  value={balanceFilter}
                  onChange={(e) => setBalanceFilter(e.target.value as BalanceFilter)}
                >
                  <option value="all">{translate('screens/compliance', 'All')}</option>
                  <option value="with">{translate('screens/compliance', 'With balance')}</option>
                  <option value="without">{translate('screens/compliance', 'Without balance')}</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                {translate('screens/compliance', 'Shareholders')}
                <select
                  className="px-2 py-1 border border-dfxGray-400 rounded bg-white"
                  value={insiderFilter}
                  onChange={(e) => setInsiderFilter(e.target.value as InsiderFilter)}
                >
                  <option value="all">{translate('screens/compliance', 'All')}</option>
                  <option value="insider">{translate('screens/compliance', 'Internal shareholders (insider)')}</option>
                  <option value="normal">{translate('screens/compliance', 'Not internal shareholders (normal)')}</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {displayedResults && !isLoading && (
        <div className="bg-white rounded-lg shadow-sm overflow-auto scroll-shadow">
          {displayedResults.length === 0 ? (
            <p className="p-4 text-sm text-dfxGray-700">
              {hiddenCount > 0
                ? translate('screens/compliance', 'All accounts are hidden by the filter above')
                : translate('screens/compliance', 'No entries found')}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-dfxGray-300">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/kyc', 'Account Type')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/kyc', 'Name')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800 break-all">
                    {translate('screens/compliance', 'Email')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/kyc', 'KYC Status')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/kyc', 'KYC Level')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-dfxBlue-800">
                    {translate('screens/compliance', 'Balance (REALU)')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/compliance', 'Insider')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/compliance', 'Last Dilisense check')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                    {translate('screens/compliance', 'Result')}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800" />
                </tr>
              </thead>
              <tbody>
                {displayedResults.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxBlue-400 cursor-pointer group"
                    onClick={() => navigate(`/realunit/compliance/user/${u.id}`)}
                  >
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.id}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.accountType ?? '-'}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.name ?? '-'}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white break-all">{u.mail ?? '-'}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.kycStatus}</td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.kycLevel ?? '-'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-dfxBlue-800 group-hover:text-white">
                      {u.balance != null ? u.balance.toLocaleString('de-CH') : '-'}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                      {u.realUnitInsider
                        ? translate('screens/compliance', 'Internal shareholders (insider)')
                        : translate('screens/compliance', 'Not internal shareholders (normal)')}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">
                      {u.lastNameCheckDate ? formatDate(u.lastNameCheckDate) : '-'}
                    </td>
                    <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{formatNameCheckResult(u)}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium bg-white border border-dfxGray-400 text-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors disabled:opacity-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingConfirm({ type: 'row', id: u.id });
                        }}
                        disabled={!u.canScreen || screeningLocked}
                        title={
                          !u.canScreen ? translate('screens/compliance', 'Cannot screen without a name') : undefined
                        }
                      >
                        {translate('screens/compliance', 'Screen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingConfirm != null}
        title={translate('screens/compliance', pendingConfirm?.type === 'all' ? 'Screen all' : 'Screen')}
        message={translate(
          'screens/compliance',
          pendingConfirm?.type === 'all'
            ? 'Screening all named shareholders consumes Dilisense quota – continue?'
            : 'A Dilisense screening consumes provider quota and costs money – continue?',
        )}
        isLoading={isConfirming}
        onConfirm={handleConfirmScreen}
        onCancel={() => {
          if (!isConfirming) setPendingConfirm(undefined);
        }}
      />
    </div>
  );
}
