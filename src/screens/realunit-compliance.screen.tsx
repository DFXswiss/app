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
import { isEmptyAccount } from 'src/util/realunit-customer-filter';

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
  // presentation-only default filter; the loaded list always stays complete (see realunit-customer-filter)
  const [hideEmpty, setHideEmpty] = useState(true);
  // whether the current results were loaded with a search key (searchKey is just the live input value)
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
    const previousStatus = batch?.status;
    setBatch(status);
    if (status.status === 'Failed') {
      setError(status.error ?? 'Unknown error');
      return;
    }
    if (previousStatus === 'Failed') setError(undefined);
    if (reload && status.status !== 'Running') loadCustomers(lastSearchKeyRef.current);
  }

  // Load the complete customer list upfront; a search key narrows it down, an empty search returns to the
  // unsearched view. The hide-empty toggle state deliberately persists across searches (user choice wins);
  // "re-engaged" only means the search bypass ends. One GET of the name-check batch on mount; poll while running.
  useEffect(() => {
    const generation = pollGenerationRef.current;
    loadCustomers();
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
    loadCustomers(searchKey.trim() || undefined);
  }

  function handleConfirmScreen(): void {
    if (!pendingConfirm || isConfirming) return;
    const action = pendingConfirm;
    setIsConfirming(true);
    const done = (): void => {
      setIsConfirming(false);
      setPendingConfirm(undefined);
    };
    if (action.type === 'row') {
      const listGeneration = listLoadGenerationRef.current;
      screenCustomer(action.id)
        .then(() => {
          if (listGeneration !== listLoadGenerationRef.current) return;
          done();
          loadCustomers(lastSearchKeyRef.current);
        })
        .catch((e: Error) => {
          if (listGeneration !== listLoadGenerationRef.current) return;
          setError(e.message ?? 'Unknown error');
        })
        .finally(() => {
          if (listGeneration !== listLoadGenerationRef.current) return;
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
    // Wire values still use the backend NameCheckRiskStatus names. A Dilisense list
    // hit is a match, not a sanction — display only Match with/without Birthday.
    switch (customer.lastNameCheckStatus) {
      case 'NotSanctioned':
        return translate('screens/compliance', 'No match');
      case 'MatchWithoutBirthday':
        return translate('screens/compliance', 'Match without Birthday');
      case 'Sanctioned': {
        const label = translate('screens/compliance', 'Match with Birthday');
        return customer.lastNameCheckEvaluation ? label : `${label} (${translate('screens/compliance', 'Open')})`;
      }
      default:
        return '-';
    }
  }

  // An active search always shows every match: whoever searches for a specific customer must find them,
  // hidden rows included (that blind spot is exactly what this screen once suffered from). Filtering never
  // reorders: rows keep their API position.
  const displayedResults = useMemo(
    () => results && (isSearchActive || !hideEmpty ? results : results.filter((c) => !isEmptyAccount(c))),
    [results, isSearchActive, hideEmpty],
  );

  const hiddenCount = results && displayedResults ? results.length - displayedResults.length : 0;
  const emptyCount = useMemo(() => (results ?? []).filter(isEmptyAccount).length, [results]);
  const isBatchRunning = batch?.status === 'Running';
  const screeningLocked = batch == null || isBatchRunning || isConfirming;

  return (
    <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-3 p-4 md:p-6 text-left">
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="px-3 py-1.5 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 flex-1"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading) handleSearch();
            }}
            placeholder={translate('screens/compliance', 'Search by ID, email, phone or name...')}
          />
          <button
            className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
            onClick={handleSearch}
            disabled={isLoading}
          >
            {isLoading ? '…' : translate('general/actions', 'Search')}
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

      {results && !isLoading && (
        <div className="bg-white rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dfxBlue-800">
          <span className="font-semibold">
            {translate('screens/compliance', 'Customers')}: {results.length}
          </span>
          {!isSearchActive && emptyCount > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
              {translate('screens/compliance', 'Hide empty accounts')} ({emptyCount})
            </label>
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
