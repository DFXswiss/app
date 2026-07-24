// Two guards that decide whether a number the user could act on is shown at all. Both are on
// the money path, so they are pinned here instead of being re-derived by reading the screen.

// The SDK ships ESM, so it is mocked rather than required — with the enum values copied
// verbatim from @dfx.swiss/core (definitions/{blockchain,transaction}.js), so the assertions
// still run against the strings the API actually sends.
jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    CARDANO: 'Cardano',
    RAILGUN: 'Railgun',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    DEFICHAIN: 'DeFiChain',
  },
  TransactionError: {
    AMOUNT_TOO_LOW: 'AmountTooLow',
    AMOUNT_TOO_HIGH: 'AmountTooHigh',
    LIMIT_EXCEEDED: 'LimitExceeded',
    EMAIL_REQUIRED: 'EmailRequired',
  },
  useUser: () => ({ updateMail: jest.fn() }),
}));

import { render } from '@testing-library/react';
import { TransactionError, type Buy } from '@dfx.swiss/react';
import { hasNoDisplayableEstimate } from '../screens/trade/capabilities';
import { PaymentSheet } from '../screens/trade/PaymentSheet';
import { ToastProvider } from '../components/ui';
import { LanguageProvider } from '../i18n';

describe('App2 receive-panel validity guard', () => {
  it.each([
    ['a valid quote prints its estimate', { isValid: true, estimatedAmount: 111 }, false],
    ['a quote without validity info prints its estimate', { estimatedAmount: 111 }, false],
    [
      'an amount rejection prints no number, however plausible the estimate looks',
      { isValid: false, error: TransactionError.AMOUNT_TOO_LOW, estimatedAmount: 0.5 },
      true,
    ],
    [
      'an all-zero error quote prints no number',
      { isValid: false, error: 'AssetUnsupported' as TransactionError, estimatedAmount: 0 },
      true,
    ],
    [
      'an invalid quote with a real conversion keeps it (the reason goes in the meta line)',
      { isValid: false, error: TransactionError.LIMIT_EXCEEDED, estimatedAmount: 1234.56 },
      false,
    ],
    ['an invalid quote with no estimate at all prints no number', { isValid: false }, true],
  ])('%s', (_name, quote, expected) => {
    expect(hasNoDisplayableEstimate(quote)).toBe(expected);
  });
});

const validBuy = {
  iban: 'CH93 0076 2011 6238 5295 7',
  remittanceInfo: 'REF-123456',
  estimatedAmount: 111.53,
  amount: 100,
  fees: { total: 1.99 },
  isValid: true,
} as unknown as Buy;

function renderSheet(buy: Buy) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <PaymentSheet
          open
          onClose={() => undefined}
          onDone={() => undefined}
          mode="buy"
          loading={false}
          rawError={null}
          buy={buy}
          sell={null}
          swap={null}
          payAssetCode=""
          receiveAssetCode="USDT"
          amount={100}
          onRetry={() => undefined}
          onReconnect={() => undefined}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('App2 payment sheet gate', () => {
  it('shows the payment details for a valid quote', () => {
    const { getByText } = renderSheet(validBuy);
    expect(getByText(/CH93/)).toBeInTheDocument();
    expect(getByText(/REF-123456/)).toBeInTheDocument();
  });

  it('never renders payment details for a quote the API marked invalid — even without a reason', () => {
    // `isValid: false` with no `error` cannot happen today (the API always sets one). The sheet
    // must still fail closed rather than hand out an IBAN and a payment reference.
    const { queryByText } = renderSheet({ ...validBuy, isValid: false } as Buy);
    expect(queryByText(/CH93/)).not.toBeInTheDocument();
    expect(queryByText(/REF-123456/)).not.toBeInTheDocument();
  });
});
