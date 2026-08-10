// Payment-sheet regressions for the trade path:
//  - swap deposit amount must prefer the settled API amount
//  - PrimaryEmail* validity/thrown errors open the inline e-mail gate, not generic setup
//  - a 200 without depositAddress/paymentRequest fails closed into the setup gate

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
  ApiException: class ApiException extends Error {
    statusCode: number;
    code?: string;
    constructor(httpStatus: number, errorMessage: string, errorCode?: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
      this.code = errorCode;
    }
  },
  useUser: () => ({ updateMail: jest.fn() }),
}));

import { render, screen } from '@testing-library/react';
import { ApiException, TransactionError, type Sell, type Swap } from '@dfx.swiss/react';
import { PaymentSheet } from '../screens/trade/PaymentSheet';
import { isEmailGateError, mapThrownError } from '../screens/trade/errors';
import { ToastProvider } from '../components/ui';
import { LanguageProvider } from '../i18n';
import type { TranslationKey } from '../i18n';

const t = (key: TranslationKey) => key;

const sourceAsset = {
  id: 1,
  name: 'USDT',
  description: 'Tether',
  blockchain: 'Ethereum',
  buyable: true,
  sellable: true,
} as Swap['sourceAsset'];

function renderSwapSheet(swap: Swap | null, amount = 100, rawError: unknown = null) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <PaymentSheet
          open
          onClose={() => undefined}
          onDone={() => undefined}
          mode="swap"
          loading={false}
          rawError={rawError}
          buy={null}
          sell={null}
          swap={swap}
          payAssetCode="USDT"
          receiveAssetCode="USDC"
          amount={amount}
          onRetry={() => undefined}
          onReconnect={() => undefined}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
}

function renderSellSheet(sell: Sell | null) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <PaymentSheet
          open
          onClose={() => undefined}
          onDone={() => undefined}
          mode="sell"
          loading={false}
          rawError={null}
          buy={null}
          sell={sell}
          swap={null}
          payAssetCode="USDT"
          receiveAssetCode=""
          amount={100}
          onRetry={() => undefined}
          onReconnect={() => undefined}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('swap deposit amount', () => {
  it('prefers the settled swap.amount over the panel input', () => {
    const swap = {
      isValid: true,
      amount: 99.5,
      depositAddress: '0xswap-deposit',
      paymentRequest: '',
      sourceAsset,
      estimatedAmount: 98,
      fees: { total: 1 },
    } as unknown as Swap;

    renderSwapSheet(swap, 100);
    // Panel typed 100 (still in the summary "You pay" row); the deposit box must show the
    // API-settled figure. `getAllByText` would also match summary noise — pin the paybox body.
    const paybox = document.querySelector('.paybox');
    expect(paybox).toBeTruthy();
    expect(paybox?.textContent).toMatch(/99[.,]5/);
    // Without the fix the deposit amount is the raw panel `amount` (100) only.
    expect(paybox?.textContent).not.toMatch(/(?:^|[^\d.])100(?:\.0+)?\s*USDT/);
  });
});

describe('email gate codes', () => {
  it('treats PrimaryEmail* as e-mail gate errors', () => {
    expect(isEmailGateError(TransactionError.EMAIL_REQUIRED)).toBe(true);
    expect(isEmailGateError('PrimaryEmailRequired')).toBe(true);
    expect(isEmailGateError('PrimaryEmailNotConfirmed')).toBe(true);
    expect(isEmailGateError('primaryemailrequired')).toBe(true);
    expect(isEmailGateError('primaryemailnotconfirmed')).toBe(true);
    expect(isEmailGateError(TransactionError.LIMIT_EXCEEDED)).toBe(false);
  });

  it('maps thrown PrimaryEmail* codes to kind email with verifyEmailNote', () => {
    expect(mapThrownError(t, new ApiException(400, 'x', 'PrimaryEmailRequired'))).toEqual({
      kind: 'email',
      message: 'verifyEmailNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'PrimaryEmailNotConfirmed'))).toEqual({
      kind: 'email',
      message: 'verifyEmailNote',
    });
    expect(mapThrownError(t, new ApiException(400, 'x', 'PRIMARY_EMAIL_REQUIRED'))).toEqual({
      kind: 'email',
      message: 'verifyEmailNote',
    });
  });

  it('opens the inline e-mail field for a PrimaryEmailRequired validity error', () => {
    const swap = {
      isValid: false,
      error: 'PrimaryEmailRequired',
      amount: 100,
      sourceAsset,
      estimatedAmount: 0,
      minVolume: 0,
      maxVolume: 0,
      fees: { total: 0 },
    } as unknown as Swap;

    renderSwapSheet(swap);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    // Generic setup uses an external "finish on DFX" link path — e-mail gate must not.
    expect(screen.queryByText(/setupTitle/i)).not.toBeInTheDocument();
  });
});

describe('missing deposit details', () => {
  it('fails closed for a valid sell response without depositAddress or paymentRequest', () => {
    const sell = {
      isValid: true,
      amount: 100,
      estimatedAmount: 86,
      fees: { total: 1 },
      blockchain: 'Ethereum',
      // deliberately no depositAddress / paymentRequest
    } as unknown as Sell;

    const { queryByText, getByText } = renderSellSheet(sell);
    // Deposit box would print "—" for a missing address; the gate must win instead.
    expect(queryByText('—')).not.toBeInTheDocument();
    expect(document.querySelector('.emailgate')).toBeTruthy();
    // Own gate — not the account-setup path (no "One more step" / external Finish-on-DFX link).
    expect(queryByText('One more step')).not.toBeInTheDocument();
    expect(getByText(/Payment details are missing/i)).toBeInTheDocument();
    expect(queryByText(/Finish setup on app\.dfx\.swiss/i)).not.toBeInTheDocument();
    expect(document.querySelector('a[href]')).toBeNull();
    expect(document.querySelector('.paybox')).toBeNull();
  });

  it('fails closed for a valid swap response without deposit details', () => {
    const swap = {
      isValid: true,
      amount: 100,
      sourceAsset,
      estimatedAmount: 99,
      fees: { total: 1 },
    } as unknown as Swap;

    const { queryByText, getByText } = renderSwapSheet(swap);
    expect(queryByText('—')).not.toBeInTheDocument();
    expect(document.querySelector('.emailgate')).toBeTruthy();
    expect(queryByText('One more step')).not.toBeInTheDocument();
    expect(getByText(/Payment details are missing/i)).toBeInTheDocument();
    expect(queryByText(/Finish setup on app\.dfx\.swiss/i)).not.toBeInTheDocument();
    expect(document.querySelector('.paybox')).toBeNull();
  });

  it('still shows deposit details when depositAddress is present', () => {
    const sell = {
      isValid: true,
      amount: 100,
      estimatedAmount: 86,
      fees: { total: 1 },
      blockchain: 'Ethereum',
      depositAddress: '0xreal-deposit',
    } as unknown as Sell;

    renderSellSheet(sell);
    expect(screen.getByText('0xreal-deposit')).toBeInTheDocument();
  });
});
