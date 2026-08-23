import { useAuthContext, UserRole } from '@dfx.swiss/react';
import { SpinnerSize, StyledButton, StyledButtonWidth, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitQuotesGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { quoteIsDeactivated } from 'src/dto/realunit.dto';
import { blankedAddress, formatSwissDateTimeWithSeconds } from 'src/util/utils';

const CONFIRM_PAYMENT_ROLES = [UserRole.ADMIN, UserRole.REALUNIT, UserRole.COMPLIANCE];

type QuoteAction = 'confirmPayment' | 'deactivate';

export default function RealunitQuoteDetailScreen(): JSX.Element {
  useRealunitQuotesGuard();

  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { session } = useAuthContext();
  const { id } = useParams<{ id: string }>();
  const { quotes, quotesLoading, quotesError, fetchQuotes, resetQuotes, confirmPayment, deactivateQuote } =
    useRealunitContext();
  const [pendingAction, setPendingAction] = useState<QuoteAction | undefined>();
  const [actionInFlight, setActionInFlight] = useState(false);

  useLayoutOptions({ title: translate('screens/realunit', 'Quote Detail'), backButton: true });

  useEffect(() => {
    if (!quotes.length) fetchQuotes();
  }, [fetchQuotes]);

  const quote = quotes.find((q) => q.id === Number(id));
  const userAddress = quote?.userAddress;

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

  if (quotesLoading && !quotes.length) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  // fetch failed: show an error instead of masquerading as "not found"
  if (quotesError && !quote) {
    return <ErrorHint message={translate('screens/realunit', 'Failed to load quote details.')} />;
  }

  // fetch succeeded, but the requested id is not present
  if (!quote) {
    return <p className="text-dfxGray-700">{translate('screens/realunit', 'Quote not found')}</p>;
  }

  const canConfirmPayment =
    quote.status === 'WaitingForPayment' &&
    !quoteIsDeactivated(quote) &&
    !!session?.role &&
    CONFIRM_PAYMENT_ROLES.includes(session.role);

  const canDeactivate = !quoteIsDeactivated(quote) && quote.status !== 'Completed' && quote.type === 'Buy';

  return (
    <div className="w-full">
      <h2 className="text-dfxGray-700 mb-4">{translate('screens/realunit', 'Quote Detail')}</h2>
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
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{translate('screens/realunit', 'Type')}</td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{displayType(quote.type)}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{translate('screens/realunit', 'Status')}</td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{quote.status}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{translate('screens/realunit', 'Amount')}</td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{quote.amount?.toLocaleString()}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {translate('screens/realunit', 'Estimated Amount')}
            </td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{quote.estimatedAmount?.toLocaleString()}</td>
          </tr>
          <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{translate('screens/realunit', 'Address')}</td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {userAddress ? (
                <button
                  type="button"
                  className="text-left text-sm text-dfxBlue-800 cursor-pointer hover:text-dfxBlue-600 hover:underline break-all bg-transparent border-0 p-0"
                  onClick={() => navigate(`/realunit/user/${encodeURIComponent(userAddress)}`)}
                >
                  {blankedAddress(userAddress, { displayLength: 22 })}
                </button>
              ) : (
                '-'
              )}
            </td>
          </tr>
          <tr
            className={
              quote.deactivatedAt
                ? 'border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300'
                : 'transition-colors hover:bg-dfxGray-300'
            }
          >
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{translate('screens/realunit', 'Created')}</td>
            <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
              {formatSwissDateTimeWithSeconds(quote.created)}
            </td>
          </tr>
          {quote.deactivatedAt && (
            <tr className="transition-colors hover:bg-dfxGray-300">
              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                {translate('screens/realunit', 'Deactivated At')}
              </td>
              <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                {formatSwissDateTimeWithSeconds(quote.deactivatedAt)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canConfirmPayment && (
        <div className="mt-6">
          <StyledButton
            label={translate('screens/realunit', 'Confirm Payment Received')}
            onClick={() => setPendingAction('confirmPayment')}
            disabled={!!pendingAction || actionInFlight}
            width={StyledButtonWidth.FULL}
          />
        </div>
      )}

      {canDeactivate && (
        <div className="mt-6">
          <StyledButton
            label={translate('screens/realunit', 'Deactivate Quote')}
            onClick={() => setPendingAction('deactivate')}
            disabled={!!pendingAction || actionInFlight}
            width={StyledButtonWidth.FULL}
          />
        </div>
      )}

      {pendingAction && (
        <ConfirmationOverlay
          message={
            pendingAction === 'confirmPayment'
              ? translate('screens/realunit', 'Are you sure you want to confirm the payment receipt?')
              : translate('screens/realunit', 'Are you sure you want to deactivate this quote?')
          }
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Confirm')}
          onCancel={() => {
            if (!actionInFlight) setPendingAction(undefined);
          }}
          onConfirm={async () => {
            setActionInFlight(true);
            try {
              if (pendingAction === 'confirmPayment') {
                await confirmPayment(quote.id);
              } else {
                await deactivateQuote(quote.id);
              }
              resetQuotes();
              setPendingAction(undefined);
              navigate('/realunit/quotes');
            } finally {
              setActionInFlight(false);
            }
          }}
        />
      )}
    </div>
  );
}
