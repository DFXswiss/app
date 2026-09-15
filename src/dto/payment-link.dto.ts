import { Asset, PaymentLinkPaymentStatus, TransferMethod } from '@dfx.swiss/react';

export interface WalletInfo {
  id: number;
  name: string;
  websiteUrl?: string;
  iconUrl: string;
  deepLink?: string;
  hasActionDeepLink?: boolean;
  appStoreUrl?: string;
  playStoreUrl?: string;
  recommended?: boolean;
  supportedMethods: TransferMethod[];
  supportedAssets?: Asset[];
  semiCompatible?: boolean;
  active?: boolean;
}

export interface MetaMaskInfo {
  accountAddress: string;
  transferAsset: Asset;
  transferAmount: number;
  minFee: number;
}

/** Screen state for a terminal with no active payment. Not a status the API ever sends. */
export enum NoPaymentLinkPaymentStatus {
  NO_PAYMENT = 'NoPayment',
}

export type ExtendedPaymentLinkStatus = PaymentLinkPaymentStatus | NoPaymentLinkPaymentStatus;

/** Shape of the LNURL wait response, which reports the status on its own. */
export interface PaymentStatus {
  status: PaymentLinkPaymentStatus;
}
