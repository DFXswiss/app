import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

export interface AccountAccessInfo {
  id: number;
  provisionalApprovalDate?: string;
  vipUserIds: number[];
}

export function useAccountAccess(): {
  setProvisionalApproval(userDataId: number, enabled: boolean): Promise<AccountAccessInfo>;
  setVip(userDataId: number, enabled: boolean): Promise<AccountAccessInfo>;
} {
  const { call } = useGuardedApi();

  async function setProvisionalApproval(userDataId: number, enabled: boolean): Promise<AccountAccessInfo> {
    return call<AccountAccessInfo>({
      url: `support/${userDataId}/provisionalApproval`,
      method: 'PUT',
      data: { enabled },
    });
  }

  async function setVip(userDataId: number, enabled: boolean): Promise<AccountAccessInfo> {
    return call<AccountAccessInfo>({
      url: `support/${userDataId}/vip`,
      method: 'PUT',
      data: { enabled },
    });
  }

  return useMemo(() => ({ setProvisionalApproval, setVip }), [call]);
}
