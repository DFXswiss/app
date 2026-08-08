import {
  FiatPaymentMethod,
  PersonalIbanProvider,
  TransactionError,
  VirtualIban,
  VirtualIbanStatus,
} from '@dfx.swiss/react';

/** Bank Frick personal-IBAN accounts are held by DFX AG (routing sub-account), never the customer. */
export const FRICK_BANK_NAME = 'Bank Frick';
export const FRICK_ACCOUNT_HOLDER_NAME = 'DFX AG';

/**
 * Legacy personal-IBAN provider that predates Bank Frick. Yapeal accounts are held directly by
 * the customer (no fixed DFX-side holder name to pin, unlike Bank Frick).
 */
export const YAPEAL_BANK_NAME = 'Yapeal';

/**
 * Electronic-format IBANs of DFX's shared collection accounts at Bank Frick, keyed by currency
 * (the same values the public `GET /v1/bank` endpoint serves for the "Bank Frick" EUR/CHF rows).
 * Display-only alternative next to a Frick personal IBAN; transfers to them are attributable
 * only via the remittance reference, so one must never be shown without one. Single source of
 * truth for which currencies Bank Frick serves - `FRICK_CURRENCIES` below is derived from its keys.
 */
export const FRICK_COLLECTION_IBANS: Readonly<Record<string, string>> = Object.freeze({
  EUR: 'LI75088110105923K000E',
  CHF: 'LI32088110105923K000C',
});

/**
 * Currencies Bank Frick personal IBANs and the shared collection account are available for.
 * Product decision; derived from `FRICK_COLLECTION_IBANS`'s keys so the two can never drift apart.
 */
export const FRICK_CURRENCIES: readonly string[] = Object.freeze(Object.keys(FRICK_COLLECTION_IBANS));

/**
 * Case-insensitive match against every recognized PersonalIbanProvider member (Frick, Yapeal,
 * and any future member added to the SDK enum) - looked up via Object.values, not two hardcoded
 * ifs, so a newly added provider is picked up automatically. Returns the canonical enum value on
 * a match, the original value otherwise (so an unrecognized selector is never silently dropped
 * before the fail-closed check below runs).
 */
export function normalizePersonalIban(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = parsePersonalIbanProvider(value);
  return match ?? value;
}

/** Parses a personal-IBAN provider selector case-insensitively. */
export function parsePersonalIbanProvider(value: string): PersonalIbanProvider | undefined {
  return Object.values(PersonalIbanProvider).find(
    (provider) => provider.toLowerCase() === value.toLowerCase(),
  );
}

/** True when normalizing the selector yields a recognized PersonalIbanProvider member. */
export function isExplicitPersonalIbanRequest(value: string | undefined): boolean {
  return value !== undefined && parsePersonalIbanProvider(value) !== undefined;
}

/** Builds the personalIbanProvider request fragment for any recognized provider, empty otherwise. */
export function toPersonalIbanProviderRequest(
  value: string | undefined,
): { personalIbanProvider?: PersonalIbanProvider } {
  if (value === undefined) return {};
  const provider = parsePersonalIbanProvider(value);
  return provider === undefined ? {} : { personalIbanProvider: provider };
}

/**
 * True when the customer set a personal-IBAN selector that is not a recognized
 * PersonalIbanProvider member (e.g. a typo, or a provider not (yet) supported). The API used to
 * be the sole source of truth for this (fail-closed @IsEnum validation on the backend DTO); the
 * frontend now has the same authoritative provider set via the SDK enum, so this fails closed
 * locally with the identical PersonalIbanProviderUnsupported copy instead of silently building
 * a request that omits the selector and falls back to an ordinary bank-transfer quote.
 */
export function isUnrecognizedPersonalIbanSelector(value: string | undefined): boolean {
  return value !== undefined && !isExplicitPersonalIbanRequest(value);
}

export function isPersonalIbanApplicable(
  currencyName: string | undefined,
  paymentMethod: FiatPaymentMethod | undefined,
): boolean {
  return (
    currencyName !== undefined && FRICK_CURRENCIES.includes(currencyName) && paymentMethod === FiatPaymentMethod.BANK
  );
}

interface EffectivePersonalIbanProviderParams {
  providerOverride?: PersonalIbanProvider;
  hasRequestedPersonalIbanSelector: boolean;
  personalIban?: string;
  hasYapealAlternative: boolean;
  isUserLoading: boolean;
  kycAllowsFrick: boolean;
  automaticFrickSuppressed: boolean;
}

/** Applies the shared provider precedence used by both buy quote screens. */
export function deriveEffectivePersonalIbanProvider({
  providerOverride,
  hasRequestedPersonalIbanSelector,
  personalIban,
  hasYapealAlternative,
  isUserLoading,
  kycAllowsFrick,
  automaticFrickSuppressed,
}: EffectivePersonalIbanProviderParams): PersonalIbanProvider | undefined {
  if (providerOverride !== undefined) return providerOverride;
  if (hasRequestedPersonalIbanSelector) {
    return toPersonalIbanProviderRequest(personalIban).personalIbanProvider;
  }
  if (
    hasYapealAlternative &&
    !isUserLoading &&
    kycAllowsFrick &&
    !automaticFrickSuppressed
  ) {
    return PersonalIbanProvider.FRICK;
  }
  return undefined;
}

/**
 * Compatibility check for an explicit Frick personal-IBAN quote response.
 * Bank Frick does not open accounts in the customer's name — holder stays DFX AG, only the IBAN
 * is customer-unique. Rejects ordinary/legacy responses from rolled-back APIs that strip the
 * selector or label the customer as holder.
 */
export function isVerifiedFrickPersonalIbanResponse(info: {
  isPersonalIban?: boolean;
  bank?: string;
  name?: string;
}): boolean {
  return (
    info.isPersonalIban === true &&
    info.bank === FRICK_BANK_NAME &&
    info.name === FRICK_ACCOUNT_HOLDER_NAME
  );
}

/**
 * Compatibility check for an explicit Yapeal personal-IBAN quote response. Yapeal accounts are
 * customer-held, so unlike the Frick check above there is no fixed holder name to pin - only the
 * bank label and the isPersonalIban flag identify a genuine Yapeal response.
 */
export function isVerifiedYapealPersonalIbanResponse(info: { isPersonalIban?: boolean; bank?: string }): boolean {
  return info.isPersonalIban === true && info.bank === YAPEAL_BANK_NAME;
}

/**
 * Looks up the Bank Frick collection IBAN for a currency; undefined if none is configured.
 * Uses an own-property check rather than a bare index access: `currencyName` is caller-controlled,
 * and a value like `'constructor'` or `'toString'` must resolve to `undefined`, not to whatever
 * that name happens to mean on the object prototype chain.
 */
export function getFrickCollectionIban(currencyName: string | undefined): string | undefined {
  return currencyName !== undefined && Object.hasOwn(FRICK_COLLECTION_IBANS, currencyName)
    ? FRICK_COLLECTION_IBANS[currencyName]
    : undefined;
}

/**
 * The customer's existing, still-payable Yapeal personal IBAN for a given currency, or undefined
 * if none qualifies. Used to decide whether the Bank Frick default can safely be offered as a
 * switch-back target, and whether the automatic Frick default may apply at all (it must never
 * apply to a customer who has no Yapeal row to fall back to on a KYC rejection).
 */
export function getYapealAlternative(
  personalIbans: VirtualIban[] | undefined,
  currencyName: string | undefined,
): VirtualIban | undefined {
  if (personalIbans === undefined || currencyName === undefined) return undefined;
  return personalIbans.find(
    (iban) =>
      iban.bank === YAPEAL_BANK_NAME &&
      iban.currency === currencyName &&
      iban.active === true &&
      iban.acceptsPayments === true &&
      (iban.status === undefined || iban.status === VirtualIbanStatus.ACTIVE),
  );
}

/**
 * The Bank Frick collection IBAN to offer as a display-only alternative to a verified Bank Frick
 * personal IBAN, or undefined if none should be offered. Typical reason to offer it: the
 * customer's e-banking cannot accept the personal IBAN (vBAN, contains letters). `remittanceInfo`
 * must be present: attribution on the shared collection account runs entirely on the reference,
 * and the backend enforces the same rule before it ever shows the collection account itself as
 * the primary IBAN. Customers already on the collection account (`isPersonalIban` false) get
 * undefined here - they already see it.
 */
export function getOfferableCollectionIban(info: {
  currency?: { name?: string };
  isPersonalIban?: boolean;
  bank?: string;
  name?: string;
  remittanceInfo?: string;
  iban?: string;
}): string | undefined {
  const collectionIban = getFrickCollectionIban(info.currency?.name);
  if (!collectionIban) return undefined;
  if (!isVerifiedFrickPersonalIbanResponse(info)) return undefined;
  if (!info.remittanceInfo) return undefined;
  if (!info.iban) return undefined;

  const normalized = info.iban.replace(/\s+/g, '').toUpperCase();
  return normalized !== collectionIban ? collectionIban : undefined;
}

/**
 * Rewrites a GiroCode (EPC069-12) payment request so line 6 (IBAN) becomes the DFX shared EUR
 * collection IBAN. Fail-closed: returns undefined unless the payload is a well-formed SCT
 * GiroCode (full 10+-line shape (index 9 = structured reference; unstructured line 10 may be
 * omitted), version 001/002) whose IBAN line matches the given personal IBAN
 * (whitespace/case ignored) and whose remittance line (structured line 9 or unstructured
 * line 10) equals the quote's remittance info. Swiss QR-Bill SVG payloads are never rewritten —
 * callers must treat undefined as "no QR available".
 */
export function toCollectionIbanGiroCode(
  paymentRequest: string,
  personalIban: string,
  remittanceInfo: string,
): string | undefined {
  if (paymentRequest.includes('<svg')) return undefined;

  const lines = paymentRequest.trim().split(/\r?\n/);
  if (lines.length < 10) return undefined;
  if (lines[0] !== 'BCD') return undefined;
  if (lines[1] !== '001' && lines[1] !== '002') return undefined;
  if (lines[3] !== 'SCT') return undefined;

  const trimmedRemittance = remittanceInfo.trim();
  if (!trimmedRemittance) return undefined;
  const structuredReference = lines[9].trim();
  const unstructuredRemittance = lines.length > 10 ? lines[10].trim() : '';
  if (structuredReference !== trimmedRemittance && unstructuredRemittance !== trimmedRemittance) return undefined;

  const normalizedLine = lines[6].replace(/\s+/g, '').toUpperCase();
  const normalizedPersonal = personalIban.replace(/\s+/g, '').toUpperCase();
  if (!normalizedPersonal) return undefined;
  if (normalizedLine !== normalizedPersonal) return undefined;

  lines[6] = FRICK_EUR_COLLECTION_IBAN;
  return lines.join('\n');
}

/**
 * Allowlist for external-login callbacks: only forward an explicitly present `personal-iban`.
 * Do not copy the entire live search (would leak `user`, `arbitrary`, etc.).
 */
export function personalIbanOnlyParams(search: string): URLSearchParams {
  const params = new URLSearchParams();
  const personalIban = new URLSearchParams(search).get('personal-iban');
  if (personalIban != null) {
    params.set('personal-iban', personalIban);
  }
  return params;
}

/**
 * Feature-local error copy for Bank Frick personal-IBAN failures during the buy quote flow
 * (buy.screen / buy-info.screen). These must not reuse shared TransactionError members:
 * PaymentMethodNotAllowed would show the generic account-level wording (wrong here),
 * PersonalIbanIssuanceFailed has no fitting shared member, and the
 * invalid-provider validation message is also feature-specific. Returns untranslated
 * English defaults; callers translate via translate('screens/payment', text).
 *
 * Maps QuoteError tokens thrown on the purchase/selection path (resolveBankInfo /
 * getOrCreateFrickForUser / DTO validation): PaymentMethodNotAllowed,
 * PersonalIbanIssuanceFailed, PersonalIbanProviderNotAvailable, PersonalIbanProviderUnsupported,
 * PersonalIbanCurrencyNotSupported, CurrencyUnsupported, NoBankAvailableForThisCurrency.
 * PersonalIbanProviderNotAvailable is the fail-closed response to an explicit selector for a
 * provider the customer does not actually hold (e.g. requesting Yapeal without an active Yapeal
 * row) - it is distinct from PersonalIbanProviderUnsupported (selector not a recognized member).
 * KycRequired is intentionally NOT mapped here — callers route it through QuoteErrorHint
 * with a feature-specific message override so the Complete KYC action stays available.
 * Raw backend BadRequestException texts (e.g. 'Asset not found') are intentionally not matched.
 */
export function getPersonalIbanErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;

  if (message.includes(TransactionError.PAYMENT_METHOD_NOT_ALLOWED)) {
    return 'Personal IBANs require the bank transfer payment method.';
  }
  if (message.includes('PersonalIbanIssuanceFailed')) {
    return 'We could not issue your personal IBAN. Please try again later or contact support if the problem persists.';
  }
  if (message.includes('PersonalIbanProviderNotAvailable')) {
    return 'The requested personal IBAN is not available for your account. Please switch back or contact support.';
  }
  if (message.includes('PersonalIbanProviderUnsupported')) {
    return 'The requested personal IBAN provider is not recognized.';
  }
  if (message.includes('PersonalIbanCurrencyNotSupported')) {
    return 'Bank Frick personal IBANs are currently only available for EUR and CHF.';
  }
  if (message.includes('CurrencyUnsupported')) {
    return 'The selected currency is not available. Please try a different currency or contact support.';
  }
  if (message.includes('NoBankAvailableForThisCurrency')) {
    return 'No bank is available for this currency. Please try a different currency or contact support.';
  }

  return undefined;
}

/** Feature-specific KYC explanation when a personal-IBAN selector was set and the API returns KycRequired. */
export function getPersonalIbanKycMessage(): string {
  return 'Personal IBANs require KYC level 50.';
}

/** True when the error token is KycRequired (buy-path personal-IBAN or generic). */
export function isKycRequiredMessage(message: string | undefined): boolean {
  return Boolean(message?.includes(TransactionError.KYC_REQUIRED));
}

/**
 * Feature-local error copy for invoice/receipt PDF failures. Returns untranslated English
 * defaults; callers translate via translate('screens/payment', text).
 *
 * Maps QuoteError tokens from getBankInfoForRequest (stored-detail reconstruction):
 * StoredTransactionRequestBankSelectionIncomplete, StoredTransactionRequestBankNoLongerExists,
 * StoredPersonalIbanUserMismatch, StoredPersonalIbanTransactionRequestMismatch,
 * StoredPersonalIbanIsNoLongerActive, StoredBankNoLongerAcceptsPayments.
 *
 * Also maps collection-account invoice guards from PUT buy/paymentInfos/:id/invoice
 * (?collectionAccount=true): CollectionAccountInvoicePersonalIbanMissing and
 * CollectionAccountInvoiceCurrencyNotSupported — both share one customer-facing message;
 * the tokens stay separate so the logs still say which guard rejected.
 *
 * Buy-quote tokens (e.g. KycRequired, CurrencyUnsupported, NoBankAvailableForThisCurrency)
 * are intentionally not matched so invoice/receipt errors never show purchase-flow wording.
 */
export function getStoredPaymentDetailErrorMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;

  if (message.includes('StoredTransactionRequestBankSelectionIncomplete')) {
    return 'This stored payment detail is incomplete. Please start a new purchase.';
  }
  if (message.includes('StoredTransactionRequestBankNoLongerExists')) {
    return 'The bank for this payment is no longer available. Please start a new purchase.';
  }
  if (message.includes('StoredPersonalIbanUserMismatch')) {
    return 'This stored personal IBAN is no longer valid for your account. Please start a new purchase.';
  }
  if (message.includes('StoredPersonalIbanTransactionRequestMismatch')) {
    return 'This stored personal IBAN does not match this transaction. Please start a new purchase.';
  }
  if (message.includes('StoredPersonalIbanIsNoLongerActive')) {
    return 'This personal IBAN is no longer active. Please start a new purchase.';
  }
  if (message.includes('StoredBankNoLongerAcceptsPayments')) {
    return 'This bank no longer accepts payments. Please start a new purchase.';
  }

  if (
    message.includes('CollectionAccountInvoicePersonalIbanMissing') ||
    message.includes('CollectionAccountInvoiceCurrencyNotSupported')
  ) {
    return 'The invoice for the collection account cannot be created right now. Please use the payment details shown on this screen.';
  }

  return undefined;
}
