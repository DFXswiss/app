import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// The transaction a monthly-limit acknowledgement applies to. The API has one route per transaction type.
export interface MonthlyLimitClearTarget {
  kind: 'buyCrypto' | 'buyFiat';
  id: number;
}

// Acknowledges the monthly-limit hold of one transaction
// (PUT buyCrypto/:id/monthlyLimitCleared or buyFiat/:id/monthlyLimitCleared, Compliance role). Not a Pass:
// the API stamps the transaction and resets it; the automatic AML run then drops only MonthlyLimitReached.
// There is no payout-address exemption, and a yearly limit stays in place. The API answers without a body.
export function useMonthlyLimitClear(): {
  clearMonthlyLimit: (target: MonthlyLimitClearTarget) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function clearMonthlyLimit(target: MonthlyLimitClearTarget): Promise<void> {
    await call<void>({ url: `${target.kind}/${target.id}/monthlyLimitCleared`, method: 'PUT' });
  }

  return useMemo(() => ({ clearMonthlyLimit }), [call]);
}
