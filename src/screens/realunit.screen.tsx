import { CopyButton, IconColor, SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useRef } from 'react';
import { CopyableAddress } from 'src/components/realunit/copyable-address';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { quoteIsDeactivated } from 'src/dto/realunit.dto';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { blankedAddress, formatSwissDateTimeWithSeconds } from 'src/util/utils';

const thClass = 'px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap bg-dfxGray-300';
const tdClass = 'px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap';
const tdNumericClass = `${tdClass} text-right tabular-nums`;

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
    quotes,
    transactions,
    quotesLoading,
    transactionsLoading,
    fetchHolders,
    fetchTokenInfo,
    fetchQuotes,
    fetchTransactions,
  } = useRealunitContext();

  useLayoutOptions({ title: translate('screens/realunit', 'Overview'), backButton: true });

  const didBootstrapLists = useRef(false);
  useEffect(() => {
    if (didBootstrapLists.current) return;
    didBootstrapLists.current = true;
    if (!holders.length) fetchHolders();
    if (!tokenInfo) fetchTokenInfo();
    if (!quotes.length) fetchQuotes();
    if (!transactions.length) fetchTransactions();
  }, [fetchHolders, fetchTokenInfo, fetchQuotes, fetchTransactions]);

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

  const moreButton = (onClick: () => void) => (
    <button
      type="button"
      className="text-sm font-medium text-dfxBlue-800 hover:underline bg-transparent border-0 p-0"
      onClick={onClick}
    >
      {translate('general/actions', 'More')}
    </button>
  );

  return (
    <>
      {!holders.length && !tokenInfo ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg shadow-sm px-4 py-3 text-left">
              <div className="text-xs text-dfxGray-700">{translate('screens/realunit', 'Holders')}</div>
              <div className="text-xl font-semibold text-dfxBlue-800 tabular-nums">
                {totalCount?.toLocaleString() ?? '0'}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm px-4 py-3 text-left">
              <div className="text-xs text-dfxGray-700">{translate('screens/realunit', 'Shares')}</div>
              <div className="text-xl font-semibold text-dfxBlue-800 tabular-nums">
                {tokenInfo ? Number(tokenInfo.totalShares.total).toLocaleString() : '…'}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm px-4 py-3 text-left">
              <div className="text-xs text-dfxGray-700">{translate('screens/realunit', 'Total Supply')}</div>
              <div className="text-xl font-semibold text-dfxBlue-800 tabular-nums">
                {tokenInfo ? `${Number(tokenInfo.totalSupply.value).toLocaleString()} REALU` : '…'}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm px-4 py-3 text-left">
              <div className="text-xs text-dfxGray-700">{translate('screens/realunit', 'Pending Transactions')}</div>
              <div className="text-xl font-semibold text-dfxBlue-800 tabular-nums">
                {quotesLoading && !quotes.length ? '…' : pendingQuotes.length}
              </div>
            </div>
          </div>

          {isLoading && !tokenInfo && (
            <div className="shadow-card rounded-xl p-6 flex justify-center mb-6">
              <StyledLoadingSpinner size={SpinnerSize.MD} />
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
              <h2 className="text-base font-semibold text-dfxBlue-800 text-left px-4 pt-4 mb-3">
                {translate('screens/realunit', 'Top Holders')}
              </h2>
              <table className="w-full min-w-max border-collapse">
                <thead>
                  <tr className="bg-dfxGray-300">
                    <th className={thClass}>{translate('screens/realunit', 'Address')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Balance')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Percentage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topHolders.map((holder) => (
                    <tr
                      key={holder.address}
                      className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300"
                    >
                      <td className={tdClass}>
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
                      <td className={tdNumericClass}>{holder.balance}</td>
                      <td className={tdNumericClass}>{holder.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {holders.length > 3 && moreButton(() => navigate('/realunit/holders'))}
            </div>
            {tokenInfo && (
              <div className="bg-white rounded-lg shadow-sm px-4 py-3 text-left">
                <div className="text-xs text-dfxGray-700">{translate('screens/realunit', 'Timestamp')}</div>
                <div className="text-xl font-semibold text-dfxBlue-800 tabular-nums">
                  {formatSwissDateTimeWithSeconds(tokenInfo.totalSupply.timestamp)}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
              <h2 className="text-base font-semibold text-dfxBlue-800 text-left px-4 pt-4 mb-3">
                {translate('screens/realunit', 'Pending Transactions')}
              </h2>
              <table className="w-full min-w-max border-collapse">
                <thead>
                  <tr className="bg-dfxGray-300">
                    <th className={thClass}>{translate('screens/realunit', 'Type')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Amount')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Address')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Name')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topQuotes.map((quote) => (
                    <tr
                      key={quote.id}
                      className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                      onClick={() => navigate(`/realunit/quotes/${quote.id}`)}
                    >
                      <td className={tdClass}>{displayType(quote.type)}</td>
                      <td className={tdNumericClass}>{quote.amount?.toLocaleString()}</td>
                      <td className={tdClass}>
                        <CopyableAddress address={quote.userAddress} />
                      </td>
                      <td className={tdClass}>{quote.userName ? quote.userName : '-'}</td>
                      <td className={tdClass}>{formatSwissDateTimeWithSeconds(quote.created)}</td>
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
              {pendingQuotes.length > 3 && moreButton(() => navigate('/realunit/quotes'))}
            </div>

            <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
              <h2 className="text-base font-semibold text-dfxBlue-800 text-left px-4 pt-4 mb-3">
                {translate('screens/realunit', 'Received Transactions')}
              </h2>
              <table className="w-full min-w-max border-collapse">
                <thead>
                  <tr className="bg-dfxGray-300">
                    <th className={thClass}>{translate('screens/realunit', 'Type')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Amount CHF')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Address')}</th>
                    <th className={thClass}>{translate('screens/realunit', 'Date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                      onClick={() => navigate(`/realunit/transactions/${tx.id}`)}
                    >
                      <td className={tdClass}>{displayType(tx.type)}</td>
                      <td className={tdNumericClass}>{tx.amountInChf?.toLocaleString()}</td>
                      <td className={tdClass}>
                        {tx.userAddress ? blankedAddress(tx.userAddress, { displayLength: 12 }) : '-'}
                      </td>
                      <td className={tdClass}>{formatSwissDateTimeWithSeconds(tx.outputDate ?? tx.created)}</td>
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
              {transactions.length > 3 && moreButton(() => navigate('/realunit/transactions'))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
