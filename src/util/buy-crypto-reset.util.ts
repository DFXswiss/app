import type { TransactionInfo } from 'src/hooks/compliance.hook';

export function hasBuyCryptoReviewResetEligibleState(tx: TransactionInfo): boolean {
  return (
    tx.buyCryptoId != null &&
    !tx.isCompleted &&
    tx.buyCryptoIsComplete === false &&
    tx.buyCryptoStatus != null &&
    tx.buyCryptoStatus !== 'Stopped' &&
    tx.buyCryptoHasBatch === false &&
    tx.buyCryptoHasChargeback === false &&
    tx.buyCryptoReviewResetBlocked === false
  );
}

/** Eligibility is BuyCrypto state only — KYC status must not gate the review reset. */
export function canResetBuyCryptoAmlForReview(tx: TransactionInfo): boolean {
  return hasBuyCryptoReviewResetEligibleState(tx);
}
