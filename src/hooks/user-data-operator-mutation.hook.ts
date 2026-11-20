import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// Replaces a user-data sheet edit in one server-side, audited call: the API resolves the clerk from
// the staff verified name, writes the support log and the KYC log, then updates the user data.
export function useUserDataOperatorMutation(): {
  mutateUserData: (userDataId: number, data: Record<string, string | number>, comment: string) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function mutateUserData(
    userDataId: number,
    data: Record<string, string | number>,
    comment: string,
  ): Promise<void> {
    await call<void>({
      url: `userData/${userDataId}/operatorMutation`,
      method: 'PUT',
      data: { ...data, comment },
    });
  }

  return useMemo(() => ({ mutateUserData }), [call]);
}
