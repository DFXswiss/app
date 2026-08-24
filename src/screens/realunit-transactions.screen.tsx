import { SpinnerSize, StyledButton, StyledButtonWidth, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { blankedAddress, formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitTransactionsScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { transactions, transactionsLoading, transactionsError, fetchTransactions } = useRealunitContext();

  useLayoutOptions({ title: translate('screens/realunit', 'Received Transactions'), backButton: true });

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

  useEffect(() => {
    if (!transactions.length) fetchTransactions();
  }, [fetchTransactions]);

  return (
    <>
      {transactionsLoading && !transactions.length ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="w-full">
          <div className="w-full overflow-x-auto mb-4">
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
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300 cursor-pointer"
                    onClick={() => navigate(`/realunit/transactions/${tx.id}`)}
                  >
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{displayType(tx.type)}</td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {tx.amountInChf?.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {tx.userAddress ? blankedAddress(tx.userAddress, { displayLength: 12 }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                      {formatSwissDateTimeWithSeconds(tx.outputDate ?? tx.created)}
                    </td>
                  </tr>
                ))}
                {!transactions.length && !transactionsLoading && !transactionsError && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-sm text-dfxGray-700">
                      {translate('screens/realunit', 'No received transactions found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {transactionsError && (
            <div className="mt-4">
              <ErrorHint message={translate('screens/realunit', 'Failed to load received transactions.')} />
            </div>
          )}

          {transactions.length > 0 && (
            <div className="flex justify-center mt-4">
              <StyledButton
                label={translate('general/actions', 'More')}
                onClick={fetchTransactions}
                disabled={transactionsLoading}
                width={StyledButtonWidth.FULL}
              />
            </div>
          )}
          {transactionsLoading && transactions.length > 0 && (
            <div className="flex justify-center mt-4">
              <StyledLoadingSpinner size={SpinnerSize.SM} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
