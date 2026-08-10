export enum ChargebackBlockReason {
  NAME_MISMATCH = 'NameMismatch',
  MISSING_CREDITOR_DATA = 'MissingCreditorData',
  MISSING_CHARGEBACK_AMOUNT = 'MissingChargebackAmount',
  MISSING_CHARGEBACK_TARGET = 'MissingChargebackTarget',
  USER_NOT_RELEASED = 'UserNotReleased',
}

export interface PendingChargebackEntry {
  txId: number;
  uid: string;
  sourceType: 'BuyCrypto' | 'BuyFiat' | 'BankTxReturn';
  entityId: number;
  userDataId: number;
  userName?: string;
  inputAmount?: number;
  inputAsset?: string;
  chargebackAmount?: number;
  chargebackAsset?: string;
  blockReasons: ChargebackBlockReason[];
  requestedDate: Date;
  date: Date;
  // raw facts for the human decision on NAME_MISMATCH
  verifiedName?: string;
  completeName?: string;
  creditorName?: string;
  chargebackDate?: Date;
}
