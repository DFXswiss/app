import type { SimulateBankPayment } from '@dfx.swiss/core';
import { Buy, Sell, useBuy, useSell } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth } from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useSettingsContext } from '../../contexts/settings.context';
import { isTestNetwork } from '../../util/test-network';

// One idempotency key per payment intent: the buy's transaction request, its amount and a nonce
// drawn once per completion screen. A double click or a retry after a timeout on that screen sends
// the same key, so the API books that payment once. A route is reused for every buy of the same
// asset, so a second buy on the route (a new transaction request and a new completion screen)
// gets a new key and is booked as well.
let nonceCount = 0;

export function simulationNonce(): string {
  nonceCount += 1;
  return `${Date.now().toString(36)}${nonceCount.toString(36)}`;
}

export function simulationKey(buy: Pick<Buy, 'id' | 'amount'>, nonce: string): string {
  return `simulate-buy-${buy.id}-${buy.amount}-${nonce}`;
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
  const [nonce] = useState(simulationNonce);
  if (!isTestNetwork()) return null;
  const payment: SimulateBankPayment = {
    amount: buy.amount,
    currency: buy.currency.name,
    idempotencyKey: simulationKey(buy, nonce),
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
