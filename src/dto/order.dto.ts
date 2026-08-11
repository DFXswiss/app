import { CustodyOrderStatus, CustodyOrderType } from '@dfx.swiss/react';

export interface CustodyOrderListEntry {
  id: number;
  type: CustodyOrderType;
  status: CustodyOrderStatus;
  inputAmount?: number;
  inputAsset?: string;
  outputAmount?: number;
  outputAsset?: string;
  userDataId?: number;
  userName?: string;
  updated: Date;
}

export interface ExchangeRate {
  rate: number;
  currency: string;
}
