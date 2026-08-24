import { SpinnerSize, StyledButton, StyledButtonWidth, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { CopyableAddress } from 'src/components/realunit/copyable-address';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { quoteIsDeactivated } from 'src/dto/realunit.dto';
import { useRealunitQuotesGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { formatSwissDateTimeWithSeconds } from 'src/util/utils';

export default function RealunitQuotesScreen(): JSX.Element {
  useRealunitQuotesGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { quotes, quotesLoading, quotesError, fetchQuotes } = useRealunitContext();

  useLayoutOptions({ title: translate('screens/realunit', 'Pending Transactions'), backButton: true });

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

  const pendingQuotes = quotes.filter((quote) => !quoteIsDeactivated(quote));

  useEffect(() => {
    if (!quotes.length) fetchQuotes();
  }, [fetchQuotes]);

  return (
    <>
      {quotesLoading && !quotes.length ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <div className="w-full">
          <div className="w-full overflow-x-auto mb-4">
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
                {pendingQuotes.map((quote) => (
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
                {!pendingQuotes.length && !quotesLoading && !quotesError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-center text-sm text-dfxGray-700">
                      {translate('screens/realunit', 'No pending transactions found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {quotesError && (
            <div className="mt-4">
              <ErrorHint message={translate('screens/realunit', 'Failed to load pending transactions.')} />
            </div>
          )}

          {quotes.length > 0 && (
            <div className="flex justify-center mt-4">
              <StyledButton
                label={translate('general/actions', 'More')}
                onClick={fetchQuotes}
                disabled={quotesLoading}
                width={StyledButtonWidth.FULL}
              />
            </div>
          )}
          {quotesLoading && quotes.length > 0 && (
            <div className="flex justify-center mt-4">
              <StyledLoadingSpinner size={SpinnerSize.SM} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
