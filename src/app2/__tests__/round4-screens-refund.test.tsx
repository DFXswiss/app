// Round-4 / G1: crypto refunds never fall back to the connected session wallet.
// Without a server-supplied refundTarget the panel offers userAddresses filtered
// to the tx input blockchain (main-app behaviour); an empty filter stays fail-closed.

const mockGetTransactionRefund = jest.fn();
const mockSetTransactionRefundTarget = jest.fn();
const mockUserAddresses: Array<{ address: string; blockchains: string[]; label?: string }> = [];

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    MONERO: 'Monero',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    LIGHTNING: 'Lightning',
  },
  TransactionType: { BUY: 'Buy', SELL: 'Sell', SWAP: 'Swap' },
  useTransaction: () => ({
    getTransactionRefund: mockGetTransactionRefund,
    setTransactionRefundTarget: mockSetTransactionRefundTarget,
  }),
  useCountry: () => ({ getCountries: jest.fn().mockResolvedValue([]) }),
  useUser: () => ({ getProfile: jest.fn().mockResolvedValue({}) }),
  useUserContext: () => ({ userAddresses: mockUserAddresses }),
}));

jest.mock('../wallets/session', () => ({
  // Deliberately a non-empty session address — the bug was using this as refundTarget.
  useWalletSession: () => ({ isLoggedIn: true, address: '0xSessionWalletMustNeverBeSent' }),
}));

jest.mock('../components/ui', () => ({
  LoadingRow: () => null,
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DetailTransaction } from '@dfx.swiss/react';
import { RefundPanel } from '../screens/transactions';
import { LanguageProvider } from '../i18n';

const SESSION = '0xSessionWalletMustNeverBeSent';

function sellTx(overrides: Partial<DetailTransaction> = {}): DetailTransaction {
  return {
    id: 42,
    uid: 'tx-42',
    type: 'Sell',
    state: 'Failed',
    inputBlockchain: 'Bitcoin',
    inputAmount: 0.001,
    inputAsset: 'BTC',
    date: new Date(),
    reason: undefined,
    ...overrides,
  } as unknown as DetailTransaction;
}

function renderPanel(tx: DetailTransaction = sellTx()) {
  return render(
    <LanguageProvider>
      <RefundPanel tx={tx} onClose={() => undefined} />
    </LanguageProvider>,
  );
}

describe('RefundPanel crypto target (G1 — no session-address fallback)', () => {
  beforeEach(() => {
    mockGetTransactionRefund.mockReset();
    mockSetTransactionRefundTarget.mockReset();
    mockSetTransactionRefundTarget.mockResolvedValue(undefined);
    mockUserAddresses.length = 0;
  });

  it('locks and submits the server-supplied refundTarget without offering a picker', async () => {
    mockGetTransactionRefund.mockResolvedValue({
      refundTarget: 'bc1qserver-supplied',
      refundAmount: 0.0009,
      refundAsset: { name: 'BTC' },
    });

    renderPanel();
    await waitFor(() => expect(screen.getByDisplayValue('bc1qserver-supplied')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetTransactionRefundTarget).toHaveBeenCalledTimes(1));
    expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, { refundTarget: 'bc1qserver-supplied' });
    const body = mockSetTransactionRefundTarget.mock.calls[0][1] as { refundTarget: string };
    expect(body.refundTarget).not.toBe(SESSION);
  });

  it('shows a userAddresses picker when the API omitted refundTarget (no session address)', async () => {
    mockGetTransactionRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 0.0009,
      refundAsset: { name: 'BTC' },
    });
    mockUserAddresses.push(
      { address: 'bc1qaccount-one', blockchains: ['Bitcoin'], label: 'Cold' },
      { address: 'bc1qaccount-two', blockchains: ['Bitcoin'] },
      { address: '0xeth-only', blockchains: ['Ethereum'] },
    );

    renderPanel();
    const select = await screen.findByRole('combobox', { name: /refund to|rückerstattung an/i });
    // Only Bitcoin addresses from the account — not the session wallet, not Ethereum.
    const options = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('bc1qaccount-one');
    expect(options).toContain('bc1qaccount-two');
    expect(options).not.toContain(SESSION);
    expect(options).not.toContain('0xeth-only');
    // Fail-closed banner must not replace the picker when addresses exist.
    expect(screen.queryByText(/couldn't be determined|konnte nicht automatisch/i)).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'bc1qaccount-two' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetTransactionRefundTarget).toHaveBeenCalledTimes(1));
    expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, { refundTarget: 'bc1qaccount-two' });
    expect(mockSetTransactionRefundTarget.mock.calls[0][1].refundTarget).not.toBe(SESSION);
  });

  it('pre-selects the sole matching address and submits it (never the session wallet)', async () => {
    mockGetTransactionRefund.mockResolvedValue({
      refundTarget: null,
      refundAmount: 0.0009,
      refundAsset: { name: 'BTC' },
    });
    mockUserAddresses.push({ address: 'bc1qonly-match', blockchains: ['Bitcoin'] });

    renderPanel();
    const select = await screen.findByRole('combobox', { name: /refund to|rückerstattung an/i });
    expect((select as HTMLSelectElement).value).toBe('bc1qonly-match');

    const confirm = screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mockSetTransactionRefundTarget).toHaveBeenCalledTimes(1));
    expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, { refundTarget: 'bc1qonly-match' });
    expect(mockSetTransactionRefundTarget.mock.calls[0][1].refundTarget).not.toBe(SESSION);
  });

  it('fail-closes only when no account address matches the input blockchain', async () => {
    mockGetTransactionRefund.mockResolvedValue({
      refundTarget: undefined,
      refundAmount: 0.0009,
      refundAsset: { name: 'BTC' },
    });
    // Address on a different chain — filter yields empty.
    mockUserAddresses.push({ address: '0xeth-only', blockchains: ['Ethereum'] });

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/couldn't be determined|konnte nicht automatisch/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mockSetTransactionRefundTarget).not.toHaveBeenCalled();
  });
});
