import type { SimulateBankPayment } from '@dfx.swiss/core';
import { Buy, Sell, useBuy, useSell } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth } from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useSettingsContext } from '../../contexts/settings.context';
import { isTestNetwork } from '../../util/test-network';

// One idempotency key per buy route for the life of this tab. A double click, a retry after a
// timeout or a second visit of the completion screen sends the same key, so the API books the
// simulated bank payment once per route.
const paymentKeys = new Map<number, string>();
const TAB_NONCE = Date.now().toString(36);

export function simulationKey(routeId: number): string {
  let key = paymentKeys.get(routeId);
  if (key === undefined) {
    key = `simulate-buy-${routeId}-${TAB_NONCE}`;
    paymentKeys.set(routeId, key);
  }
  return key;
}

type SimulationState = 'idle' | 'busy' | 'done' | 'failed';

function messageOf(error: unknown): string | undefined {
  return error instanceof Error && error.message.trim() !== '' ? error.message : undefined;
}

function SimulationButton({
  label,
  doneText,
  run,
}: {
  label: string;
  doneText: string;
  run: () => Promise<unknown>;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const [state, setState] = useState<SimulationState>('idle');
  const [error, setError] = useState<string>();

  async function start(): Promise<void> {
    setState('busy');
    setError(undefined);
    try {
      await run();
      setState('done');
    } catch (caught) {
      setError(messageOf(caught));
      setState('failed');
    }
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="test-simulation">
      <p className="text-center text-xs text-dfxGray-700">
        {translate('screens/payment', 'Test environment only')}
      </p>
      {state === 'done' ? (
        <p role="status" className="text-center text-dfxBlue-800">
          {translate('screens/payment', doneText)}
        </p>
      ) : (
        <StyledButton
          label={translate('screens/payment', label)}
          onClick={() => void start()}
          isLoading={state === 'busy'}
          disabled={state === 'busy'}
          color={StyledButtonColor.STURDY_WHITE}
          width={StyledButtonWidth.FULL}
        />
      )}
      {state === 'failed' && (
        <p role="alert" className="text-center text-dfxRed-150">
          {error ?? translate('screens/payment', 'The simulation failed. Please try again.')}
        </p>
      )}
    </div>
  );
}

// DEV/STG only: books a simulated bank payment for the pending buy, as if the transfer had arrived.
export function SimulatePayment({ buy }: { buy: Buy }): JSX.Element | null {
  const { simulatePaymentFor } = useBuy();
  if (!isTestNetwork()) return null;
  const payment: SimulateBankPayment = {
    amount: buy.amount,
    currency: buy.currency.name,
    idempotencyKey: simulationKey(buy.routeId),
  };
  return (
    <SimulationButton
      label="Simulate payment"
      doneText="Payment simulated. The purchase is now processed like a real bank transfer."
      run={() => simulatePaymentFor(buy.routeId, payment)}
    />
  );
}

// DEV/STG only: marks the payout of the sell route as sent to the bank account.
export function SimulatePayout({ sell }: { sell: Sell }): JSX.Element | null {
  const { simulatePayoutFor } = useSell();
  if (!isTestNetwork()) return null;
  return (
    <SimulationButton
      label="Simulate payout"
      doneText="Payout simulated."
      run={() => simulatePayoutFor(sell.routeId)}
    />
  );
}
