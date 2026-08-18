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
  useUser: () => ({ updateMail: mockUpdateMail }),
}));

const mockUpdateMail = jest.fn();

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException, TransactionError, type Buy, type Sell, type Swap } from '@dfx.swiss/react';
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

function renderBuySheet(buy: Buy | null) {
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
          receiveAssetCode="BTC"
          amount={100}
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

  it('fails closed for a valid buy response without iban or paymentRequest', () => {
    const buy = {
      isValid: true,
      amount: 100,
      estimatedAmount: 0.002,
      fees: { total: 1 },
      currency: { name: 'EUR' },
      // deliberately no iban / paymentRequest
    } as unknown as Buy;

    const { queryByText, getByText } = renderBuySheet(buy);
    expect(queryByText('—')).not.toBeInTheDocument();
    expect(document.querySelector('.emailgate')).toBeTruthy();
    expect(queryByText('One more step')).not.toBeInTheDocument();
    expect(getByText(/Payment details are missing/i)).toBeInTheDocument();
    expect(document.querySelector('.paybox')).toBeNull();
  });

  it('still shows buy details when only the IBAN is present', () => {
    const buy = {
      isValid: true,
      amount: 100,
      estimatedAmount: 0.002,
      fees: { total: 1 },
      currency: { name: 'EUR' },
      iban: 'DE89370400440532013000',
    } as unknown as Buy;

    renderBuySheet(buy);
    expect(document.querySelector('.emailgate')).toBeNull();
    expect(document.querySelector('.paybox')).toBeTruthy();
    expect(document.body.textContent).toMatch(/DE89370400440532013000/);
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

describe('payment sheet actions', () => {
  beforeEach(() => {
    mockUpdateMail.mockReset();
    mockUpdateMail.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('copies a row, switches to the QR tab and sends an e-mail link', async () => {
    const buy = {
      isValid: true,
      amount: 100,
      estimatedAmount: 0.002,
      fees: { total: 1 },
      currency: { name: 'EUR' },
      iban: 'DE89370400440532013000',
      name: 'DFX',
      street: 'Street',
      number: '1',
      zip: '8000',
      city: 'Zurich',
      country: 'CH',
      paymentRequest: 'payload',
    } as unknown as Buy;
    renderBuySheet(buy);
    fireEvent.click(screen.getByRole('button', { name: /beneficiary|begünstigter|beneficiario|bénéficiaire/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /qr/i }));
    expect(screen.getByRole('tab', { name: /qr/i })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /details|details|dettagli|détails/i }));

    const gated = {
      isValid: false,
      error: TransactionError.EMAIL_REQUIRED,
      amount: 100,
      sourceAsset,
      estimatedAmount: 0,
      minVolume: 0,
      maxVolume: 0,
      fees: { total: 0 },
    } as unknown as Swap;
    renderSwapSheet(gated);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /send link/i }));
    expect(mockUpdateMail).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.c' } });
    fireEvent.keyDown(screen.getByLabelText(/email address/i), { key: 'Enter' });
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@b.c'));
  });

  it('toasts when the e-mail link cannot be sent', async () => {
    mockUpdateMail.mockRejectedValueOnce(new Error('down'));
    renderSwapSheet({
      isValid: false,
      error: TransactionError.EMAIL_REQUIRED,
      amount: 100,
      sourceAsset,
      estimatedAmount: 0,
      minVolume: 0,
      maxVolume: 0,
      fees: { total: 0 },
    } as unknown as Swap);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'c@d.e' } });
    fireEvent.click(screen.getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('c@d.e'));
  });

  it('renders sell and swap boxes, amount/session/setup gates and a confirmed mail retry', async () => {
    const sell = renderSellSheet({
      isValid: true,
      amount: 10,
      estimatedAmount: 9,
      feesTarget: { total: 1 },
      blockchain: 'Ethereum',
      depositAddress: '0xsell',
      paymentRequest: 'payreq',
      beneficiary: { iban: 'CH93' },
    } as unknown as Sell);
    expect(screen.getByText('0xsell')).toBeInTheDocument();
    expect(screen.getByText('CH93')).toBeInTheDocument();
    sell.unmount();

    const swap = renderSwapSheet({
      isValid: true,
      amount: 5,
      estimatedAmount: 4,
      fees: { total: 1 },
      sourceAsset,
      depositAddress: '0xswap',
      paymentRequest: 'swapreq',
    } as unknown as Swap);
    expect(screen.getByText('0xswap')).toBeInTheDocument();
    swap.unmount();

    const loading = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="buy"
            loading
            rawError={null}
            buy={null}
            sell={null}
            swap={null}
            payAssetCode=""
            receiveAssetCode="BTC"
            receiveBlockchain={'Bitcoin' as never}
            amount={1}
            sessionAddress="0xabc"
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    loading.unmount();

    const onRetry = jest.fn();
    const onReconnect = jest.fn();
    const onClose = jest.fn();
    const session = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={onClose}
            onDone={jest.fn()}
            mode="buy"
            loading={false}
            rawError={new ApiException(401, 'gone')}
            buy={null}
            sell={null}
            swap={null}
            payAssetCode=""
            receiveAssetCode="BTC"
            amount={1}
            onRetry={onRetry}
            onReconnect={onReconnect}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /connect|verbinden|connetti|connecter/i }));
    expect(onReconnect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    session.unmount();

    const generic = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="sell"
            loading={false}
            rawError={new ApiException(500, 'down')}
            buy={null}
            sell={null}
            swap={null}
            payAssetCode="USDT"
            receiveAssetCode=""
            amount={1}
            onRetry={onRetry}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(onRetry).toHaveBeenCalled();
    generic.unmount();

    const amount = renderBuySheet({
      isValid: false,
      error: TransactionError.AMOUNT_TOO_LOW,
      minVolume: 10,
      maxVolume: 100,
      amount: 1,
      estimatedAmount: 0,
      fees: { total: 0 },
      currency: { name: 'EUR' },
    } as unknown as Buy);
    expect(screen.getByText('Amount')).toBeInTheDocument();
    amount.unmount();

    const setup = renderBuySheet({
      isValid: false,
      amount: 1,
      estimatedAmount: 0,
      minVolume: 0,
      maxVolume: 0,
      fees: { total: 0 },
    } as unknown as Buy);
    expect(screen.getByText(/one more step|noch ein schritt|un altro passo|une étape/i)).toBeInTheDocument();
    setup.unmount();

    mockUpdateMail.mockResolvedValueOnce(undefined);
    renderSwapSheet({
      isValid: false,
      error: TransactionError.EMAIL_REQUIRED,
      amount: 100,
      sourceAsset,
      estimatedAmount: 0,
      minVolume: 0,
      maxVolume: 0,
      fees: { total: 0 },
    } as unknown as Swap);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'ok@x.y' } });
    fireEvent.click(screen.getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('ok@x.y'));
    fireEvent.click(await screen.findByRole('button', { name: /confirmed|bestätigt|confermato|confirmé/i }));
  });

  it('shows buy/sell/swap rows with a session address and resets when reopened', () => {
    const buy = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="buy"
            loading={false}
            rawError={null}
            buy={
              {
                isValid: true,
                amount: 10,
                estimatedAmount: 0.001,
                fees: { total: 1 },
                currency: { name: 'EUR' },
                iban: 'DE89',
              } as unknown as Buy
            }
            sell={null}
            swap={null}
            payAssetCode=""
            receiveAssetCode="BTC"
            receiveBlockchain={'Bitcoin' as never}
            amount={10}
            sessionAddress="0xabc"
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    expect(screen.getByText('0xabc')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    buy.unmount();

    const closed = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open={false}
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="sell"
            loading={false}
            rawError={null}
            buy={null}
            sell={
              {
                isValid: true,
                amount: 8,
                estimatedAmount: 7,
                feesTarget: { total: 1 },
                blockchain: 'Ethereum',
                depositAddress: '0xclosed',
              } as unknown as Sell
            }
            swap={null}
            payAssetCode="USDT"
            receiveAssetCode=""
            amount={8}
            sessionAddress="0xfrom"
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    closed.unmount();

    render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="swap"
            loading={false}
            rawError={null}
            buy={null}
            sell={null}
            swap={
              {
                isValid: true,
                amount: 5,
                estimatedAmount: 4,
                fees: { total: 1 },
                sourceAsset,
                depositAddress: '0xswap2',
                paymentRequest: 'swap2',
              } as unknown as Swap
            }
            payAssetCode="USDT"
            receiveAssetCode="USDC"
            receiveBlockchain={'Arbitrum' as never}
            amount={5}
            sessionAddress="0xto"
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
  });

  it('copies a buy reference and toasts a clipboard failure', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('x')) } });
    renderBuySheet({
      isValid: true,
      amount: 100,
      estimatedAmount: 0.002,
      fees: { total: 1 },
      currency: { name: 'EUR' },
      iban: 'DE89',
      remittanceInfo: 'REF-1',
      paymentRequest: 'payload',
    } as unknown as Buy);
    fireEvent.click(screen.getByRole('button', { name: /reference|verwendungszweck|causale|référence/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('REF-1'));
  });

  it('falls back to the panel amount, a dash IBAN and an empty deposit address', async () => {
    renderBuySheet({
      isValid: true,
      estimatedAmount: 0.002,
      fees: { total: 1 },
      currency: { name: 'EUR' },
      paymentRequest: 'payload',
    } as unknown as Buy);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const sell = renderSellSheet({
      isValid: true,
      estimatedAmount: 9,
      feesTarget: { total: 1 },
      blockchain: 'Ethereum',
      depositAddress: '',
      paymentRequest: 'payreq',
    } as unknown as Sell);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    sell.unmount();

    renderSwapSheet({
      isValid: true,
      estimatedAmount: 4,
      fees: { total: 1 },
      sourceAsset,
      depositAddress: '0xswap',
    } as unknown as Swap);

    mockUpdateMail.mockResolvedValue(undefined);
    const email = render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="buy"
            loading={false}
            rawError={new ApiException(400, 'mail', 'PrimaryEmailRequired')}
            buy={null}
            sell={null}
            swap={null}
            payAssetCode=""
            receiveAssetCode="BTC"
            amount={10}
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.c' } });
    fireEvent.keyDown(screen.getByLabelText(/email address/i), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText(/email address/i), { key: 'Tab' });
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@b.c'));
    email.unmount();
  });

  it('omits the network row when no receive chain is set', () => {
    render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="buy"
            loading={false}
            rawError={null}
            buy={{ estimatedAmount: 1 } as never}
            sell={null}
            swap={null}
            payAssetCode="EUR"
            receiveAssetCode="BTC"
            receiveBlockchain={undefined}
            amount={100}
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    expect(screen.queryByText(/network|netzwerk|rete|réseau/i)).not.toBeInTheDocument();

    render(
      <LanguageProvider>
        <ToastProvider>
          <PaymentSheet
            open
            onClose={jest.fn()}
            onDone={jest.fn()}
            mode="swap"
            loading={false}
            rawError={null}
            buy={null}
            sell={null}
            swap={{ estimatedAmount: 1 } as never}
            payAssetCode="BTC"
            receiveAssetCode="ETH"
            amount={1}
            onRetry={jest.fn()}
            onReconnect={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
  });
});
