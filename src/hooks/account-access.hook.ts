import { AccountAccessInfo, useAccountAccess as useSdkAccountAccess } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { useStaffErrorGuard } from './guarded-api.hook';

export type { AccountAccessInfo };

export function useAccountAccess(): {
  setProvisionalApproval(userDataId: number, enabled: boolean): Promise<AccountAccessInfo>;
  setVip(userDataId: number, enabled: boolean): Promise<AccountAccessInfo>;
} {
  const { setProvisionalApproval, setVip } = useSdkAccountAccess();
  const guard = useStaffErrorGuard();

  return useMemo(
    () => ({
      setProvisionalApproval: (userDataId: number, enabled: boolean) =>
        guard(setProvisionalApproval(userDataId, enabled)),
      setVip: (userDataId: number, enabled: boolean) => guard(setVip(userDataId, enabled)),
    }),
    [setProvisionalApproval, setVip, guard],
  );
}
