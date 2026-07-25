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
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    // Chains the wallet catalog pins its entries to (walletIconFor test below).
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
  },
  // Real values from @dfx.swiss/core (definitions/auth.js) — several catalog entries share
  // AuthWalletType.CLI, which is exactly what the walletIconFor precedence test covers.
  AuthWalletType: {
    METAMASK: 'MetaMask',
    RABBY: 'Rabby',
    WALLET_BROWSER: 'WalletBrowser',
    TRUST: 'Trust',
    PHANTOM: 'Phantom',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
    LEDGER: 'Ledger',
    BIT_BOX: 'BitBox',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    WALLET_CONNECT: 'WalletConnect',
    DFX_TARO: 'DfxTaro',
  },
  FiatPaymentMethod: {
    BANK: 'Bank',
    INSTANT: 'Instant',
    CARD: 'Card',
  },
  KycStepReason: {
    ACCOUNT_EXISTS: 'AccountExists',
    ACCOUNT_MERGE_REQUESTED: 'AccountMergeRequested',
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
  },
}));

import { ApiException, Blockchain, FiatPaymentMethod, type Asset, type Fiat } from '@dfx.swiss/react';
import type { TranslationKey } from '../i18n';
import { paymentMethodsFor } from '../components/pickers/PaymentMethodPicker';
import { currenciesForBuy, currenciesForSell } from '../screens/trade/capabilities';
import { shownChainsFor } from '../screens/trade/asset-pool';
import { mapThrownError, mapTransactionError } from '../screens/trade/errors';
import { parseAmt } from '../screens/trade/amount';
import type { TradeAsset } from '../screens/trade/types';
import {
  apiStatusCode,
  isTfaAlreadyEnrolledError,
  isTfaRequiredError,
  kycHandoffFromError,
} from '../screens/kyc-recovery';
import { findSendCandidate, shouldSyncSupportIssue } from '../screens/support-delivery';
import { appUrl, isSafeAppUrl } from '../utils/url';
import { classifyInviteCode, normalizeInviteCode } from '../wallets/invite';
import { readFileAsBase64 } from '../screens/kyc-file-upload';
import { walletIconFor } from '../wallets/catalog';
import { shouldInvalidateSession } from '../wallets/session-guards';
import { clearWalletConnectStorage } from '../wallets/storage';
import type { SupportIssue, SupportMessage } from '@dfx.swiss/react';

const eur: Fiat = {
  id: 1,
  name: 'EUR',
  buyable: true,
  sellable: false,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const chf: Fiat = { ...eur, id: 2, name: 'CHF', buyable: false, sellable: true };

function asset(
  id: number,
  blockchain: Blockchain,
  flags: { buyable: boolean; sellable: boolean; instantBuyable?: boolean },
): Asset {
  return {
    id,
    name: 'USDC',
    description: 'USD Coin',
    blockchain,
    instantBuyable: false,
    ...flags,
  } as unknown as Asset;
}

describe('App2 review regressions', () => {
  const t = (key: TranslationKey, _vars?: Record<string, string | number>) => key;

  it('uses DFX sellable fiat for user buys and DFX buyable fiat for user sells', () => {
    expect(currenciesForBuy([eur, chf])).toEqual([chf]);
    expect(currenciesForSell([eur, chf])).toEqual([eur]);
  });

  it('offers Instant only when both the currency and the selected asset allow it (never Card)', () => {
    const instantBuyableOnly: Fiat = { ...chf, instantBuyable: true, instantSellable: false };
    const instantSellableCurrency: Fiat = { ...chf, instantSellable: true };
    const instantAsset = asset(10, Blockchain.ETHEREUM, { buyable: true, sellable: true, instantBuyable: true });
    const nonInstantAsset = asset(11, Blockchain.ETHEREUM, { buyable: true, sellable: true, instantBuyable: false });

    // The API checks currency.instantSellable, not currency.instantBuyable
    // (payment-info.service.ts buyCheck) — a fiat with only the *wrong* flag set must never
    // offer Instant, no matter what the asset allows.
    expect(paymentMethodsFor(instantBuyableOnly, instantAsset).map(({ id }) => id)).toEqual([FiatPaymentMethod.BANK]);

    // Both the currency and the chosen asset allow it → Instant is offered.
    expect(paymentMethodsFor(instantSellableCurrency, instantAsset).map(({ id }) => id)).toEqual([
      FiatPaymentMethod.BANK,
      FiatPaymentMethod.INSTANT,
    ]);

    // Currency allows it, but the chosen asset doesn't — still excluded (the API also checks
    // asset.instantBuyable, which the ported picker ignored entirely).
    expect(paymentMethodsFor(instantSellableCurrency, nonInstantAsset).map(({ id }) => id)).toEqual([
      FiatPaymentMethod.BANK,
    ]);

    // Card is never offered — the API hard-disables it (fiat-dto.mapper.ts) regardless of any flag.
    expect(paymentMethodsFor(instantSellableCurrency, instantAsset).map(({ id }) => id)).not.toContain(
      FiatPaymentMethod.CARD,
    );
  });

  it('passes a canonical invite code to both login paths', () => {
    // Case-preserving like the static preview's REF_RE (/^[A-Za-z0-9-]{4,14}$/); only trims.
    expect(normalizeInviteCode('  ab-c12  ')).toBe('ab-c12');
    expect(normalizeInviteCode('   ')).toBeUndefined();
  });

  it('classifies an invite code into the exact API field it belongs in, never both', () => {
    // Short partner/wallet ref — api/src/config/config.ts formats.ref: /^(\w{1,3}-\w{1,3})$/.
    expect(classifyInviteCode('ab-c12')).toEqual({ kind: 'usedRef', code: 'AB-C12' });
    // Full referral code — formats.recommendationCode: /[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}/.
    expect(classifyInviteCode('xy-ab12-cd34-ef')).toEqual({
      kind: 'recommendationCode',
      code: 'XY-AB12-CD34-EF',
    });
    // Already upper-case input classifies the same way.
    expect(classifyInviteCode('XY-AB12-CD34-EF')).toEqual({
      kind: 'recommendationCode',
      code: 'XY-AB12-CD34-EF',
    });
    // Neither real API shape — must not be guessed into one, or it guarantees a 400.
    expect(classifyInviteCode('not-a-real-code-at-all')).toBeUndefined();
    expect(classifyInviteCode('')).toBeUndefined();
    expect(classifyInviteCode(undefined)).toBeUndefined();
  });

  it("shows a placeholder on Landing's invite field that is itself a recognized code shape", () => {
    // Round-2 finding: the old "DFX-XXXX" placeholder matched neither real API regex, so a user
    // who typed something shaped like it got the code silently dropped with zero feedback. Pins
    // the replacement placeholder (Landing.tsx) against the same classifier the field itself now
    // gates its inline hint on, so the two can't drift apart again.
    expect(classifyInviteCode('ABC-123')).toEqual({ kind: 'usedRef', code: 'ABC-123' });
  });

  it('only invalidates an injected-wallet session for a real account change, not a re-cased echo', () => {
    const active = '0xAbC1230000000000000000000000000000dEaD';

    // An empty accounts list means the extension locked or revoked the site — no account left to
    // be signed in as.
    expect(shouldInvalidateSession(active, [])).toBe(true);
    // A genuinely different account switched in.
    expect(shouldInvalidateSession(active, ['0x00000000000000000000000000000000000001'])).toBe(true);
    // The same account, reported in a different case — EVM addresses are not case-sensitive
    // identity, so this must never force a re-authentication.
    expect(shouldInvalidateSession(active, [active.toLowerCase()])).toBe(false);
    expect(shouldInvalidateSession(active, [active.toUpperCase().replace('0X', '0x')])).toBe(false);
  });

  it('uses every authenticated wallet chain when filtering token routes', () => {
    const token: TradeAsset = {
      code: 'USDC',
      description: 'USD Coin',
      chains: [
        { blockchain: Blockchain.ETHEREUM, asset: asset(1, Blockchain.ETHEREUM, { buyable: true, sellable: true }) },
        { blockchain: Blockchain.ARBITRUM, asset: asset(2, Blockchain.ARBITRUM, { buyable: true, sellable: true }) },
      ],
    };

    expect(shownChainsFor(token, 'buy', [Blockchain.ETHEREUM, Blockchain.ARBITRUM]).map((c) => c.blockchain)).toEqual([
      Blockchain.ETHEREUM,
      Blockchain.ARBITRUM,
    ]);
  });

  it('does not fall back to an unreachable chain', () => {
    const token: TradeAsset = {
      code: 'USDC',
      description: 'USD Coin',
      chains: [
        { blockchain: Blockchain.ARBITRUM, asset: asset(2, Blockchain.ARBITRUM, { buyable: true, sellable: true }) },
      ],
    };

    expect(shownChainsFor(token, 'sell', [Blockchain.BITCOIN])).toEqual([]);
  });

  it('prefers structured API error codes over server messages', () => {
    const result = mapThrownError(t, new ApiException(400, 'unrelated text', 'EMAIL_REQUIRED'));

    expect(result).toEqual({ kind: 'email', message: 'verifyEmailNote' });
  });

  it('separates a combination problem from an account restriction (no asset swap fixes the latter)', () => {
    const format = (n: number) => String(n);

    // Real combination errors (api QuoteError) — a different asset/currency/payment method helps.
    expect(mapTransactionError(t, 'AssetUnsupported' as TransactionError, 0, 0, format)).toBe('comboUnavailable');
    expect(mapTransactionError(t, 'CurrencyUnsupported' as TransactionError, 0, 0, format)).toBe('comboUnavailable');

    // Country/nationality restrictions are account properties (transaction-helper.ts checks
    // country.dfxEnable / nationality.bankEnable|cryptoEnable) — no combination change helps, so
    // these must map to the honest account message, not "pick another asset".
    expect(mapTransactionError(t, 'CountryNotAllowed' as TransactionError, 0, 0, format)).toBe('accountRestricted');
    expect(mapTransactionError(t, 'NationalityNotAllowed' as TransactionError, 0, 0, format)).toBe('accountRestricted');

    // Pre-SDK-enum email-gate codes route to the same message as TransactionError.EMAIL_REQUIRED.
    expect(mapTransactionError(t, 'PrimaryEmailRequired' as TransactionError, 0, 0, format)).toBe('verifyEmailNote');
    expect(mapTransactionError(t, 'PrimaryEmailNotConfirmed' as TransactionError, 0, 0, format)).toBe(
      'verifyEmailNote',
    );
  });

  it('never exposes an unmapped server error to the user', () => {
    const secret = 'database connection failed at internal-host-17';
    const result = mapThrownError(t, new ApiException(500, secret));

    expect(result).toEqual({ kind: 'generic', message: 'genErr' });
    expect(result.message).not.toContain(secret);
  });

  it('does not interpret an English thousands-formatted amount as a decimal', () => {
    expect(parseAmt('1,000', 'en')).toBeNull();
    expect(parseAmt('1000.50', 'en')).toBe(1000.5);
    expect(parseAmt('12,50', 'de')).toBe(12.5);
  });

  it('keeps the English dictionary as the compile-time translation key set', () => {
    const validKey: TranslationKey = 'buy';
    // @ts-expect-error unknown translation keys must fail the TypeScript build
    const invalidKey: TranslationKey = 'definitelyNotATranslation';

    expect(validKey).toBe('buy');
    expect(invalidKey).toBe('definitelyNotATranslation');
  });

  it('clears pre-migration WalletConnect localStorage keys without touching the DFX login', () => {
    // localStorage is only ever the *pre-migration* layer: @walletconnect/keyvaluestorage moves
    // these keys into IndexedDB on first use and stops writing here afterwards (see storage.ts's
    // doc comment). The IndexedDB layer that actually matters on a shared browser is covered by
    // walletconnect-persistence.test.ts, not here.
    window.localStorage.clear();
    window.localStorage.setItem('wc@2:client:session', 'session');
    window.localStorage.setItem('@walletconnect/core', 'core');
    window.localStorage.setItem('dfx.authenticationToken', 'token');

    clearWalletConnectStorage();

    expect(window.localStorage.getItem('wc@2:client:session')).toBeNull();
    expect(window.localStorage.getItem('@walletconnect/core')).toBeNull();
    expect(window.localStorage.getItem('dfx.authenticationToken')).toBe('token');
  });

  it('sends the full data URL for a KYC document upload, not the bare base64 payload', async () => {
    const file = new File(['%PDF-1.4 fake contents'], 'passport.pdf', { type: 'application/pdf' });

    const result = await readFileAsBase64(file);

    // api/src/shared/utils/util.ts Util.fromBase64 splits on ";base64," to recover both the
    // content type and the payload — a bare base64 string (no "data:" prefix, no ";base64,"
    // marker) makes that split fail and crashes with Buffer.from(undefined, 'base64') (a 500).
    expect(result.file).toMatch(/^data:/);
    expect(result.file).toContain(';base64,');
    expect(result.fileName).toBe('passport.pdf');
  });

  it('builds environment-aware app links and rejects insecure remote origins', () => {
    const previousOrigin = process.env.REACT_APP_PUBLIC_URL;
    process.env.REACT_APP_PUBLIC_URL = 'https://dev.app.dfx.swiss';

    expect(appUrl('/kyc?code=abc')).toBe('https://dev.app.dfx.swiss/kyc?code=abc');
    expect(appUrl('//evil.example/kyc')).toBeUndefined();
    expect(isSafeAppUrl('http://localhost:3001/kyc')).toBe(true);
    expect(isSafeAppUrl('http://app.dfx.swiss/kyc')).toBe(false);

    if (previousOrigin === undefined) delete process.env.REACT_APP_PUBLIC_URL;
    else process.env.REACT_APP_PUBLIC_URL = previousOrigin;
  });

  it('routes structured KYC recovery states without parsing server messages', () => {
    expect(apiStatusCode({ statusCode: 0 })).toBe(0);
    expect(isTfaRequiredError({ code: 'TFA_REQUIRED' })).toBe(true);
    expect(isTfaAlreadyEnrolledError({ statusCode: 409, message: 'beliebiger Text' })).toBe(true);
    expect(kycHandoffFromError({ statusCode: 401, switchToCode: 'next-code' })).toEqual({
      kind: 'switch',
      code: 'next-code',
    });
    expect(kycHandoffFromError({ statusCode: 409 })).toEqual({ kind: 'conflict' });
  });

  it('does not enable support polling for an empty thread', () => {
    const emptyIssue = { uid: 'issue-1', messages: [] } as unknown as SupportIssue;
    const populatedIssue = {
      ...emptyIssue,
      messages: [{ id: 1, created: new Date(), message: 'hello' } as SupportMessage],
    };

    expect(shouldSyncSupportIssue('issue-1', emptyIssue)).toBe(false);
    expect(shouldSyncSupportIssue('issue-1', populatedIssue)).toBe(true);
    expect(shouldSyncSupportIssue('another-issue', populatedIssue)).toBe(false);
  });

  it('resolves a wallet icon by its own identity before a shared walletType', () => {
    // The Cardano entry authenticates via the CLI contract (walletType CLI) and is listed
    // before the CLI entry, so a single fuzzy pass answered every CLI wallet with the Cardano
    // logo — DFX Wallet showed the ADA mark in the wallet bar and the switcher.
    const cli = walletIconFor('CLI');
    const cardano = walletIconFor('Cardano');

    expect(cli).toBeDefined();
    expect(cardano).toBeDefined();
    expect(cli).not.toBe(cardano);
    // Fuzzy matching still resolves vendor variants, and unknown wallets stay undefined so the
    // caller can fall back to its own glyph.
    expect(walletIconFor('MetaMask Mobile')).toBe(walletIconFor('MetaMask'));
    expect(walletIconFor('Some Partner Wallet')).toBeUndefined();
  });

  it('matches only the optimistic support message created by the active send attempt', () => {
    const oldMessage = { id: 1, created: new Date(1), message: 'retry me' } as SupportMessage;
    const optimisticMessage = { id: -1, created: new Date(2_000), message: 'retry me' } as SupportMessage;

    expect(
      findSendCandidate([oldMessage, optimisticMessage], {
        issueUid: 'issue-1',
        beforeIds: [1],
        text: 'retry me',
        clearComposer: false,
        startedAt: 2_000,
        replacesMessageId: 1,
      }),
    ).toBe(optimisticMessage);
  });
});
