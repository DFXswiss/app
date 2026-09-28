import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// Mirrors RefUserKycClearResult in DFXswiss/backend (support/dto/user-data-support.dto.ts).
export interface RefUserKycClearReferrer {
  userDataId: number;
  usedRef: string;
  kycStatus: string;
}

export interface RefUserKycClearResult {
  userDataId: number;
  refUserKycClearedDate: string;
  referrers: RefUserKycClearReferrer[];
  resetBuyCryptoIds: number[];
  resetBuyFiatIds: number[];
}

// Waives the referrer's open KYC check for one account (PUT support/:id/refUserKycCleared, Compliance
// role). The API stamps the account, logs the clerk and resets every transaction the hold parked; the
// automatic AML run then decides again. It never sets Pass.
export function useRefUserKycClear(): {
  clearRefUserKyc: (userDataId: number) => Promise<RefUserKycClearResult>;
} {
  const { call } = useGuardedApi();

  async function clearRefUserKyc(userDataId: number): Promise<RefUserKycClearResult> {
    return call<RefUserKycClearResult>({
      url: `support/${userDataId}/refUserKycCleared`,
      method: 'PUT',
    });
  }

  return useMemo(() => ({ clearRefUserKyc }), [call]);
}
