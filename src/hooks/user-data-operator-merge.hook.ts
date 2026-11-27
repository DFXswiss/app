import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// Merges one account into another in one server-side, audited call: the API records the clerk from
// the staff verified name, writes a before/after support log on both accounts inside the merge
// transaction and the reason on both MergeLogs.
export function useUserDataOperatorMerge(): {
  mergeUserData: (masterId: number, slaveId: number, comment: string) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function mergeUserData(masterId: number, slaveId: number, comment: string): Promise<void> {
    await call<void>({
      url: `userData/${masterId}/operatorMerge`,
      method: 'PUT',
      data: { slaveId, comment },
    });
  }

  return useMemo(() => ({ mergeUserData }), [call]);
}
