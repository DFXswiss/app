jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    code?: string;
    constructor(httpStatus: number, errorMessage: string, errorCode?: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
      this.code = errorCode;
    }
  },
  TransactionError: {
    AMOUNT_TOO_LOW: 'AmountTooLow',
    AMOUNT_TOO_HIGH: 'AmountTooHigh',
    KYC_REQUIRED: 'KycRequired',
    KYC_DATA_REQUIRED: 'KycDataRequired',
    VIDEO_IDENT_REQUIRED: 'VideoIdentRequired',
    NAME_REQUIRED: 'NameRequired',
    KYC_REQUIRED_INSTANT: 'KycRequiredInstant',
    LIMIT_EXCEEDED: 'LimitExceeded',
    EMAIL_REQUIRED: 'EmailRequired',
    RECOMMENDATION_REQUIRED: 'RecommendationRequired',
    IBAN_CURRENCY_MISMATCH: 'IbanCurrencyMismatch',
    TRADING_NOT_ALLOWED: 'TradingNotAllowed',
    BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
    BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
    NATIONALITY_NOT_ALLOWED: 'NationalityNotAllowed',
    PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
  },
}));

import { ApiException, TransactionError } from '@dfx.swiss/react';
import type { TranslationKey } from '../i18n';
import {
  assetFormatter,
  fiatFormatter,
  isEmailGateError,
  mapThrownError,
  mapTransactionError,
} from '../screens/trade/errors';

const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;
const format = (n: number) => `F${n}`;

describe('isEmailGateError', () => {
  it('rejects empty values and non-email codes', () => {
    expect(isEmailGateError(undefined)).toBe(false);
    expect(isEmailGateError('')).toBe(false);
    expect(isEmailGateError(TransactionError.LIMIT_EXCEEDED)).toBe(false);
    expect(isEmailGateError('e-mail-required')).toBe(true);
    expect(isEmailGateError('PRIMARY-EMAIL-NOT-CONFIRMED')).toBe(true);
  });
});

describe('mapThrownError', () => {
  it('treats a 401 as a dead session', () => {
    expect(mapThrownError(t, new ApiException(401, 'nope'))).toEqual({
      kind: 'session',
      message: 'sessionExpired',
    });
  });

  it('maps structured codes on the exception', () => {
    expect(mapThrownError(t, new ApiException(400, 'x', 'KYC_REQUIRED'))).toEqual({
      kind: 'setup',
      message: 'needKyc',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'NameRequired'))).toEqual({
      kind: 'setup',
      message: 'needKyc',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'VideoIdentRequired'))).toEqual({
      kind: 'setup',
      message: 'needKyc',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'LimitExceeded'))).toEqual({
      kind: 'setup',
      message: 'needLimit',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'IbanCurrencyMismatch'))).toEqual({
      kind: 'setup',
      message: 'ibanInvalid',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'RecommendationRequired'))).toEqual({
      kind: 'setup',
      message: 'inviteGateNote',
    });
  });

  it('maps Nest message tokens that the SDK left off `code`', () => {
    expect(mapThrownError(t, new ApiException(400, 'EmailRequired'))).toEqual({
      kind: 'email',
      message: 'verifyEmailNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'LimitExceeded'))).toEqual({
      kind: 'setup',
      message: 'needLimit',
    });
    expect(mapThrownError(t, new ApiException(400, 'RecommendationRequired'))).toEqual({
      kind: 'setup',
      message: 'inviteGateNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'KycDataRequired'))).toEqual({
      kind: 'setup',
      message: 'needKyc',
    });
  });

  it('falls back to spaced English phrases when the token is absent', () => {
    expect(mapThrownError(t, new ApiException(400, 'email required for this account'))).toEqual({
      kind: 'email',
      message: 'verifyEmailNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'recommendation required'))).toEqual({
      kind: 'setup',
      message: 'inviteGateNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'please complete identity verification'))).toEqual({
      kind: 'setup',
      message: 'needKyc',
    });
    expect(mapThrownError(t, new ApiException(400, 'limit exceeded for today'))).toEqual({
      kind: 'setup',
      message: 'needLimit',
    });
    expect(mapThrownError(t, new ApiException(400, 'iban rejected'))).toEqual({
      kind: 'setup',
      message: 'ibanInvalid',
    });
  });

  it('treats a non-ApiException as a generic failure', () => {
    expect(mapThrownError(t, new Error('boom'))).toEqual({ kind: 'generic', message: 'genErr' });
    expect(mapThrownError(t, 'not-an-error')).toEqual({ kind: 'generic', message: 'genErr' });
  });
});

describe('mapTransactionError', () => {
  it('returns undefined only when the quote carried no error', () => {
    expect(mapTransactionError(t, undefined, 1, 2, format)).toBeUndefined();
  });

  it('formats min and max volume into the amount messages', () => {
    expect(mapTransactionError(t, TransactionError.AMOUNT_TOO_LOW, 10, 99, format)).toBe('minAmount F10');
    expect(mapTransactionError(t, TransactionError.AMOUNT_TOO_HIGH, 10, 99, format)).toBe('maxAmount F99');
    expect(mapTransactionError(t, TransactionError.AMOUNT_TOO_LOW, undefined, undefined, format)).toBe('minAmount F0');
    expect(mapTransactionError(t, TransactionError.AMOUNT_TOO_HIGH, undefined, undefined, format)).toBe(
      'maxAmount F0',
    );
  });

  it('maps every account-state enum to the matching gate copy', () => {
    expect(mapTransactionError(t, TransactionError.KYC_REQUIRED, 0, 0, format)).toBe('needKyc');
    expect(mapTransactionError(t, TransactionError.KYC_DATA_REQUIRED, 0, 0, format)).toBe('needKyc');
    expect(mapTransactionError(t, TransactionError.VIDEO_IDENT_REQUIRED, 0, 0, format)).toBe('needKyc');
    expect(mapTransactionError(t, TransactionError.NAME_REQUIRED, 0, 0, format)).toBe('needKyc');
    expect(mapTransactionError(t, TransactionError.KYC_REQUIRED_INSTANT, 0, 0, format)).toBe('needKyc');
    expect(mapTransactionError(t, TransactionError.LIMIT_EXCEEDED, 0, 0, format)).toBe('needLimit');
    expect(mapTransactionError(t, TransactionError.EMAIL_REQUIRED, 0, 0, format)).toBe('verifyEmailNote');
    expect(mapTransactionError(t, TransactionError.RECOMMENDATION_REQUIRED, 0, 0, format)).toBe('inviteGateNote');
    expect(mapTransactionError(t, TransactionError.IBAN_CURRENCY_MISMATCH, 0, 0, format)).toBe('ibanInvalid');
  });

  it('uses needSetup for an unknown quote error token', () => {
    expect(mapTransactionError(t, 'TotallyUnknown' as TransactionError, 0, 0, format)).toBe('needSetup');
  });
});

describe('formatters', () => {
  it('render fiat and asset amounts through the language locale', () => {
    expect(fiatFormatter('EUR', 'en')(12.5)).toMatch(/12/);
    expect(assetFormatter('USDT', 'en')(1.25)).toContain('USDT');
  });
});
