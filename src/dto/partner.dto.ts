import { KycStatus } from '@dfx.swiss/react';

export interface PartnerUserInfo {
  id: number;
  status: string;
  mail?: string;
  firstname?: string;
  surname?: string;
  usedRef: string;
  feeIds: number[];
  canModify: boolean;
}

export interface PartnerFee {
  id: number;
  label: string;
  type: string;
  rate: number;
  fixed: number;
}

export interface PartnerRefereeDisplay extends PartnerUserInfo {
  kycStatus?: KycStatus;
}
