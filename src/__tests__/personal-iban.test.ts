// Use the actual enums re-exported by the SDK. The literals below are emitted by the API's
// QuoteError enum (api/src/.../quote-error.enum.ts) and intentionally form a cross-contract check.

jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: {
    BANK: 'Bank',
    INSTANT: 'Instant',
    CARD: 'Card',
  },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
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
  YAPEAL_BANK_NAME,
  getFrickCollectionIban,
  getOfferableCollectionIban,
  getPersonalIbanErrorMessage,
  getPersonalIbanKycMessage,
  getStoredPaymentDetailErrorMessage,
  getYapealAlternative,
  isExplicitFrickPersonalIbanRequest,
  isExplicitPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  isVerifiedYapealPersonalIbanResponse,
  normalizePersonalIban,
  personalIbanOnlyParams,
  toPersonalIbanProviderRequest,
} from '../util/personal-iban';
import { VirtualIbanStatus } from '../dto/virtual-iban.dto';

describe('personal IBAN selector mapping', () => {
  it.each(['frick', 'FRICK', 'Frick'])('maps the public %s value to the API enum', (value) => {
    expect(normalizePersonalIban(value)).toBe(PersonalIbanProvider.FRICK);
    expect(toPersonalIbanProviderRequest(value)).toEqual({ personalIbanProvider: PersonalIbanProvider.FRICK });
    expect(isUnrecognizedPersonalIbanSelector(value)).toBe(false);
  });

  it.each(['yapeal', 'YAPEAL', 'Yapeal'])('maps the public %s value to the API enum', (value) => {
    expect(normalizePersonalIban(value)).toBe(PersonalIbanProvider.YAPEAL);
    expect(toPersonalIbanProviderRequest(value)).toEqual({ personalIbanProvider: PersonalIbanProvider.YAPEAL });
    expect(isUnrecognizedPersonalIbanSelector(value)).toBe(false);
    expect(isExplicitPersonalIbanRequest(value)).toBe(true);
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

  it('returns true for CHF with bank payment', () => {
    expect(isPersonalIbanApplicable('CHF', FiatPaymentMethod.BANK)).toBe(true);
  });

  it('returns false for CHF with a non-bank payment method', () => {
    expect(isPersonalIbanApplicable('CHF', FiatPaymentMethod.CARD)).toBe(false);
  });

  it('returns false for a currency outside the Bank Frick currency set with bank payment', () => {
    expect(isPersonalIbanApplicable('USD', FiatPaymentMethod.BANK)).toBe(false);
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

describe('getFrickCollectionIban', () => {
  it('returns the EUR collection IBAN for EUR', () => {
    expect(getFrickCollectionIban('EUR')).toBe('LI75088110105923K000E');
  });

  it('returns the CHF collection IBAN for CHF', () => {
    expect(getFrickCollectionIban('CHF')).toBe('LI32088110105923K000C');
  });

  it('returns undefined for a currency without a configured collection IBAN', () => {
    expect(getFrickCollectionIban('USD')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getFrickCollectionIban(undefined)).toBeUndefined();
  });

  it('returns undefined for an inherited Object property name instead of resolving through the prototype chain', () => {
    expect(getFrickCollectionIban('constructor')).toBeUndefined();
  });
});

describe('getOfferableCollectionIban', () => {
  const verifiedFrickBase = {
    isPersonalIban: true,
    bank: FRICK_BANK_NAME,
    name: FRICK_ACCOUNT_HOLDER_NAME,
    remittanceInfo: 'DFX-BUY-1',
  };

  it('returns the CHF collection IBAN for a verified CHF Frick personal IBAN with remittanceInfo', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'CHF' },
        iban: 'LI35088110102979K002E',
      }),
    ).toBe('LI32088110105923K000C');
  });

  it('returns undefined when the CHF IBAN given is the CHF collection account itself', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'CHF' },
        iban: 'LI32088110105923K000C',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a currency without a configured collection IBAN (USD)', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'USD' },
        iban: 'LI35088110102979K002E',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the response is not a verified Bank Frick personal IBAN', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        isPersonalIban: false,
        currency: { name: 'CHF' },
        iban: 'LI35088110102979K002E',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when remittanceInfo is missing', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        remittanceInfo: undefined,
        currency: { name: 'CHF' },
        iban: 'LI35088110102979K002E',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when iban is missing', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'CHF' },
        iban: undefined,
      }),
    ).toBeUndefined();
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

  it('maps the PersonalIbanProviderNotAvailable token to the switch-back-or-support message', () => {
    expect(getPersonalIbanErrorMessage('PersonalIbanProviderNotAvailable')).toBe(
      'The requested personal IBAN is not available for your account. Please switch back or contact support.',
    );
  });

  it('does not map KycRequired (routed through QuoteErrorHint with a separate feature message)', () => {
    expect(getPersonalIbanErrorMessage(apiQuoteError.kycRequired)).toBeUndefined();
    expect(isKycRequiredMessage(apiQuoteError.kycRequired)).toBe(true);
    expect(getPersonalIbanKycMessage()).toBe('Personal IBANs require KYC level 50.');
  });

  it('qualifies the currency rejection as Bank Frick-specific and names both supported currencies', () => {
    expect(getPersonalIbanErrorMessage('PersonalIbanCurrencyNotSupported')).toBe(
      'Bank Frick personal IBANs are currently only available for EUR and CHF.',
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
          'Bank Frick personal IBANs are currently only available for EUR and CHF.'
        ];

      expect(message).toMatch(bankFrick);
      expect(message).toMatch(/EUR/i);
      expect(message).toMatch(/CHF/i);
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
  ] as const)('maps %s to customer-facing copy', (token, text) => {
    expect(getStoredPaymentDetailErrorMessage(token)).toBe(text);
    expect(getStoredPaymentDetailErrorMessage(token)).toBeTruthy();
  });

  it.each([
    'StoredPersonalIbanDoesNotBelongToThisUser',
    'StoredPersonalIbanDoesNotMatchThisTransactionRequest',
    'CurrencyNotFound',
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
    // Frick-only: a Yapeal selector must not count as an explicit Frick request.
    expect(isExplicitFrickPersonalIbanRequest('Yapeal')).toBe(false);
  });
});

describe('isExplicitPersonalIbanRequest', () => {
  it('is true for any recognized provider selector', () => {
    expect(isExplicitPersonalIbanRequest('Frick')).toBe(true);
    expect(isExplicitPersonalIbanRequest('frick')).toBe(true);
    expect(isExplicitPersonalIbanRequest('Yapeal')).toBe(true);
    expect(isExplicitPersonalIbanRequest('yapeal')).toBe(true);
  });

  it('is false for an unrecognized selector or an absent one', () => {
    expect(isExplicitPersonalIbanRequest('unknown')).toBe(false);
    expect(isExplicitPersonalIbanRequest(undefined)).toBe(false);
  });
});

describe('isVerifiedYapealPersonalIbanResponse', () => {
  it('accepts a Yapeal response with isPersonalIban true', () => {
    expect(isVerifiedYapealPersonalIbanResponse({ isPersonalIban: true, bank: YAPEAL_BANK_NAME })).toBe(true);
  });

  it('rejects a response with the wrong bank', () => {
    expect(isVerifiedYapealPersonalIbanResponse({ isPersonalIban: true, bank: FRICK_BANK_NAME })).toBe(false);
  });

  it('rejects a response with isPersonalIban false', () => {
    expect(isVerifiedYapealPersonalIbanResponse({ isPersonalIban: false, bank: YAPEAL_BANK_NAME })).toBe(false);
  });
});

describe('getYapealAlternative', () => {
  const activeChfYapealRow = {
    id: 7,
    iban: 'CH9300762011623852957',
    currency: 'CHF',
    bank: YAPEAL_BANK_NAME,
    active: true,
    acceptsPayments: true,
    status: VirtualIbanStatus.ACTIVE,
  };

  it('finds the matching active, payable Yapeal row for the given currency', () => {
    expect(getYapealAlternative([activeChfYapealRow], 'CHF')).toEqual(activeChfYapealRow);
  });

  it('ignores a row with a different currency', () => {
    expect(getYapealAlternative([activeChfYapealRow], 'EUR')).toBeUndefined();
  });

  it('ignores an inactive row', () => {
    expect(getYapealAlternative([{ ...activeChfYapealRow, active: false }], 'CHF')).toBeUndefined();
  });

  it('ignores a row that no longer accepts payments', () => {
    expect(getYapealAlternative([{ ...activeChfYapealRow, acceptsPayments: false }], 'CHF')).toBeUndefined();
  });

  it('ignores an expired row', () => {
    expect(
      getYapealAlternative([{ ...activeChfYapealRow, status: VirtualIbanStatus.EXPIRED }], 'CHF'),
    ).toBeUndefined();
  });

  it('accepts a row with no status set', () => {
    const { status: _status, ...rowWithoutStatus } = activeChfYapealRow;
    expect(getYapealAlternative([rowWithoutStatus as typeof activeChfYapealRow], 'CHF')).toEqual(
      expect.objectContaining({ iban: activeChfYapealRow.iban }),
    );
  });

  it('returns undefined for an undefined list', () => {
    expect(getYapealAlternative(undefined, 'CHF')).toBeUndefined();
  });

  it('returns undefined for an undefined currency', () => {
    expect(getYapealAlternative([activeChfYapealRow], undefined)).toBeUndefined();
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
