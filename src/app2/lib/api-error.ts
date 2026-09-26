/**
 * Maps API error messages to TransactionError.
 * Copied into App 2.0 so this tree does not import the main app's private util.
 * Mapping must match `src/util/api-error.ts` — pinned by `legacy-contract.test.ts`.
 */

import { TransactionError } from '@dfx.swiss/react';

export function getKycErrorFromMessage(message?: string): TransactionError | undefined {
  if (!message) return undefined;

  const errorMap: Record<string, TransactionError> = {
    EmailRequired: TransactionError.EMAIL_REQUIRED,
    RecommendationRequired: TransactionError.RECOMMENDATION_REQUIRED,
    'KYC required': TransactionError.KYC_REQUIRED,
    'Trading not allowed': TransactionError.TRADING_NOT_ALLOWED,
    KycDataRequired: TransactionError.KYC_DATA_REQUIRED,
    KycRequired: TransactionError.KYC_REQUIRED,
    KycRequiredInstant: TransactionError.KYC_REQUIRED_INSTANT,
    LimitExceeded: TransactionError.LIMIT_EXCEEDED,
    BankTransactionMissing: TransactionError.BANK_TRANSACTION_MISSING,
    BankTransactionOrVideoMissing: TransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING,
    VideoIdentRequired: TransactionError.VIDEO_IDENT_REQUIRED,
    NationalityNotAllowed: TransactionError.NATIONALITY_NOT_ALLOWED,
    PaymentMethodNotAllowed: TransactionError.PAYMENT_METHOD_NOT_ALLOWED,
  };

  for (const [key, error] of Object.entries(errorMap)) {
    if (message.includes(key)) return error;
  }

  return undefined;
}
