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
import { currenciesForBuy, currenciesForSell, hasSellQuoteInputs } from '../screens/trade/capabilities';
import { shownChainsFor } from '../screens/trade/asset-pool';
import { mapThrownError } from '../screens/trade/errors';
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
import { normalizeInviteCode } from '../wallets/invite';
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

function asset(id: number, blockchain: Blockchain, flags: { buyable: boolean; sellable: boolean }): Asset {
  return {
    id,
    name: 'USDC',
    description: 'USD Coin',
    blockchain,
    ...flags,
  } as unknown as Asset;
}

describe('App2 review regressions', () => {
  const t = (key: TranslationKey, _vars?: Record<string, string | number>) => key;

  it('uses DFX sellable fiat for user buys and DFX buyable fiat for user sells', () => {
    expect(currenciesForBuy([eur, chf])).toEqual([chf]);
    expect(currenciesForSell([eur, chf])).toEqual([eur]);
  });

  it('does not request a sell quote until a non-empty IBAN is present', () => {
    expect(hasSellQuoteInputs(1, 2, 100, undefined)).toBe(false);
    expect(hasSellQuoteInputs(1, 2, 100, '   ')).toBe(false);
    expect(hasSellQuoteInputs(1, 2, 100, 'CH9300762011623852957')).toBe(true);
  });

  it('offers only payment methods accepted by the API', () => {
    expect(paymentMethodsFor(chf).map(({ id }) => id)).toEqual([FiatPaymentMethod.BANK]);
  });

  it('passes a canonical invite code to both login paths', () => {
    // Case-preserving like the static preview's REF_RE (/^[A-Za-z0-9-]{4,14}$/); only trims.
    expect(normalizeInviteCode('  ab-c12  ')).toBe('ab-c12');
    expect(normalizeInviteCode('   ')).toBeUndefined();
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

  it('clears persisted WalletConnect sessions without touching the DFX login', () => {
    window.localStorage.clear();
    window.localStorage.setItem('wc@2:client:session', 'session');
    window.localStorage.setItem('@walletconnect/core', 'core');
    window.localStorage.setItem('dfx.authenticationToken', 'token');

    clearWalletConnectStorage();

    expect(window.localStorage.getItem('wc@2:client:session')).toBeNull();
    expect(window.localStorage.getItem('@walletconnect/core')).toBeNull();
    expect(window.localStorage.getItem('dfx.authenticationToken')).toBe('token');
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
