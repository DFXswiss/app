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

import {
  ApiException,
  Blockchain,
  FiatPaymentMethod,
  type Asset,
  type Fiat,
} from '@dfx.swiss/react';
import type { TranslationKey } from '../i18n';
import { paymentMethodsFor } from '../components/pickers/PaymentMethodPicker';
import { currenciesForBuy, currenciesForSell, hasSellQuoteInputs } from '../screens/trade/capabilities';
import { shownChainsFor } from '../screens/trade/asset-pool';
import { mapThrownError } from '../screens/trade/errors';
import type { TradeAsset } from '../screens/trade/types';
import { normalizeInviteCode } from '../wallets/invite';

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
    expect(normalizeInviteCode('  ab-c12  ')).toBe('AB-C12');
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
});
