import { Buy } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth } from '@dfx.swiss/react-components';
import { useRef, useState } from 'react';
import { useSettingsContext } from '../../contexts/settings.context';
import { canSimulatePayment, useSimulatePayment } from '../../hooks/simulate-payment.hook';

interface SimulatePaymentProps {
  buy: Buy;
}

// The SDK rejects with an ApiException (an Error); its message is the API's message, a list of validation
// messages arriving as one comma-separated string.
function apiMessage(caught: unknown): string | undefined {
  const message = (caught as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : undefined;
}

// Test tool of the DEV, STG and LOC builds: books the transfer of a pending buy without a bank.
// The caller renders it only when isTestEnvironment() holds.
export function SimulatePayment({ buy }: SimulatePaymentProps): JSX.Element | null {
  const { translate } = useSettingsContext();
  const { simulatePayment } = useSimulatePayment();
  const [isBusy, setIsBusy] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);

  if (!canSimulatePayment(buy)) return null;

  async function onSimulate(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setError(undefined);
    try {
      await simulatePayment(buy);
      setIsDone(true);
    } catch (caught) {
      setError(apiMessage(caught) ?? translate('screens/buy', 'Unknown error'));
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div
      data-testid="simulate-payment"
      className="flex w-full flex-col gap-2 rounded-md border border-dashed border-dfxRed-100 p-3"
    >
      <p className="text-sm text-dfxGray-800">
        {translate('screens/buy', 'Test environment: no real money is moved.')}
      </p>
      {isDone ? (
        <p className="text-sm font-bold text-dfxBlue-800">
          {translate('screens/buy', 'Payment simulated. The test transfer of {{amount}} {{currency}} is booked.', {
            amount: buy.amount,
            currency: buy.currency.name,
          })}
        </p>
      ) : (
        <StyledButton
          label={translate('screens/buy', 'Simulate payment')}
          onClick={() => void onSimulate()}
          color={StyledButtonColor.STURDY_WHITE}
          width={StyledButtonWidth.FULL}
          isLoading={isBusy}
          disabled={isBusy}
        />
      )}
      {error ? <p className="text-sm text-dfxRed-100">{error}</p> : null}
    </div>
  );
}
