import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

export interface SetOnboardingFeeDto {
  amount: number;
  address: string;
}

// Adds or removes the flat onboarding fee of an account (Admin role). The PUT assigns the fee and
// attributes the named address to the key-account manager's ref in one transaction; the API answers
// with an empty body. Both endpoints answer 404 while ONBOARDING_FEE_API_ENABLED is not enabled.
export function useOnboardingFee(): {
  setOnboardingFee: (userDataId: number, dto: SetOnboardingFeeDto) => Promise<void>;
  removeOnboardingFee: (userDataId: number) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function setOnboardingFee(userDataId: number, dto: SetOnboardingFeeDto): Promise<void> {
    return call<void>({
      url: `userData/${userDataId}/onboardingFee`,
      method: 'PUT',
      data: dto,
    });
  }

  async function removeOnboardingFee(userDataId: number): Promise<void> {
    return call<void>({
      url: `userData/${userDataId}/onboardingFee`,
      method: 'DELETE',
    });
  }

  return useMemo(() => ({ setOnboardingFee, removeOnboardingFee }), [call]);
}
