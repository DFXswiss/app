import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

export interface SetOnboardingFeeDto {
  amount: number;
  address: string;
}

export interface OnboardingFeeAmounts {
  amounts: number[];
}

// Adds or removes the flat onboarding fee of an account. The Admin endpoints work on a userData id;
// the Partner endpoints work on a customer wallet address and attribute it to the caller's ref. The
// PUTs assign the fee and attribute the address in one transaction; the API answers with an empty
// body. Both groups answer 404 while the onboarding-fee switch on the backend is off.
export function useOnboardingFee(): {
  setOnboardingFee: (userDataId: number, dto: SetOnboardingFeeDto) => Promise<void>;
  removeOnboardingFee: (userDataId: number) => Promise<void>;
  getOnboardingFeeAmounts: () => Promise<number[]>;
  setPartnerOnboardingFee: (dto: SetOnboardingFeeDto) => Promise<void>;
  removePartnerOnboardingFee: (address: string) => Promise<void>;
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

  async function getOnboardingFeeAmounts(): Promise<number[]> {
    const response = await call<OnboardingFeeAmounts>({
      url: 'partner/onboardingFee/amounts',
      method: 'GET',
    });
    return response.amounts;
  }

  async function setPartnerOnboardingFee(dto: SetOnboardingFeeDto): Promise<void> {
    return call<void>({
      url: 'partner/onboardingFee',
      method: 'PUT',
      data: dto,
    });
  }

  async function removePartnerOnboardingFee(address: string): Promise<void> {
    return call<void>({
      url: `partner/onboardingFee?address=${encodeURIComponent(address)}`,
      method: 'DELETE',
    });
  }

  return useMemo(
    () => ({
      setOnboardingFee,
      removeOnboardingFee,
      getOnboardingFeeAmounts,
      setPartnerOnboardingFee,
      removePartnerOnboardingFee,
    }),
    [call],
  );
}
