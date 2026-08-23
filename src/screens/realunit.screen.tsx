import {
  CopyButton,
  IconColor,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useEffect, useRef } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { BuyVolumeChart } from 'src/components/realunit/buy-volume-chart';
import { CopyableAddress } from 'src/components/realunit/copyable-address';
import { HolderCountChart } from 'src/components/realunit/holder-count-chart';
import { PriceHistoryChart } from 'src/components/realunit/price-history-chart';
import { RegistrationFunnel } from 'src/components/realunit/registration-funnel';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { quoteIsDeactivated } from 'src/dto/realunit.dto';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { Timeframe } from 'src/util/chart';
import { blankedAddress, formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { copy } = useClipboard();

  const {
    holders,
    totalCount,
    tokenInfo,
    isLoading,
    priceHistory,
    priceHistoryError,
    timeframe,
    quotes,
    transactions,
    quotesLoading,
    transactionsLoading,
    fetchHolders,
    fetchPriceHistory,
    fetchTokenInfo,
    fetchQuotes,
    fetchTransactions,
    buyVolume,
    buyVolumeLoading,
    buyVolumeError,
    holderCount,
    holderCountLoading,
    holderCountError,
    registrationStats,
    registrationLoading,
    registrationError,
    fetchBuyVolume,
    fetchHolderCount,
    fetchRegistrationStats,
    buyVolumeTimeframe,
    holderCountTimeframe,
  } = useRealunitContext();

  useLayoutOptions({ backButton: true });

  const didBootstrapLists = useRef(false);
  useEffect(() => {
    if (didBootstrapLists.current) return;
    didBootstrapLists.current = true;
    if (!holders.length) fetchHolders();
    if (!tokenInfo) fetchTokenInfo();
    if (!priceHistory.length) fetchPriceHistory();
    if (!quotes.length) fetchQuotes();
    if (!transactions.length) fetchTransactions();
  }, [fetchHolders, fetchTokenInfo, fetchQuotes, fetchTransactions, fetchPriceHistory]);

  const didBootstrapStats = useRef(false);
  useEffect(() => {
    if (didBootstrapStats.current) return;
    didBootstrapStats.current = true;
    fetchBuyVolume(Timeframe.ALL);
    fetchHolderCount(Timeframe.ALL);
    fetchRegistrationStats(Timeframe.ALL);
  }, [fetchBuyVolume, fetchHolderCount, fetchRegistrationStats]);

  const topHolders = holders.slice(0, 3);
  const pendingQuotes = quotes.filter((quote) => !quoteIsDeactivated(quote));
  const topQuotes = pendingQuotes.slice(0, 3);
  const topTransactions = transactions.slice(0, 3);

  const displayType = (type: string): string => {
    switch (type) {
      case 'BuyFiat':
        return 'Sell';
      case 'BuyCrypto':
        return 'Buy';
      default:
        return type;
    }
  };

  const handleAddressClick = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    navigate(`/realunit/user/${encodedAddress}`);
  };

  return (
    <>
      {!holders.length && !tokenInfo ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="w-full">
          <div className="flex flex-wrap gap-2 mb-6">
            <StyledButton
              label={translate('screens/support', 'RealUnit Support')}
              onClick={() => navigate('/realunit/support')}
              width={StyledButtonWidth.MIN}
              color={StyledButtonColor.STURDY_WHITE}
            />
            <StyledButton
              label={translate('screens/compliance', 'RealUnit Compliance')}
              onClick={() => navigate('/realunit/compliance')}
              width={StyledButtonWidth.MIN}
              color={StyledButtonColor.STURDY_WHITE}
            />
          </div>
          <div className="mb-4">
            <h2 className="text-dfxGray-700 justify-center  mb-2">{translate('screens/realunit', 'Price History')}</h2>
            <PriceHistoryChart
              timeframe={timeframe}
              priceHistory={priceHistory}
              onTimeframeChange={fetchPriceHistory}
            />
            {priceHistoryError && (
              <div className="mt-4">
                <ErrorHint message={translate('screens/realunit', 'Failed to load price history.')} />
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-dfxGray-700 mb-2">{translate('screens/realunit', 'Buy Volume')}</h2>
            {buyVolumeLoading && !buyVolume.length ? (
              <StyledLoadingSpinner size={SpinnerSize.MD} />
            ) : (
              <BuyVolumeChart timeframe={buyVolumeTimeframe} series={buyVolume} onTimeframeChange={fetchBuyVolume} />
            )}
            {buyVolumeError && (
              <div className="mt-4">
                <ErrorHint message={translate('screens/realunit', 'Failed to load buy volume.')} />
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-dfxGray-700 mb-2">{translate('screens/realunit', 'Holders over time')}</h2>
            {holderCountLoading && !holderCount.length ? (
              <StyledLoadingSpinner size={SpinnerSize.MD} />
            ) : (
              <HolderCountChart
                timeframe={holderCountTimeframe}
                series={holderCount}
                onTimeframeChange={fetchHolderCount}
              />
            )}
            {holderCountError && (
              <div className="mt-4">
                <ErrorHint message={translate('screens/realunit', 'Failed to load holder count.')} />
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-dfxGray-700 mb-2">{translate('screens/realunit', 'Registration')}</h2>
            {registrationLoading && !registrationStats ? (
              <StyledLoadingSpinner size={SpinnerSize.MD} />
            ) : (
              registrationStats && <RegistrationFunnel stats={registrationStats} />
            )}
            {registrationError && (
              <div className="mt-4">
                <ErrorHint message={translate('screens/realunit', 'Failed to load registration stats.')} />
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="shadow-card rounded-xl p-6 flex justify-center mb-6">
              <StyledLoadingSpinner size={SpinnerSize.MD} />
            </div>
          ) : (
            tokenInfo && (
              <div className="mb-6">
                <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'RealUnit ')}</h2>
                <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
                  <thead>
                    <tr className="bg-dfxGray-300">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                        {translate('screens/realunit', 'Overview')}
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                        {translate('screens/realunit', '')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {translate('screens/realunit', 'Holders')}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 font-semibold">
                        {totalCount?.toLocaleString() ?? '0'}
                      </td>
                    </tr>
                    <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {translate('screens/realunit', 'Shares')}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 font-semibold">
                        {Number(tokenInfo.totalShares.total).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {translate('screens/realunit', 'Total Supply')}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 font-semibold">
                        {Number(tokenInfo.totalSupply.value).toLocaleString()} REALU
                      </td>
                    </tr>

                    <tr className="transition-colors hover:bg-dfxGray-300">
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {translate('screens/realunit', 'Timestamp')}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800 font-semibold">
                        {formatSwissDateTimeWithSeconds(tokenInfo.totalSupply.timestamp)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          )}

          <div className="w-full overflow-x-auto mt-8 mb-4">
            <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Top Holders')}</h2>
            <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
              <thead>
                <tr className="bg-dfxGray-300">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Address')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Balance')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Percentage')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {topHolders.map((holder) => (
                  <tr
                    key={holder.address}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300"
                  >
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-sm text-dfxBlue-800 cursor-pointer hover:text-dfxBlue-600 hover:underline break-all bg-transparent border-0 p-0"
                          onClick={() => handleAddressClick(holder.address)}
                        >
                          {blankedAddress(holder.address, { displayLength: 18 })}
                        </button>
                        <CopyButton color={IconColor.GRAY} onCopy={() => copy(holder.address)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{holder.balance}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{holder.percentage.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {holders.length > 3 && (
            <div className="flex justify-center mt-4">
              <StyledButton
                label={translate('general/actions', 'More')}
                onClick={() => navigate('/realunit/holders')}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            </div>
          )}

          <div className="w-full overflow-x-auto mt-8 mb-4">
            <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Pending Transactions')}</h2>
            <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
              <thead>
                <tr className="bg-dfxGray-300">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Type')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Amount')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Address')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Created')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topQuotes.map((quote) => (
                  <tr
                    key={quote.id}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                    onClick={() => navigate(`/realunit/quotes/${quote.id}`)}
                  >
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{displayType(quote.type)}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{quote.amount?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      <CopyableAddress address={quote.userAddress} />
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {quote.userName ? quote.userName : '-'}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTimeWithSeconds(quote.created)}
                    </td>
                  </tr>
                ))}
                {!pendingQuotes.length && !quotesLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-center text-sm text-dfxGray-700">
                      {translate('screens/realunit', 'No pending transactions found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {quotesLoading && !quotes.length && (
              <div className="flex justify-center mt-4">
                <StyledLoadingSpinner size={SpinnerSize.SM} />
              </div>
            )}
          </div>

          {pendingQuotes.length > 3 && (
            <div className="flex justify-center mt-4">
              <StyledButton
                label={translate('general/actions', 'More')}
                onClick={() => navigate('/realunit/quotes')}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            </div>
          )}

          <div className="w-full overflow-x-auto mt-8 mb-4">
            <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Received Transactions')}</h2>
            <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
              <thead>
                <tr className="bg-dfxGray-300">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Type')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Amount CHF')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Address')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/realunit', 'Date')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                    onClick={() => navigate(`/realunit/transactions/${tx.id}`)}
                  >
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{displayType(tx.type)}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{tx.amountInChf?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {tx.userAddress ? blankedAddress(tx.userAddress, { displayLength: 12 }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTimeWithSeconds(tx.outputDate ?? tx.created)}
                    </td>
                  </tr>
                ))}
                {!transactions.length && !transactionsLoading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-sm text-dfxGray-700">
                      {translate('screens/realunit', 'No received transactions found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {transactionsLoading && !transactions.length && (
              <div className="flex justify-center mt-4">
                <StyledLoadingSpinner size={SpinnerSize.SM} />
              </div>
            )}
          </div>

          {transactions.length > 3 && (
            <div className="flex justify-center mt-4">
              <StyledButton
                label={translate('general/actions', 'More')}
                onClick={() => navigate('/realunit/transactions')}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
