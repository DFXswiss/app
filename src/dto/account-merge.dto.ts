export enum MergeReason {
  IDENT_DOCUMENT = 'IdentDocument',
  MAIL = 'Mail',
  IBAN = 'Iban',
  STAFF = 'Staff',
}

export interface PendingMergeAccount {
  userDataId: number;
  userName?: string;
  mail?: string;
  accountType?: string;
  kycLevel: number;
}

export interface PendingMergeEntry {
  id: number;
  reason?: MergeReason;
  master: PendingMergeAccount;
  slave: PendingMergeAccount;
  isProcessing: boolean;
  requestedDate: Date;
  expiration: Date;
}
