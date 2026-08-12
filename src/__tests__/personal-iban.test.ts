// Use the actual enums re-exported by the SDK. The literals below are emitted by the API's
// QuoteError enum (api/src/.../quote-error.enum.ts) and intentionally form a cross-contract check.

jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: {
    BANK: 'Bank',
    INSTANT: 'Instant',
    CARD: 'Card',
  },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
  VirtualIbanStatus: {
    RESERVED: 'Reserved',
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    DEACTIVATED: 'Deactivated',
  },
  TransactionError: {
    PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
    KYC_REQUIRED: 'KycRequired',
  },
}));

import {
  FiatPaymentMethod,
  PersonalIbanProvider,
  TransactionError,
  VirtualIbanStatus,
} from '@dfx.swiss/react';
import { readFileSync } from 'fs';
import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import italian from '../translations/languages/it.json';
import {
  FRICK_ACCOUNT_HOLDER_NAME,
  FRICK_BANK_NAME,
  FRICK_COLLECTION_IBANS,
  YAPEAL_BANK_NAME,
  deriveEffectivePersonalIbanProvider,
  getFrickCollectionIban,
  getOfferableCollectionIban,
  getPersonalIbanErrorMessage,
  getPersonalIbanKycMessage,
  getStoredPaymentDetailErrorMessage,
  getYapealAlternative,
  isExplicitPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  isVerifiedYapealPersonalIbanResponse,
  normalizePersonalIban,
  parsePersonalIbanProvider,
  personalIbanOnlyParams,
  toCollectionIbanGiroCode,
  toPersonalIbanProviderRequest,
} from '../util/personal-iban';

describe('personal IBAN selector mapping', () => {
  it.each(['frick', 'FRICK', 'Frick'])('maps the public %s value to the API enum', (value) => {
    expect(parsePersonalIbanProvider(value)).toBe(PersonalIbanProvider.FRICK);
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
      expect(parsePersonalIbanProvider(value)).toBeUndefined();
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

describe('deriveEffectivePersonalIbanProvider', () => {
  const autoFrickParams = {
    providerOverride: undefined,
    hasRequestedPersonalIbanSelector: false,
    personalIban: undefined,
    hasYapealAlternative: true,
    isUserLoading: false,
    kycAllowsFrick: true,
    automaticFrickSuppressed: false,
  };

  it('prefers an explicit provider override', () => {
    expect(
      deriveEffectivePersonalIbanProvider({
        ...autoFrickParams,
        providerOverride: PersonalIbanProvider.YAPEAL,
        hasRequestedPersonalIbanSelector: true,
        personalIban: 'Frick',
      }),
    ).toBe(PersonalIbanProvider.YAPEAL);
  });

  it('uses a recognized explicit selector before the automatic default', () => {
    expect(
      deriveEffectivePersonalIbanProvider({
        ...autoFrickParams,
        hasRequestedPersonalIbanSelector: true,
        personalIban: 'yapeal',
      }),
    ).toBe(PersonalIbanProvider.YAPEAL);
  });

  it('does not fall through when an explicit selector has no active provider', () => {
    expect(
      deriveEffectivePersonalIbanProvider({
        ...autoFrickParams,
        hasRequestedPersonalIbanSelector: true,
      }),
    ).toBeUndefined();
  });

  it('selects Frick for an eligible loaded Yapeal holder', () => {
    expect(deriveEffectivePersonalIbanProvider(autoFrickParams)).toBe(
      PersonalIbanProvider.FRICK,
    );
  });

  it.each([
    ['no Yapeal alternative', { hasYapealAlternative: false }],
    ['user still loading', { isUserLoading: true }],
    ['KYC below threshold', { kycAllowsFrick: false }],
    ['automatic Frick default suppressed', { automaticFrickSuppressed: true }],
  ])('omits the automatic provider when %s', (_case, override) => {
    expect(
      deriveEffectivePersonalIbanProvider({ ...autoFrickParams, ...override }),
    ).toBeUndefined();
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

  it('returns the EUR collection IBAN for a verified EUR Frick personal IBAN with remittanceInfo', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'EUR' },
        iban: 'LI21088110102979K002E',
      }),
    ).toBe('LI75088110105923K000E');
  });

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

  it('returns undefined when remittanceInfo is whitespace-only', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        remittanceInfo: '   ',
        currency: { name: 'EUR' },
        iban: 'LI21088110102979K002E',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when iban is whitespace-only', () => {
    expect(
      getOfferableCollectionIban({
        ...verifiedFrickBase,
        currency: { name: 'EUR' },
        iban: '  ',
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
    [
      'CollectionAccountInvoicePersonalIbanMissing',
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

  it('ignores a matching row from a bank other than Yapeal', () => {
    expect(
      getYapealAlternative([{ ...activeChfYapealRow, bank: FRICK_BANK_NAME }], 'CHF'),
    ).toBeUndefined();
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

const PERSONAL_GIRO_IBAN = 'LI21088110102979K002E';
const SAMPLE_REMITTANCE = 'DFX-BUY-1';
const SAMPLE_AMOUNT = 100;

/** Production-shaped GiroCode (api config: version 001, encoding 2). */
function sampleGiroCode(
  overrides: {
    line0?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    iban?: string;
    line7?: string;
    line9?: string;
    line10?: string;
  } = {},
): string {
  return [
    overrides.line0 ?? 'BCD',
    overrides.line1 ?? '001',
    overrides.line2 ?? '2',
    overrides.line3 ?? 'SCT',
    'BFRILI22',
    'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
    overrides.iban ?? PERSONAL_GIRO_IBAN,
    overrides.line7 ?? 'EUR100',
    '',
    overrides.line9 ?? '',
    overrides.line10 ?? SAMPLE_REMITTANCE,
  ].join('\n');
}

describe('toCollectionIbanGiroCode', () => {
  it('returns undefined when personalIban is undefined', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode(), undefined, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when remittanceInfo is undefined', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode(), PERSONAL_GIRO_IBAN, undefined, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when amount is undefined', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode(), PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, undefined, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined unless the quote currency is exactly EUR', () => {
    const paymentRequest = sampleGiroCode();
    expect(
      toCollectionIbanGiroCode(paymentRequest, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'CHF'),
    ).toBeUndefined();
    expect(
      toCollectionIbanGiroCode(paymentRequest, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeDefined();
  });

  it('returns undefined when currencyName is undefined', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode(), PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, undefined),
    ).toBeUndefined();
  });

  it('rewrites the IBAN and preserves an empty amount line', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line7: '' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
    expect(result.split('\n')[7]).toBe('');
  });

  it('returns undefined because a whitespace-only amount line is malformed, not absent', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: '   ' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 amount does not match the quote amount', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR200' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 uses exponent notation (EUR1e2)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR1e2' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 uses hex notation (EUR0x64)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR0x64' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 has an empty numeric part (EUR)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 has a signed amount (EUR-100)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR-100' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('accepts EUR100.00 as numerically equal to amount 100', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line7: 'EUR100.00' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('returns undefined when the quote amount diverges below cent precision', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR100.00' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        100.004,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('accepts EUR100.50 as numerically equal to amount 100.5', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line7: 'EUR100.50' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      100.5,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('returns undefined when line 7 carries leading zeros in the amount', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR000000000100' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 7 exceeds the EPC amount ceiling', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'EUR1000000000' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        1000000000,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('accepts EUR0.50 as numerically equal to amount 0.5', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line7: 'EUR0.50' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      0.5,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('returns undefined when line 7 has a non-EUR currency prefix', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line7: 'CHF100' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('replaces only line 6 on an LF payload without a trailing blank line, leaving all other lines and the line count untouched', () => {
    const input = sampleGiroCode();
    const originalLines = input.split('\n');
    const result = toCollectionIbanGiroCode(input, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR');

    expect(result).toBeDefined();
    if (result === undefined) return;
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(originalLines.length);

    for (let i = 0; i < originalLines.length; i++) {
      if (i === 6) {
        expect(resultLines[i]).toBe(FRICK_COLLECTION_IBANS.EUR);
      } else {
        expect(resultLines[i]).toBe(originalLines[i]);
      }
    }
  });

  it('returns undefined when both remittance carriers are populated and structured matches', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line9: SAMPLE_REMITTANCE, line10: 'OTHER-REF' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when both remittance carriers are populated and unstructured matches', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line9: 'OTHER-REF', line10: SAMPLE_REMITTANCE }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when both remittance carriers are populated with the same matching reference', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line9: SAMPLE_REMITTANCE, line10: SAMPLE_REMITTANCE }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('normalizes CRLF input to LF separators and rewrites only line 6', () => {
    const lfPayload = sampleGiroCode();
    const originalLines = lfPayload.split('\n');
    const input = originalLines.join('\r\n');
    const result = toCollectionIbanGiroCode(input, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR');

    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result).not.toContain('\r');
    expect(result.includes('\n')).toBe(true);
    const resultLines = result.split('\n');
    expect(resultLines[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
    for (let i = 0; i < originalLines.length; i++) {
      if (i === 6) {
        expect(resultLines[i]).toBe(FRICK_COLLECTION_IBANS.EUR);
      } else {
        expect(resultLines[i]).toBe(originalLines[i]);
      }
    }
  });

  it('silently drops a trailing blank line on rebuild', () => {
    const base = sampleGiroCode();
    const withTrailing = base + '\n';
    const result = toCollectionIbanGiroCode(
      withTrailing,
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    const expected = toCollectionIbanGiroCode(
      base,
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );

    expect(result).toBeDefined();
    expect(result).toBe(expected);
  });

  it('returns undefined when the charset line is 9 (outside EPC069-12 1..8)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line2: '9' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the charset line is empty', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line2: '' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('rewrites when the charset line is explicitly 2 (production value)', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line2: '2' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('returns undefined when line 0 has leading whitespace before BCD (fail-closed, no silent trim)', () => {
    expect(
      toCollectionIbanGiroCode(' ' + sampleGiroCode(), PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when the payload starts with a leading blank line', () => {
    expect(
      toCollectionIbanGiroCode(
        '\n' + sampleGiroCode(),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 0 is not BCD', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line0: 'EPC' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 3 is not SCT', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line3: 'SDD' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when line 6 is a different IBAN than the given personal IBAN', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ iban: 'LI99088110100000K999E' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
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
      SAMPLE_REMITTANCE,
    ].join('\n');
    expect(
      toCollectionIbanGiroCode(svgEmbedded, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when the payload has fewer than 10 lines', () => {
    const shortPayload = [
      'BCD',
      '001',
      '2',
      'SCT',
      'BFRILI22',
      'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
      PERSONAL_GIRO_IBAN,
      'EUR100',
      '',
    ].join('\n');
    expect(shortPayload.split('\n')).toHaveLength(9);
    expect(
      toCollectionIbanGiroCode(shortPayload, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when the payload has exactly 7 lines (BCD..IBAN only)', () => {
    const sevenLinePayload = [
      'BCD',
      '001',
      '2',
      'SCT',
      'BFRILI22',
      'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
      PERSONAL_GIRO_IBAN,
    ].join('\n');
    expect(sevenLinePayload.split('\n')).toHaveLength(7);
    expect(
      toCollectionIbanGiroCode(sevenLinePayload, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when the payload has 13 lines', () => {
    const thirteenLinePayload = [sampleGiroCode(), 'GDDS', 'EXTRA'].join('\n');
    expect(thirteenLinePayload.split('\n')).toHaveLength(13);
    expect(
      toCollectionIbanGiroCode(
        thirteenLinePayload,
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('rewrites a 12-line payload with a populated beneficiary-to-originator line', () => {
    const twelveLinePayload = [sampleGiroCode(), 'GDDS'].join('\n');
    expect(twelveLinePayload.split('\n')).toHaveLength(12);
    expect(
      toCollectionIbanGiroCode(
        twelveLinePayload,
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeDefined();
  });

  it('returns undefined when the remittance does not match the payload', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode(), PERSONAL_GIRO_IBAN, 'OTHER-REF', SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('returns undefined when the expected remittance is empty', () => {
    expect(toCollectionIbanGiroCode(sampleGiroCode(), PERSONAL_GIRO_IBAN, '', SAMPLE_AMOUNT, 'EUR')).toBeUndefined();
  });

  it('returns undefined when the version line is not 001 or 002', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line1: '003' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined when the remittance is carried on the structured-reference line (outside the shape this function validates)', () => {
    expect(
      toCollectionIbanGiroCode(
        sampleGiroCode({ line9: SAMPLE_REMITTANCE, line10: '' }),
        PERSONAL_GIRO_IBAN,
        SAMPLE_REMITTANCE,
        SAMPLE_AMOUNT,
        'EUR',
      ),
    ).toBeUndefined();
  });

  it('returns undefined for a 10-line payload — below the 11-line minimum', () => {
    const tenLinePayload = [
      'BCD',
      '001',
      '2',
      'SCT',
      'BFRILI22',
      'DFX AG, Bahnhofstrasse 7, 6300 Zug, Schweiz',
      PERSONAL_GIRO_IBAN,
      'EUR100',
      '',
      SAMPLE_REMITTANCE,
    ].join('\n');
    expect(tenLinePayload.split('\n')).toHaveLength(10);
    expect(
      toCollectionIbanGiroCode(tenLinePayload, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('tolerates surrounding whitespace on the payload remittance line', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode({ line10: ' DFX-BUY-1 ' }),
      PERSONAL_GIRO_IBAN,
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('returns undefined when the personal IBAN is empty', () => {
    expect(
      toCollectionIbanGiroCode(sampleGiroCode({ iban: '' }), '', SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR'),
    ).toBeUndefined();
  });

  it('tolerates CRLF line endings from the payload', () => {
    const input = sampleGiroCode().replace(/\n/g, '\r\n');
    const result = toCollectionIbanGiroCode(input, PERSONAL_GIRO_IBAN, SAMPLE_REMITTANCE, SAMPLE_AMOUNT, 'EUR');
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });

  it('tolerates whitespace and lowercase in the given personal IBAN', () => {
    const result = toCollectionIbanGiroCode(
      sampleGiroCode(),
      'li21 0881 1010 2979 k002 e',
      SAMPLE_REMITTANCE,
      SAMPLE_AMOUNT,
      'EUR',
    );
    expect(result).toBeDefined();
    if (result === undefined) return;
    expect(result.split('\n')[6]).toBe(FRICK_COLLECTION_IBANS.EUR);
  });
});
