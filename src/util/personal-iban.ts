import { FiatPaymentMethod, PersonalIbanProvider, TransactionError } from '@dfx.swiss/react';

/** Bank Frick personal-IBAN accounts are held by DFX AG (routing sub-account), never the customer. */
export const FRICK_BANK_NAME = 'Bank Frick';
export const FRICK_ACCOUNT_HOLDER_NAME = 'DFX AG';

export function normalizePersonalIban(value: string | undefined): string | undefined {
  return value?.toLowerCase() === PersonalIbanProvider.FRICK.toLowerCase()
    ? PersonalIbanProvider.FRICK
    : value;
}

export function toPersonalIbanProviderRequest(
  value: string | undefined,
): { personalIbanProvider?: PersonalIbanProvider } {
  const normalized = value === undefined ? undefined : normalizePersonalIban(value);
  return normalized === PersonalIbanProvider.FRICK ? { personalIbanProvider: PersonalIbanProvider.FRICK } : {};
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
  return value !== undefined && normalizePersonalIban(value) !== PersonalIbanProvider.FRICK;
}

/** True when the customer explicitly requested the Bank Frick personal-IBAN provider. */
export function isExplicitFrickPersonalIbanRequest(value: string | undefined): boolean {
  return value !== undefined && normalizePersonalIban(value) === PersonalIbanProvider.FRICK;
}

export function isPersonalIbanApplicable(
  currencyName: string | undefined,
  paymentMethod: FiatPaymentMethod | undefined,
): boolean {
  return currencyName === 'EUR' && paymentMethod === FiatPaymentMethod.BANK;
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
 * Electronic-format IBAN of DFX's shared EUR collection account at Bank Frick (the same value
 * the public `GET /v1/bank` endpoint serves for the "Bank Frick" EUR row). Offered as an
 * alternative next to a Frick personal IBAN — display, QR rewrite and PDF invoice all follow the
 * toggle; transfers to it are attributable only via the remittance reference, so it must never
 * be shown without one.
 */
export const FRICK_EUR_COLLECTION_IBAN = 'LI75088110105923K000E';

/**
 * True when the customer holds a verified Bank Frick personal IBAN but their e-banking cannot
 * accept it (vBAN, contains letters), and it is safe to additionally offer the shared collection
 * account as an alternative (display, QR rewrite and PDF invoice follow the toggle).
 * `remittanceInfo` must be present: attribution on the shared collection account runs entirely
 * on the reference, and the backend enforces the same rule before it ever shows the collection
 * account itself as the primary IBAN. Whitespace-only `remittanceInfo` or `iban` is rejected
 * (same trim/normalize semantics as the rewrite). Customers already on the collection account
 * (`isPersonalIban` false) get no toggle - they already see it.
 */
export function canOfferCollectionIban(info: {
  currency?: { name?: string };
  isPersonalIban?: boolean;
  bank?: string;
  name?: string;
  remittanceInfo?: string;
  iban?: string;
}): boolean {
  if (info.currency?.name !== 'EUR') return false;
  if (!isVerifiedFrickPersonalIbanResponse(info)) return false;
  if (!info.remittanceInfo || !info.remittanceInfo.trim()) return false;
  if (!info.iban) return false;

  const normalized = info.iban.replace(/\s+/g, '').toUpperCase();
  if (!normalized) return false;
  return normalized !== FRICK_EUR_COLLECTION_IBAN;
}

/**
 * Rewrites a GiroCode (EPC069-12) payment request so line 6 (IBAN) becomes the DFX shared EUR
 * collection IBAN. The rebuild joins lines with `\n` (normalizing CRLF) and drops trailing blank
 * lines; leading whitespace is NOT tolerated (fail-closed — no silent repair). No other field
 * is altered. Fail-closed: returns undefined when personalIban or remittanceInfo is missing
 * (callers pass quote fields through unchanged; this function is the single gate — attribution
 * and matching are impossible without them). Also returns undefined unless the payload is a
 * well-formed SCT GiroCode (full 11-plus-line shape, version 001/002, charset line index 2 in
 * '1'..'8') whose IBAN line matches the given personal IBAN (whitespace/case ignored) and whose
 * remittance is carried on the unstructured line 10 only and equals the quote's remittance info.
 * This function does not implement ISO 11649 structured-reference validation; the quote
 * reference this frontend receives is a bankUsage string, not an ISO 11649 structured
 * reference. A populated structured-reference carrier (line 9) is therefore outside the shape
 * this function validates and is refused fail-closed — the worst case is no rewritten QR, while
 * manual IBAN entry and the original PDF invoice both remain available. Swiss QR-Bill SVG
 * payloads are never rewritten — callers must treat undefined as "no QR available".
 */
export function toCollectionIbanGiroCode(
  paymentRequest: string,
  personalIban: string | undefined,
  remittanceInfo: string | undefined,
): string | undefined {
  // Attribution/matching are impossible without them; callers narrow nothing.
  if (personalIban === undefined || remittanceInfo === undefined) return undefined;

  if (paymentRequest.includes('<svg')) return undefined;

  const lines = paymentRequest.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 11) return undefined;
  if (lines[0] !== 'BCD') return undefined;
  if (lines[1] !== '001' && lines[1] !== '002') return undefined;
  // EPC069-12 character set: values '1'..'8' only.
  if (!/^[1-8]$/.test(lines[2])) return undefined;
  if (lines[3] !== 'SCT') return undefined;

  const trimmedRemittance = remittanceInfo.trim();
  if (!trimmedRemittance) return undefined;
  const structuredReference = lines[9].trim();
  const unstructuredRemittance = lines[10].trim();
  // No ISO 11649 validation here: bankUsage is unstructured; a populated structured carrier is out of shape.
  if (structuredReference) return undefined;
  if (unstructuredRemittance !== trimmedRemittance) return undefined;

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
 * PersonalIbanIssuanceFailed, PersonalIbanProviderUnsupported,
 * PersonalIbanCurrencyNotSupported, CurrencyUnsupported, NoBankAvailableForThisCurrency.
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
  if (message.includes('PersonalIbanProviderUnsupported')) {
    return 'The requested personal IBAN provider is not recognized.';
  }
  if (message.includes('PersonalIbanCurrencyNotSupported')) {
    return 'Bank Frick personal IBANs are currently only available for EUR.';
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
