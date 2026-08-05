// Use the actual enums re-exported by the SDK. The literals below are emitted by the API's
// QuoteError enum (api/src/.../quote-error.enum.ts) and intentionally form a cross-contract check.

jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: {
    BANK: 'Bank',
    INSTANT: 'Instant',
    CARD: 'Card',
  },
  PersonalIbanProvider: { FRICK: 'Frick' },
  TransactionError: {
    PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
    KYC_REQUIRED: 'KycRequired',
  },
}));

import { FiatPaymentMethod, PersonalIbanProvider, TransactionError } from '@dfx.swiss/react';
import { readFileSync } from 'fs';
import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import italian from '../translations/languages/it.json';
import {
  FRICK_ACCOUNT_HOLDER_NAME,
  FRICK_BANK_NAME,
  FRICK_EUR_COLLECTION_IBAN,
  getPersonalIbanErrorMessage,
  getPersonalIbanKycMessage,
  getStoredPaymentDetailErrorMessage,
  isExplicitFrickPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  normalizePersonalIban,
  personalIbanOnlyParams,
  toCollectionIbanGiroCode,
  toPersonalIbanProviderRequest,
} from '../util/personal-iban';

describe('personal IBAN selector mapping', () => {
  it.each(['frick', 'FRICK', 'Frick'])('maps the public %s value to the API enum', (value) => {
    expect(normalizePersonalIban(value)).toBe(PersonalIbanProvider.FRICK);
    expect(toPersonalIbanProviderRequest(value)).toEqual({ personalIbanProvider: PersonalIbanProvider.FRICK });
    expect(isUnrecognizedPersonalIbanSelector(value)).toBe(false);
  });

  it.each(['', 'unknown'])(
    'omits an unrecognized value from the request (fail-closed now happens locally, not via the API round trip)',
    (value) => {
      expect(normalizePersonalIban(value)).toBe(value);
      expect(toPersonalIbanProviderRequest(value)).toEqual({});
      expect(isUnrecognizedPersonalIbanSelector(value)).toBe(true);
    },
  );

  it('omits an absent selector and does not flag it as unrecognized', () => {
    expect(normalizePersonalIban(undefined)).toBeUndefined();
    expect(toPersonalIbanProviderRequest(undefined)).toEqual({});
    expect(isUnrecognizedPersonalIbanSelector(undefined)).toBe(false);
  });
});

describe('isPersonalIbanApplicable', () => {
  it('returns true for EUR with bank payment', () => {
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.BANK)).toBe(true);
  });

  it('returns false for non-EUR currency with bank payment', () => {
    expect(isPersonalIbanApplicable('CHF', FiatPaymentMethod.BANK)).toBe(false);
  });

  it('returns false for EUR with a non-bank payment method', () => {
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.INSTANT)).toBe(false);
  });

  it('returns false for undefined currency', () => {
    expect(isPersonalIbanApplicable(undefined, FiatPaymentMethod.BANK)).toBe(false);
  });

  it('returns false for undefined payment method', () => {
    expect(isPersonalIbanApplicable('EUR', undefined)).toBe(false);
  });
});

// Tokens must match QuoteError string values for the buy/purchase path
// (resolveBankInfo / getOrCreateFrickForUser / DTO validation).
describe('getPersonalIbanErrorMessage', () => {
  const apiQuoteError = {
    paymentMethodNotAllowed: 'PaymentMethodNotAllowed',
    kycRequired: 'KycRequired',
  } as const;

  function publishedSdkToken(member: string): string | undefined {
    const source = readFileSync(
      require.resolve('@dfx.swiss/core/dist/definitions/transaction.js'),
      'utf8',
    );
    return new RegExp(
      `TransactionError\\["${member}"\\] = "([^"]+)"`,
    ).exec(source)?.[1];
  }

  it('matches the real SDK members to the tokens emitted by the API', () => {
    const sdkPaymentMethodNotAllowed = publishedSdkToken(
      'PAYMENT_METHOD_NOT_ALLOWED',
    );
    const sdkKycRequired = publishedSdkToken('KYC_REQUIRED');

    expect(sdkPaymentMethodNotAllowed).toBe(
      apiQuoteError.paymentMethodNotAllowed,
    );
    expect(sdkKycRequired).toBe(apiQuoteError.kycRequired);
    expect(TransactionError.PAYMENT_METHOD_NOT_ALLOWED).toBe(
      sdkPaymentMethodNotAllowed,
    );
    expect(TransactionError.KYC_REQUIRED).toBe(sdkKycRequired);
  });

  it('maps PaymentMethodNotAllowed to the bank-transfer requirement message', () => {
    expect(getPersonalIbanErrorMessage(apiQuoteError.paymentMethodNotAllowed)).toBe(
      'Personal IBANs require the bank transfer payment method.',
    );
  });

  it('maps PersonalIbanIssuanceFailed to a retry-or-support message', () => {
    expect(getPersonalIbanErrorMessage('PersonalIbanIssuanceFailed')).toBe(
      'We could not issue your personal IBAN. Please try again later or contact support if the problem persists.',
    );
  });

  it('maps the PersonalIbanProviderUnsupported token to the unrecognized-provider message', () => {
    expect(getPersonalIbanErrorMessage('PersonalIbanProviderUnsupported')).toBe(
      'The requested personal IBAN provider is not recognized.',
    );
  });

  it('does not map KycRequired (routed through QuoteErrorHint with a separate feature message)', () => {
    expect(getPersonalIbanErrorMessage(apiQuoteError.kycRequired)).toBeUndefined();
    expect(isKycRequiredMessage(apiQuoteError.kycRequired)).toBe(true);
    expect(getPersonalIbanKycMessage()).toBe('Personal IBANs require KYC level 50.');
  });

  it('qualifies the EUR-only rejection as Bank Frick-specific', () => {
    expect(getPersonalIbanErrorMessage('PersonalIbanCurrencyNotSupported')).toBe(
      'Bank Frick personal IBANs are currently only available for EUR.',
    );
  });

  it.each([
    ['de', de['screens/payment'], /Bank Frick/i],
    ['fr', fr['screens/payment'], /Bank Frick/i],
    ['it', italian['screens/payment'], /Bank Frick/i],
  ])(
    'qualifies the %s currency rejection as Bank Frick-specific',
    (_locale, translations, bankFrick) => {
      const message =
        translations[
          'Bank Frick personal IBANs are currently only available for EUR.'
        ];

      expect(message).toMatch(bankFrick);
      expect(message).toMatch(/EUR/i);
    },
  );

  it('maps CurrencyUnsupported to the currency-unavailable message', () => {
    expect(getPersonalIbanErrorMessage('CurrencyUnsupported')).toBe(
      'The selected currency is not available. Please try a different currency or contact support.',
    );
  });

  it('maps NoBankAvailableForThisCurrency to the no-bank message', () => {
    expect(getPersonalIbanErrorMessage('NoBankAvailableForThisCurrency')).toBe(
      'No bank is available for this currency. Please try a different currency or contact support.',
    );
  });

  it('does not match raw untokenized backend texts', () => {
    // Intentionally unmapped BadRequestException free-text (not a QuoteError token).
    expect(getPersonalIbanErrorMessage('Asset not found')).toBeUndefined();
  });

  it('returns undefined for undefined message', () => {
    expect(getPersonalIbanErrorMessage(undefined)).toBeUndefined();
  });

  it('returns undefined for unrelated messages', () => {
    expect(getPersonalIbanErrorMessage('some unrelated message')).toBeUndefined();
  });
});

// Tokens must match QuoteError string values for getBankInfoForRequest (stored-detail reconstruction).
describe('getStoredPaymentDetailErrorMessage', () => {
  it.each([
    [
      'StoredTransactionRequestBankSelectionIncomplete',
      'This stored payment detail is incomplete. Please start a new purchase.',
    ],
    [
      'StoredTransactionRequestBankNoLongerExists',
      'The bank for this payment is no longer available. Please start a new purchase.',
    ],
    [
      'StoredPersonalIbanUserMismatch',
      'This stored personal IBAN is no longer valid for your account. Please start a new purchase.',
    ],
    [
      'StoredPersonalIbanTransactionRequestMismatch',
      'This stored personal IBAN does not match this transaction. Please start a new purchase.',
    ],
    ['StoredPersonalIbanIsNoLongerActive', 'This personal IBAN is no longer active. Please start a new purchase.'],
    ['StoredBankNoLongerAcceptsPayments', 'This bank no longer accepts payments. Please start a new purchase.'],
    [
      'CollectionAccountInvoiceRequiresPersonalIban',
      'The invoice for the collection account cannot be created right now. Please use the payment details shown on this screen.',
    ],
    [
      'CollectionAccountInvoiceCurrencyNotSupported',
      'The invoice for the collection account cannot be created right now. Please use the payment details shown on this screen.',
    ],
  ] as const)('maps %s to customer-facing copy', (token, text) => {
    expect(getStoredPaymentDetailErrorMessage(token)).toBe(text);
    expect(getStoredPaymentDetailErrorMessage(token)).toBeTruthy();
  });

  it.each([
    'StoredPersonalIbanDoesNotBelongToThisUser',
    'StoredPersonalIbanDoesNotMatchThisTransactionRequest',
    'CurrencyNotFound',
    'CollectionAccountInvoiceSomethingElse',
  ] as const)('does not match obsolete/wrong token %s', (token) => {
    expect(getStoredPaymentDetailErrorMessage(token)).toBeUndefined();
  });

  it('does not map NoBankAvailableForThisCurrency (buy-path token only)', () => {
    expect(getStoredPaymentDetailErrorMessage('NoBankAvailableForThisCurrency')).toBeUndefined();
  });

  it('returns undefined for undefined message', () => {
    expect(getStoredPaymentDetailErrorMessage(undefined)).toBeUndefined();
  });
});

describe('isVerifiedFrickPersonalIbanResponse', () => {
  it('accepts a Bank Frick response held by DFX AG', () => {
    expect(
      isVerifiedFrickPersonalIbanResponse({
        isPersonalIban: true,
        bank: FRICK_BANK_NAME,
        name: FRICK_ACCOUNT_HOLDER_NAME,
      }),
    ).toBe(true);
  });

  it('rejects ordinary bank details (rollback / stripped selector)', () => {
    expect(
      isVerifiedFrickPersonalIbanResponse({
        isPersonalIban: false,
        bank: undefined,
        name: 'DFX AG',
      }),
    ).toBe(false);
  });

  it('rejects legacy Frick-style responses that name the customer as holder', () => {
    expect(
      isVerifiedFrickPersonalIbanResponse({
        isPersonalIban: true,
        bank: FRICK_BANK_NAME,
        name: 'Alice Example',
      }),
    ).toBe(false);
  });

  it('rejects Yapeal-style personal IBAN without Bank Frick', () => {
    expect(
      isVerifiedFrickPersonalIbanResponse({
        isPersonalIban: true,
        bank: 'Yapeal',
        name: 'Alice Example',
      }),
    ).toBe(false);
  });
});

describe('isExplicitFrickPersonalIbanRequest', () => {
  it('is true only for a recognized Frick selector', () => {
    expect(isExplicitFrickPersonalIbanRequest('Frick')).toBe(true);
    expect(isExplicitFrickPersonalIbanRequest('frick')).toBe(true);
    expect(isExplicitFrickPersonalIbanRequest('unknown')).toBe(false);
    expect(isExplicitFrickPersonalIbanRequest(undefined)).toBe(false);
  });
});

describe('personalIbanOnlyParams', () => {
  it('copies only personal-iban when present', () => {
    const params = personalIbanOnlyParams('?user=alice@example.com&personal-iban=frick&arbitrary=value');
    expect(params.get('personal-iban')).toBe('frick');
    expect(params.get('user')).toBeNull();
    expect(params.get('arbitrary')).toBeNull();
    expect([...params.keys()]).toEqual(['personal-iban']);
  });

  it('returns an empty set when personal-iban is absent', () => {
    const params = personalIbanOnlyParams('?user=alice@example.com&arbitrary=value');
    expect([...params.keys()]).toEqual([]);
  });
});

const PERSONAL_GIRO_IBAN = 'LI21088110102979K002E';

/** Production-shaped GiroCode (api config: version 001, encoding 2). */
function sampleGiroCode(overrides: { line0?: string; line3?: string; iban?: string } = {}): string {
  return [
    overrides.line0 ?? 'BCD',
    '001',
    '2',
    overrides.line3 ?? 'SCT',
    'BFRILI22',
    'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
    overrides.iban ?? PERSONAL_GIRO_IBAN,
    'EUR100',
    '',
    '',
    'DFX-BUY-1',
  ].join('\n');
}

describe('toCollectionIbanGiroCode', () => {
  it('replaces only line 6 and leaves all other lines and the line count untouched', () => {
    const input = sampleGiroCode();
    const originalLines = input.split('\n');
    const result = toCollectionIbanGiroCode(input, PERSONAL_GIRO_IBAN);

    expect(result).toBeDefined();
    if (result === undefined) return;
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(originalLines.length);

    for (let i = 0; i < originalLines.length; i++) {
      if (i === 6) {
        expect(resultLines[i]).toBe(FRICK_EUR_COLLECTION_IBAN);
      } else {
        expect(resultLines[i]).toBe(originalLines[i]);
      }
    }
  });

  it('returns undefined when line 0 is not BCD', () => {
    expect(toCollectionIbanGiroCode(sampleGiroCode({ line0: 'EPC' }), PERSONAL_GIRO_IBAN)).toBeUndefined();
  });

  it('returns undefined when line 3 is not SCT', () => {
    expect(toCollectionIbanGiroCode(sampleGiroCode({ line3: 'SDD' }), PERSONAL_GIRO_IBAN)).toBeUndefined();
  });

  it('returns undefined when line 6 is a different IBAN than the given personal IBAN', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode({ iban: 'LI99088110100000K999E' }), PERSONAL_GIRO_IBAN),
    ).toBeUndefined();
  });

  it('returns undefined when the payload contains a Swiss QR-Bill SVG marker', () => {
    // Valid GiroCode shape so only the <svg guard (not BCD/length) rejects it.
    const svgEmbedded = [
      'BCD',
      '001',
      '2',
      'SCT',
      'BFRILI22',
      'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
      PERSONAL_GIRO_IBAN,
      'EUR100',
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      '',
      'DFX-BUY-1',
    ].join('\n');
    expect(toCollectionIbanGiroCode(svgEmbedded, PERSONAL_GIRO_IBAN)).toBeUndefined();
  });

  it('returns undefined when the payload has fewer than 7 lines', () => {
    const shortPayload = ['BCD', '001', '2', 'SCT', 'BFRILI22', PERSONAL_GIRO_IBAN].join('\n');
    expect(shortPayload.split('\n')).toHaveLength(6);
    expect(toCollectionIbanGiroCode(shortPayload, PERSONAL_GIRO_IBAN)).toBeUndefined();
  });

  it('returns undefined when the personal IBAN is empty', () => {
    expect(toCollectionIbanGiroCode(sampleGiroCode({ iban: '' }), '')).toBeUndefined();
  });

  it('tolerates CRLF line endings from the payload', () => {
    const input = sampleGiroCode().replace(/\n/g, '\r\n');
    const result = toCollectionIbanGiroCode(input, PERSONAL_GIRO_IBAN);
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_EUR_COLLECTION_IBAN);
  });

  it('tolerates whitespace and lowercase in the given personal IBAN', () => {
    const result = toCollectionIbanGiroCode(sampleGiroCode(), 'li21 0881 1010 2979 k002 e');
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_EUR_COLLECTION_IBAN);
  });
});
