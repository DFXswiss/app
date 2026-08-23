import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { blankedAddress, formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitTransactionDetailScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { id } = useParams<{ id: string }>();
  const { transactions, transactionsLoading, transactionsError, fetchTransactions } = useRealunitContext();

  useLayoutOptions({ title: translate('screens/realunit', 'Transaction Detail'), backButton: true });

  useEffect(() => {
    if (!transactions.length) fetchTransactions();
  }, [fetchTransactions]);

  const transaction = transactions.find((t) => t.id === Number(id));

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

  if (transactionsLoading && !transactions.length) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  // fetch failed: show an error instead of masquerading as "not found"
  if (transactionsError && !transaction) {
    return <ErrorHint message={translate('screens/realunit', 'Failed to load transaction details.')} />;
  }

  // fetch succeeded, but the requested id is not present
  if (!transaction) {
    return <p className="text-dfxGray-700">{translate('screens/realunit', 'Transaction not found')}</p>;
  }

  return (
    <div className="w-full">
      <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Transaction Detail')}</h2>
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
              {translate('screens/realunit', 'Type')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{displayType(transaction.type)}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {translate('screens/realunit', 'Amount CHF')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {transaction.amountInChf?.toLocaleString()}
            </td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {translate('screens/realunit', 'Assets')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{transaction.assets}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {translate('screens/realunit', 'Address')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {transaction.userAddress ? (
                <button
                  type="button"
                  className="text-left text-sm text-dfxBlue-800 cursor-pointer hover:text-dfxBlue-600 hover:underline break-all bg-transparent border-0 p-0"
                  onClick={() => navigate(`/realunit/user/${encodeURIComponent(transaction.userAddress ?? '')}`)}
                >
                  {blankedAddress(transaction.userAddress, { displayLength: 22 })}
                </button>
              ) : (
                '-'
              )}
            </td>
          </tr>
          <tr className="transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {translate('screens/realunit', 'Date')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {formatSwissDateTimeWithSeconds(transaction.outputDate ?? transaction.created)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
