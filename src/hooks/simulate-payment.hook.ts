import { Buy, useApi } from '@dfx.swiss/react';
import { useMemo } from 'react';

// The API simulates incoming bank transfers in these currencies and up to this amount only (SimulateBankPaymentDto).
const SIMULATED_CURRENCIES: readonly string[] = ['CHF', 'EUR'];
const MAX_SIMULATED_AMOUNT = 100000;

export interface SimulatePaymentInterface {
  simulatePayment: (buy: Buy) => Promise<void>;
}

export function canSimulatePayment(buy: Buy): boolean {
  return (
    buy.routeId > 0 &&
    buy.amount > 0 &&
    buy.amount <= MAX_SIMULATED_AMOUNT &&
    SIMULATED_CURRENCIES.includes(buy.currency.name)
  );
}

// PUT /buy/:id/simulatePayment books a test transfer on the buy route. The API answers 403 outside
// DEV, LOC and STG. The request ID is the idempotency key: a second click for the same order books
// no second transfer. The pinned @dfx.swiss/react has no hook for this endpoint; `useBuy().simulatePaymentFor`
// is added in DFXswiss/packages (branch feat/buy-simulate-payment-sdk) and replaces this call once released.
export function useSimulatePayment(): SimulatePaymentInterface {
  const { call } = useApi();

  async function simulatePayment(buy: Buy): Promise<void> {
    await call<void>({
      url: `buy/${buy.routeId}/simulatePayment`,
      method: 'PUT',
      data: { amount: buy.amount, currency: buy.currency.name, idempotencyKey: `request-${buy.id}` },
    });
  }

  return useMemo(() => ({ simulatePayment }), [call]);
}
