// DFX App 2.0 — trade error mapping.
//
// Two distinct error shapes come back from the SDK:
//  1. A thrown `ApiException` (network error, 4xx/5xx) from `useApi().call()` — statusCode +
//     message. A 401 means the session died mid-flow (`useApi` already tries once with a
//     refreshed token internally; a 401 that still reaches us means the session is gone).
//  2. A *successful* response with `isValid: false` and a `TransactionError` enum on
//     `Buy`/`Sell`/`Swap` — the quote itself is invalid (amount out of range, KYC needed, ...).
//     This replaces the static app's regex-on-message heuristics (`/kyc/i.test(m)`, ...) with a
//     real enum, which is strictly more reliable.

import { ApiException, TransactionError } from '@dfx.swiss/react';
import type { Language, TranslationKey } from '../../i18n';
import { formatAmount, formatFiat } from './amount';

export type TradeErrorKind = 'session' | 'email' | 'setup' | 'generic';

export interface TradeErrorInfo {
  kind: TradeErrorKind;
  message: string;
}

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Maps a thrown error from `receiveFor(...)` to a friendly, already-translated message. */
export function mapThrownError(t: T, err: unknown): TradeErrorInfo {
  if (err instanceof ApiException) {
    if (err.statusCode === 401) return { kind: 'session', message: t('sessionExpired') };
    const msg = err.message || '';
    if (/email/i.test(msg)) return { kind: 'email', message: t('verifyEmailNote') };
    if (/recommend/i.test(msg)) return { kind: 'setup', message: t('inviteGateNote') };
    if (/kyc/i.test(msg)) return { kind: 'setup', message: t('needKyc') };
    if (/limit/i.test(msg)) return { kind: 'setup', message: t('needLimit') };
    if (/iban/i.test(msg)) return { kind: 'setup', message: t('ibanInvalid') };
    return { kind: 'generic', message: msg || t('genErr') };
  }
  return { kind: 'generic', message: t('genErr') };
}

/** Maps the `TransactionError` enum a *successful* (200) but invalid quote carries. `min`/`max`
 * are the response's `minVolume`/`maxVolume` (source-unit for buy, i.e. fiat; source-crypto-unit
 * for sell/swap) — pass a formatter so the caller controls fiat-vs-crypto precision. */
export function mapTransactionError(
  t: T,
  error: TransactionError | undefined,
  min: number | undefined,
  max: number | undefined,
  format: (n: number) => string,
): string | undefined {
  switch (error) {
    case undefined:
      return undefined;
    case TransactionError.AMOUNT_TOO_LOW:
      return `${t('minAmount')} ${format(min ?? 0)}`;
    case TransactionError.AMOUNT_TOO_HIGH:
      return `${t('maxAmount')} ${format(max ?? 0)}`;
    case TransactionError.KYC_REQUIRED:
    case TransactionError.KYC_DATA_REQUIRED:
    case TransactionError.VIDEO_IDENT_REQUIRED:
    case TransactionError.NAME_REQUIRED:
    case TransactionError.KYC_REQUIRED_INSTANT:
      return t('needKyc');
    case TransactionError.LIMIT_EXCEEDED:
      return t('needLimit');
    case TransactionError.EMAIL_REQUIRED:
      return t('verifyEmailNote');
    case TransactionError.RECOMMENDATION_REQUIRED:
      return t('inviteGateNote');
    case TransactionError.IBAN_CURRENCY_MISMATCH:
      return t('ibanInvalid');
    default:
      return t('needSetup');
  }
}

/** Convenience formatters for `mapTransactionError`'s `format` param. */
export function fiatFormatter(currencyCode: string, language: Language): (n: number) => string {
  return (n) => formatFiat(n, currencyCode, language);
}

export function assetFormatter(code: string, language: Language, decimals = 8): (n: number) => string {
  return (n) => `${formatAmount(n, decimals, language)} ${code}`;
}
