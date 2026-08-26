import { useApi } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { PartnerFee, PartnerUserInfo } from 'src/dto/partner.dto';

export interface UsePartner {
  findUserByAddress: (address: string) => Promise<PartnerUserInfo>;
  getMyReferees: () => Promise<PartnerUserInfo[]>;
  getAvailableFees: () => Promise<PartnerFee[]>;
  setOnboarding: (userDataId: number, feeId: number) => Promise<void>;
  removeFee: (userDataId: number, feeId: number) => Promise<void>;
}

export function usePartner(): UsePartner {
  const { call } = useApi();

  async function findUserByAddress(address: string): Promise<PartnerUserInfo> {
    return call<PartnerUserInfo>({
      url: `partner/user?address=${encodeURIComponent(address)}`,
      method: 'GET',
    });
  }

  async function getMyReferees(): Promise<PartnerUserInfo[]> {
    return call<PartnerUserInfo[]>({ url: 'partner/users', method: 'GET' });
  }

  async function getAvailableFees(): Promise<PartnerFee[]> {
    return call<PartnerFee[]>({ url: 'partner/fees', method: 'GET' });
  }

  async function setOnboarding(userDataId: number, feeId: number): Promise<void> {
    return call<void>({
      url: `partner/user/${userDataId}/onboarding`,
      method: 'PUT',
      data: { feeId },
    });
  }

  async function removeFee(userDataId: number, feeId: number): Promise<void> {
    return call<void>({
      url: `partner/user/${userDataId}/fee?fee=${feeId}`,
      method: 'DELETE',
    });
  }

  return useMemo(
    () => ({ findUserByAddress, getMyReferees, getAvailableFees, setOnboarding, removeFee }),
    [call],
  );
}
