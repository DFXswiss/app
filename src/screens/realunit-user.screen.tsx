import {
  CopyButton,
  IconColor,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BalanceChart, BalanceMetric } from 'src/components/realunit/balance-chart';
import { ErrorHint } from 'src/components/error-hint';
import { ButtonGroup, ButtonGroupSize } from 'src/components/safe/button-group';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { PaginationDirection } from 'src/dto/realunit.dto';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { blankedAddress, formatCurrency, formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitUserScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { copy } = useClipboard();
  const { address } = useParams<{ address: string }>();
  const {
    accountSummary,
    history,
    isLoading,
    accountSummaryError,
    historyLoading,
    historyError,
    fetchAccountSummary,
    fetchAccountHistory,
    tokenPrice,
    tokenPriceLoading,
    tokenPriceError,
    fetchTokenPrice,
  } = useRealunitContext();

  const [metric, setMetric] = useState<BalanceMetric>(BalanceMetric.REALU);

  useEffect(() => {
    fetchTokenPrice();
  }, [fetchTokenPrice]);

  useEffect(() => {
    if (address) {
      fetchAccountSummary(address);
      fetchAccountHistory(address);
    }
  }, [address, fetchAccountSummary, fetchAccountHistory]);

  useLayoutOptions({ title: translate('screens/realunit', 'Account Summary'), backButton: true });

  const changePage = (dir: PaginationDirection) =>
    address &&
    fetchAccountHistory(
      address,
      dir === PaginationDirection.NEXT ? history?.pageInfo.endCursor : history?.pageInfo.startCursor,
      dir,
    );

  const currentBalance = useMemo(
    () =>
      accountSummary &&
      (metric === BalanceMetric.CHF
        ? tokenPrice
          ? formatCurrency(Number(accountSummary.balance) * tokenPrice.chf, 2, 2)
          : undefined
        : accountSummary.balance),
    [accountSummary, metric, tokenPrice],
  );
  const tokenPriceFailureVisible = metric === BalanceMetric.CHF && tokenPriceError;

  return (
    <>
      {isLoading && !accountSummary ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : accountSummaryError ? (
        <div>
          <ErrorHint message={translate('screens/realunit', 'Failed to load account summary.')} />
          <StyledButton
            label={translate('general/actions', 'Retry')}
            onClick={() => address && fetchAccountSummary(address)}
            width={StyledButtonWidth.MIN}
          />
          {historyError && (
            <>
              <ErrorHint message={translate('screens/realunit', 'Failed to load transaction history.')} />
              <StyledButton
                label={translate('general/actions', 'Retry')}
                onClick={() => address && fetchAccountHistory(address)}
                width={StyledButtonWidth.MIN}
              />
            </>
          )}
          {tokenPriceError && (
            <>
              <ErrorHint message={translate('screens/realunit', 'Failed to load token price.')} />
              <StyledButton
                label={translate('general/actions', 'Retry')}
                onClick={fetchTokenPrice}
                width={StyledButtonWidth.MIN}
              />
            </>
          )}
        </div>
      ) : !accountSummary ? (
        <p className="text-dfxGray-700">{translate('screens/realunit', 'No data available')}</p>
      ) : (
        <div className="w-full">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Account Details')}</h2>
              <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
                <thead>
                  <tr className="bg-dfxGray-300">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                      {translate('screens/realunit', 'Key')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                      {translate('screens/realunit', 'Value')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {translate('screens/realunit', 'Address')}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 break-all">
                      <div className="flex items-center gap-2">
                        <span>{blankedAddress(accountSummary.address, { displayLength: 22 })}</span>
                        <CopyButton color={IconColor.GRAY} onCopy={() => copy(accountSummary.address)} />
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {translate('screens/realunit', 'Address Type')}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{accountSummary.addressType}</td>
                  </tr>
                  <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {translate('screens/realunit', 'Balance')}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {accountSummary.balance} <span className="font-bold">REALU</span>
                    </td>
                  </tr>
                  <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {translate('screens/realunit', 'Last Updated')}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTimeWithSeconds(accountSummary.lastUpdated)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {accountSummary.historicalBalances && (
              <div className="shadow-card rounded-xl">
                <div id="chart-timeline" className="relative">
                  <div className="p-2 gap-2 flex flex-col items-start">
                    <div
                      className="relative w-full"
                      style={tokenPriceFailureVisible ? undefined : { height: '350px' }}
                    >
                      <div className="w-full flex flex-col gap-3 text-left leading-none z-10">
                        <h2 className="text-dfxBlue-800">{translate('screens/realunit', 'Balance History')}</h2>
                        <p className="text-dfxGray-700">{translate('screens/realunit', 'Current balance')}</p>
                        <div className="flex flex-row items-center gap-3 z-10">
                          <ButtonGroup<BalanceMetric>
                            items={Object.values(BalanceMetric)}
                            selected={metric}
                            onClick={setMetric}
                            buttonLabel={(m: BalanceMetric) => (m === BalanceMetric.CHF ? 'CHF' : 'REALU')}
                            size={ButtonGroupSize.SM}
                          />
                          <div className="text-dfxBlue-800">
                            {tokenPriceFailureVisible ? (
                              <div>
                                <ErrorHint message={translate('screens/realunit', 'Failed to load token price.')} />
                                <StyledButton
                                  label={translate('general/actions', 'Retry')}
                                  onClick={fetchTokenPrice}
                                  width={StyledButtonWidth.MIN}
                                />
                              </div>
                            ) : tokenPriceLoading && metric === BalanceMetric.CHF ? (
                              <StyledLoadingSpinner size={SpinnerSize.SM} />
                            ) : (
                              <>
                                <span className="text-lg font-bold">{currentBalance}</span>{' '}
                                <span className="text-base">{metric === BalanceMetric.CHF ? 'CHF' : 'REALU'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={tokenPriceFailureVisible ? 'relative mt-4' : 'absolute inset-0'}>
                        <BalanceChart
                          historicalBalances={accountSummary.historicalBalances}
                          metric={metric}
                          isLoading={false}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {historyLoading && !history ? (
              <StyledLoadingSpinner size={SpinnerSize.LG} />
            ) : historyError ? (
              <div>
                <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Transaction History')}</h2>
                <ErrorHint message={translate('screens/realunit', 'Failed to load transaction history.')} />
                <StyledButton
                  label={translate('general/actions', 'Retry')}
                  onClick={() => address && fetchAccountHistory(address)}
                  width={StyledButtonWidth.MIN}
                />
              </div>
            ) : history ? (
              <div>
                <h2 className="text-dfxGray-700 mb-4">
                  {translate('screens/realunit', 'Transaction History')} ({history.totalCount ?? 0})
                </h2>
                {historyLoading ? (
                  <StyledLoadingSpinner size={SpinnerSize.LG} />
                ) : history.history.length > 0 ? (
                  <>
                    <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
                      <thead>
                        <tr className="bg-dfxGray-300">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                            {translate('screens/realunit', 'Timestamp')}
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                            {translate('screens/realunit', 'Type')}
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                            {translate('screens/realunit', 'Details')}
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                            {translate('screens/realunit', 'Tx Hash')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.history.map((event, index) => {
                          const txHash = event.txHash;
                          return (
                            <tr
                              key={index}
                              className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300"
                            >
                              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                                {formatSwissDateTimeWithSeconds(event.timestamp)}
                              </td>
                              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{event.eventType}</td>
                              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                                {event.transfer && (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold">From:</span>
                                      <span>{blankedAddress(event.transfer.from ?? '', { displayLength: 22 })}</span>
                                      <CopyButton
                                        color={IconColor.GRAY}
                                        onCopy={() => copy(event.transfer?.from ?? '')}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold">To:</span>
                                      <span>{blankedAddress(event.transfer.to ?? '', { displayLength: 22 })}</span>
                                      <CopyButton
                                        color={IconColor.GRAY}
                                        onCopy={() => copy(event.transfer?.to ?? '')}
                                      />
                                    </div>
                                    <div>
                                      <span className="font-bold">Value:</span>{' '}
                                      {Number(event.transfer.value).toFixed(2)}
                                    </div>
                                  </div>
                                )}
                                {event.approval && (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span>Spender:</span>
                                      <span>{blankedAddress(event.approval.spender ?? '', { displayLength: 22 })}</span>
                                      <CopyButton
                                        color={IconColor.GRAY}
                                        onCopy={() => copy(event.approval?.spender ?? '')}
                                      />
                                    </div>
                                    <div>Value: {Number(event.approval.value).toFixed(2)}</div>
                                  </div>
                                )}
                                {event.tokensDeclaredInvalid && `Amount: ${event.tokensDeclaredInvalid.amount}`}
                                {event.addressTypeUpdate && `Type: ${event.addressTypeUpdate.addressType}`}
                              </td>
                              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 break-all">
                                {txHash ? (
                                  <div className="flex items-center gap-2">
                                    <span>{blankedAddress(txHash, { displayLength: 22 })}</span>
                                    <CopyButton color={IconColor.GRAY} onCopy={() => copy(txHash)} />
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="flex items-center justify-between gap-2 mt-4">
                      <StyledButton
                        label={translate('general/actions', 'Previous')}
                        onClick={() => changePage(PaginationDirection.PREV)}
                        disabled={!history.pageInfo.hasPreviousPage || historyLoading}
                        width={StyledButtonWidth.MIN}
                      />
                      <StyledButton
                        label={translate('general/actions', 'Next')}
                        onClick={() => changePage(PaginationDirection.NEXT)}
                        disabled={!history.pageInfo.hasNextPage || historyLoading}
                        width={StyledButtonWidth.MIN}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-dfxGray-700">{translate('screens/realunit', 'No transactions found')}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
