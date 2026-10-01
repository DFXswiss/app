import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// The transaction a Scorechain acknowledgement applies to. The API has one route per transaction type.
export interface ScorechainClearTarget {
  kind: 'buyCrypto' | 'buyFiat';
  id: number;
}

// Acknowledges the Scorechain hold (HighRisk or Unavailable) of one transaction
// (PUT buyCrypto/:id/scorechainCleared or buyFiat/:id/scorechainCleared, Compliance role). The API stamps
// the transaction, logs the clerk and resets it; the automatic AML run then decides again without that hold.
// It never sets Pass, and a Sanction hit stays a Fail. The API answers without a body.
export function useScorechainClear(): {
  clearScorechain: (target: ScorechainClearTarget) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function clearScorechain(target: ScorechainClearTarget): Promise<void> {
    await call<void>({ url: `${target.kind}/${target.id}/scorechainCleared`, method: 'PUT' });
  }

  return useMemo(() => ({ clearScorechain }), [call]);
}
