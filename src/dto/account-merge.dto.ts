export enum MergeReason {
  IDENT_DOCUMENT = 'IdentDocument',
  MAIL = 'Mail',
  IBAN = 'Iban',
  STAFF = 'Staff',
}

export interface PendingMergeAccount {
  userDataId: number;
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
