import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

export interface ReactivateAccountDto {
  reason: string;
}

// The account row after the API accepted the change: the status the tool shows from then on.
export interface UserDataStatusInfo {
  id: number;
  status: string;
  deactivationDate?: string;
}

// Reverses a deactivation (PUT support/:id/reactivate, Compliance role). The API derives the new
// status from the wallets, logs clerk, previous and new status with the reason, and answers with the
// account's status row.
export function useAccountReactivation(): {
  reactivateAccount: (userDataId: number, dto: ReactivateAccountDto) => Promise<UserDataStatusInfo>;
} {
  const { call } = useGuardedApi();

  async function reactivateAccount(userDataId: number, dto: ReactivateAccountDto): Promise<UserDataStatusInfo> {
    return call<UserDataStatusInfo>({
      url: `support/${userDataId}/reactivate`,
      method: 'PUT',
      data: dto,
    });
  }

  return useMemo(() => ({ reactivateAccount }), [call]);
}
