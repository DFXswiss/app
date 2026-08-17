const mockSession = { isLoggedIn: false, address: undefined as string | undefined };
const mockGetDetail = jest.fn();
const mockGetTx = jest.fn();
const mockGetUnassigned = jest.fn();
const mockGetCsv = jest.fn();
const mockGetHistory = jest.fn();
const mockGetTargets = jest.fn();
const mockSetTarget = jest.fn();
const mockGetRefund = jest.fn();
const mockSetRefund = jest.fn();
const mockNavigate = jest.fn();
const mockGetProfile = jest.fn();
const mockGetCountries = jest.fn();
const mockUserAddresses: Array<{ address: string; blockchains: string[]; label?: string }> = [];
const mockUserCtx = { userAddresses: mockUserAddresses };

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  TransactionType: { BUY: 'Buy', SELL: 'Sell', SWAP: 'Swap' },
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    DEFICHAIN: 'DeFiChain',
    LIGHTNING: 'Lightning',
  },
  useUserContext: () => ({ user: undefined, userAddresses: mockUserCtx.userAddresses }),
  useAuthContext: () => ({ session: undefined }),
  useCountry: () => ({
    getCountries: mockGetCountries,
  }),
  useUser: () => ({ getProfile: mockGetProfile }),
  useTransaction: () => ({
    getTransactions: mockGetTx,
    getDetailTransactions: mockGetDetail,
    getUnassignedTransactions: mockGetUnassigned,
    getTransactionTargets: mockGetTargets,
    setTransactionTarget: mockSetTarget,
    getTransactionCsv: mockGetCsv,
    getTransactionHistory: mockGetHistory,
    getTransactionRefund: mockGetRefund,
    setTransactionRefundTarget: mockSetRefund,
  }),
  ExportType: { COMPACT: 'Compact', COIN_TRACKING: 'CoinTracking' },
  ExportFormat: { CSV: 'Csv' },
  SupportIssueType: { TRANSACTION_ISSUE: 'TransactionIssue' },
  SupportIssueReason: { TRANSACTION_MISSING: 'TransactionMissing', FUNDS_NOT_RECEIVED: 'FundsNotReceived' },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TransactionsScreen, { RefundPanel, resolveCryptoRefundTarget } from '../screens/transactions';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderTx() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <TransactionsScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

function tx(partial: Record<string, unknown>) {
  return {
    id: 1,
    type: 'Buy',
    state: 'Completed',
    inputAmount: 100,
    inputAsset: 'CHF',
    outputAmount: 0.002,
    outputAsset: 'BTC',
    date: '2026-01-02T10:00:00Z',
    uid: 'tx-1',
    ...partial,
  };
}

describe('resolveCryptoRefundTarget', () => {
  it('treats null, blank and real targets distinctly', () => {
    expect(resolveCryptoRefundTarget(undefined)).toBeUndefined();
    expect(resolveCryptoRefundTarget(null)).toBeUndefined();
    expect(resolveCryptoRefundTarget('   ')).toBeUndefined();
    expect(resolveCryptoRefundTarget('bc1qabc')).toBe('bc1qabc');
  });
});

describe('TransactionsScreen', () => {
  beforeEach(() => {
    mockSession.isLoggedIn = false;
    mockSession.address = undefined;
    mockUserAddresses.length = 0;
    mockUserCtx.userAddresses = mockUserAddresses;
    mockNavigate.mockReset();
    mockGetDetail.mockReset();
    mockGetTx.mockReset();
    mockGetUnassigned.mockReset();
    mockGetCsv.mockReset();
    mockGetHistory.mockReset();
    mockGetTargets.mockReset();
    mockSetTarget.mockReset();
    mockGetRefund.mockReset();
    mockSetRefund.mockReset();
    mockGetProfile.mockReset();
    mockGetCountries.mockReset();
    mockGetDetail.mockResolvedValue([]);
    mockGetTx.mockResolvedValue([]);
    mockGetUnassigned.mockResolvedValue([]);
    mockGetCsv.mockResolvedValue('https://api.example/csv');
    mockGetHistory.mockResolvedValue('csv-body');
    mockGetTargets.mockResolvedValue([]);
    mockSetTarget.mockResolvedValue(undefined);
    mockGetRefund.mockResolvedValue({ refundTarget: '', refundAmount: 1, refundAsset: { name: 'EUR' } });
    mockSetRefund.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockGetCountries.mockResolvedValue([
      { id: 2, name: 'Germany', symbol: 'DE' },
      { id: 1, name: 'Switzerland', symbol: 'CH' },
    ]);
    jest.spyOn(window, 'open').mockImplementation(() => null);
    global.URL.createObjectURL = jest.fn(() => 'blob:csv');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    (window.open as jest.Mock | undefined)?.mockRestore?.();
  });

  it('asks a logged-out visitor to connect', () => {
    renderTx();
    expect(screen.getByRole('heading', { name: /transactions/i })).toBeInTheDocument();
  });

  it('shows the empty history copy when signed in', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabc';
    renderTx();
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it('falls back to getTransactions when the detail endpoint fails', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockRejectedValueOnce(new Error('detail-down'));
    mockGetTx.mockResolvedValueOnce([tx({ id: 9, type: 'Buy', outputAsset: 'ETH', outputAmount: 1 })]);
    renderTx();
    expect(await screen.findAllByText(/ETH/)).not.toHaveLength(0);
  });

  it('shows a retryable error when both history endpoints fail', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockRejectedValue(new Error('a'));
    mockGetTx.mockRejectedValue(new Error('b'));
    renderTx();
    expect(await screen.findByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
    mockGetDetail.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it('renders buy/sell/swap rows, an unknown type, refund and report actions', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabc';
    mockGetDetail.mockResolvedValue([
      tx({
        id: 1,
        type: 'Buy',
        state: 'Completed',
        inputAsset: 'CHF',
        outputAsset: 'BTC',
        uid: 'tx-buy',
        reference: 'REF-1',
      }),
      tx({
        id: 2,
        type: 'Sell',
        state: 'Failed',
        inputAmount: 0.1,
        inputAsset: 'ETH',
        outputAmount: 200,
        outputAsset: 'EUR',
        date: '2026-01-01T10:00:00Z',
        uid: 'tx-sell',
        inputBlockchain: 'Ethereum',
      }),
      tx({
        id: 3,
        type: 'Swap',
        state: 'Failed',
        inputAmount: 10,
        inputAsset: 'USDT',
        outputAmount: 10,
        outputAsset: 'USDC',
        date: '2025-12-31T10:00:00Z',
        uid: 'tx-swap',
      }),
      tx({
        id: 4,
        type: 'UnknownKind',
        state: 'Pending',
        inputAmount: 1,
        inputAsset: 'XMR',
        outputAmount: 1,
        outputAsset: 'XMR',
        uid: 'tx-unk',
      }),
    ]);
    renderTx();
    expect(await screen.findAllByText(/ETH/)).not.toHaveLength(0);
    expect(screen.getAllByText(/USDT/).length).toBeGreaterThan(0);
    expect(screen.getByText('UnknownKind')).toBeInTheDocument();

    const sell = screen.getAllByText(/ETH/)[0].closest('details') as HTMLElement;
    fireEvent.click(within(sell).getByText(/sell|verkauf|vendita|vente/i));
    expect(within(sell).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i })).toBeInTheDocument();
    fireEvent.click(within(sell).getByRole('button', { name: /report a problem|problem melden|segnala|signaler/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/support', expect.objectContaining({
      state: expect.objectContaining({
        supportPreset: expect.objectContaining({ transactionUid: 'tx-sell' }),
      }),
    }));
  });

  it('exports compact and CoinTracking CSV and reports a missing payment', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabc';
    renderTx();
    await screen.findByText(/no transactions yet/i);
    fireEvent.click(screen.getByRole('button', { name: /my transaction is missing|transaktion fehlt|transazione manca|transaction est manquante/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/support', expect.objectContaining({
      state: expect.objectContaining({
        supportPreset: expect.objectContaining({ reason: 'TransactionMissing' }),
      }),
    }));

    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /compact csv|kompakt-csv|csv compatto|csv compact/i }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://api.example/csv', '_blank', 'noopener,noreferrer'));

    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /cointracking/i }));
    await waitFor(() => expect(mockGetHistory).toHaveBeenCalled());
  });

  it('assigns an unmatched bank payment', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockResolvedValue([
      { id: 9, inputAmount: 250, inputAsset: 'CHF', date: '2026-01-03T10:00:00Z', uid: 'pay-9' },
    ]);
    mockGetTargets.mockResolvedValue([{ id: 44, asset: { name: 'BTC' }, address: 'bc1qassign' }]);
    mockSetTarget.mockResolvedValue(undefined);
    renderTx();
    fireEvent.click(await screen.findByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: /assign|zuordnen|assegna|attribuer/i }));
    await waitFor(() => expect(mockSetTarget).toHaveBeenCalledWith(9, 44));
  });

  it('reveals the next page of an already-loaded history', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue(
      Array.from({ length: 41 }, (_, i) =>
        tx({
          id: i + 1,
          uid: `tx-${i + 1}`,
          outputAsset: i === 0 ? 'XMR' : 'BTC',
          date: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        }),
      ),
    );
    renderTx();
    expect(await screen.findAllByText(/BTC/)).not.toHaveLength(0);
    expect(screen.queryByText(/XMR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /load more|mehr laden|carica altro|charger plus/i }));
    expect(screen.getAllByText(/XMR/).length).toBeGreaterThan(0);
  });

  it('opens a bank refund form and confirms it', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({
        id: 77,
        type: 'Buy',
        state: 'Failed',
        inputPaymentMethod: 'Bank',
        uid: 'tx-bank',
        inputAsset: 'EUR',
        outputAsset: 'BTC',
      }),
    ]);
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 90,
      refundAsset: { name: 'EUR' },
      fee: { dfx: 1, network: 0, bank: 2 },
      bankDetails: { iban: '', name: '', address: '', zip: '', city: '', country: 'CH' },
    });
    renderTx();
    const row = (await screen.findAllByText(/EUR/))[0];
    const details = row.closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    await screen.findByPlaceholderText('DE..');
    fireEvent.change(screen.getByPlaceholderText('DE..'), { target: { value: 'DE89370400440532013000' } });
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[1], { target: { value: 'Ada Lovelace' } });
    fireEvent.change(boxes[2], { target: { value: 'Street' } });
    fireEvent.change(boxes[3], { target: { value: '1' } });
    fireEvent.change(boxes[4], { target: { value: '8000' } });
    fireEvent.change(boxes[5], { target: { value: 'Zurich' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetRefund).toHaveBeenCalled());
    expect(await screen.findAllByText(/refund requested|rückerstattung angefordert|rimborso richiesto|remboursement demandé/i)).not.toHaveLength(0);
  });

  it('goes back home, copies a reference and reports clipboard failures', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabc';
    mockGetDetail.mockResolvedValue([
      tx({
        uid: 'tx-copy',
        reference: 'REF-COPY',
        fees: { total: 1.5 },
        feeAsset: 'CHF',
      }),
    ]);
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderTx();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');

    const details = (await screen.findByText(/buy|kauf|acquisto|achat/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /reference|verwendungszweck|causale|référence/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('REF-COPY'));

    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(within(details).getByRole('button', { name: /reference|verwendungszweck|causale|référence/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    const original = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    fireEvent.click(within(details).getByRole('button', { name: /reference|verwendungszweck|causale|référence/i }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original });
  });

  it('exports fail closed and CoinTracking needs an address', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = undefined;
    mockGetCsv.mockRejectedValueOnce(new Error('csv-down'));
    renderTx();
    await screen.findByText(/no transactions yet/i);
    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /compact csv|kompakt-csv|csv compatto|csv compact/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /cointracking/i }));
    await waitFor(() => expect(mockGetHistory).not.toHaveBeenCalled());

    mockSession.address = '0xabc';
    mockGetHistory.mockRejectedValueOnce(new Error('ct-down'));
    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /cointracking/i }));
    await waitFor(() => expect(mockGetHistory).toHaveBeenCalled());
  });

  it('swallows an unassigned-list failure and a non-array payload', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockRejectedValueOnce(new Error('ua-down'));
    renderTx();
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i })).not.toBeInTheDocument();
  });

  it('assigns, shows empty targets and swallows a failed assign', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockResolvedValue([
      { id: 8, inputAmount: 20, inputAsset: 'EUR', date: '2026-01-04T10:00:00Z', uid: 'pay-8' },
      { inputAmount: 10, inputAsset: 'CHF', date: '2026-01-03T10:00:00Z', uid: 'no-id' },
    ]);
    mockGetTargets.mockRejectedValueOnce(new Error('targets-down'));
    renderTx();
    fireEvent.click(await screen.findByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    expect(await screen.findByText(/no purchase to assign|kein kauf, dem du|nessun acquisto a cui|aucun achat auquel/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/back to transactions|zurück zu den transaktionen|torna alle transazioni|retour aux transactions/i));

    mockGetTargets.mockResolvedValue([{ id: 44, asset: { name: 'BTC' }, address: 'bc1qassign' }]);
    mockSetTarget.mockRejectedValueOnce(new Error('assign-down'));
    fireEvent.click(screen.getByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    await screen.findAllByRole('combobox');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getAllByRole('button', { name: /assign|zuordnen|assegna|attribuer/i })[0]);
    fireEvent.change(selects[0], { target: { value: '44' } });
    fireEvent.click(screen.getAllByRole('button', { name: /assign|zuordnen|assegna|attribuer/i })[0]);
    await waitFor(() => expect(mockSetTarget).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole('button', { name: /assign|zuordnen|assegna|attribuer/i })[1]);
  });

  it('assigns a sparse unmatched payment when the target list is not an array', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockResolvedValue([{ date: '2026-01-05T10:00:00Z' }]);
    mockGetTargets.mockResolvedValueOnce({ not: 'array' });
    renderTx();
    fireEvent.click(await screen.findByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    expect(await screen.findByText(/no purchase to assign|kein kauf, dem du|nessun acquisto a cui|aucun achat auquel/i)).toBeInTheDocument();
    expect(screen.getByText('#0')).toBeInTheDocument();
  });

  it('assigns using the first target when the user never changes the picker', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockResolvedValue([{ id: 9, inputAmount: 20, inputAsset: 'EUR', date: '2026-01-04T10:00:00Z' }]);
    mockGetTargets.mockResolvedValue([{ id: 44, asset: { name: 'BTC' }, address: 'bc1qassign' }]);
    renderTx();
    fireEvent.click(await screen.findByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: /assign|zuordnen|assegna|attribuer/i }));
    await waitFor(() => expect(mockSetTarget).toHaveBeenCalledWith(9, 44));
  });

  it('does not assign when the only target has no id', async () => {
    mockSession.isLoggedIn = true;
    mockGetUnassigned.mockResolvedValue([{ id: 10, inputAmount: 20, inputAsset: 'EUR', date: '2026-01-04T10:00:00Z' }]);
    mockGetTargets.mockResolvedValue([{ asset: { name: 'BTC' } }]);
    renderTx();
    fireEvent.click(await screen.findByRole('button', { name: /unmatched payments|nicht zugeordnet|non assegnati|non attribués/i }));
    await screen.findByRole('combobox');
    fireEvent.click(screen.getByRole('button', { name: /assign|zuordnen|assegna|attribuer/i }));
    expect(mockSetTarget).not.toHaveBeenCalled();
  });

  it('renders fallback reference fields and a refundable completed row', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({
        uid: 'tx-usage',
        reference: '',
        usage: 'USE-1',
        rate: undefined,
        exchangeRate: undefined,
        inputAmount: undefined,
        outputAmount: 1,
      }),
      tx({
        id: 22,
        uid: 'tx-refundable',
        state: 'Completed',
        refundTarget: 'CH93',
        bankUsage: 'BANK-USE',
        date: '2025-12-01T10:00:00Z',
      }),
    ]);
    renderTx();
    const first = (await screen.findAllByText(/buy|kauf|acquisto|achat/i))[0].closest('details') as HTMLElement;
    fireEvent.click(within(first).getByText(/buy|kauf|acquisto|achat/i));
    expect(within(first).getByText('USE-1')).toBeInTheDocument();

    const second = screen.getAllByText(/buy|kauf|acquisto|achat/i).map((n) => n.closest('details')).filter(Boolean)[1] as HTMLElement;
    fireEvent.click(within(second).getByText(/buy|kauf|acquisto|achat/i));
    expect(within(second).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i })).toBeInTheDocument();
  });

  it('renders sparse history rows and a refundable row without a state', async () => {
    mockSession.isLoggedIn = true;
    mockUserCtx.userAddresses = undefined as never;
    mockGetUnassigned.mockResolvedValueOnce({ not: 'array' });
    mockGetTargets.mockResolvedValueOnce('nope');
    mockGetDetail.mockResolvedValue([
      tx({
        id: undefined,
        uid: undefined,
        state: undefined,
        refundTarget: 'CH93',
        reference: '',
        usage: '',
        bankUsage: '',
        txId: '',
        inputTxId: 'in-1',
        rate: 1.2,
        feeAmount: undefined,
        fees: undefined,
        inputAmount: 0,
      }),
      tx({
        id: 5,
        uid: undefined,
        inputAmount: undefined,
        inputAsset: undefined,
      }),
      tx({
        id: 7,
        state: undefined,
      }),
    ]);
    renderTx();
    const rows = await screen.findAllByText(/buy|kauf|acquisto|achat/i);
    fireEvent.click(rows[0]);
    expect(screen.getByText('in-1')).toBeInTheDocument();
  });

  it('refunds a card payment with an empty target body', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({
        id: 55,
        type: 'Buy',
        state: 'Failed',
        inputPaymentMethod: 'CreditCard',
        uid: 'tx-card',
      }),
    ]);
    mockGetRefund.mockResolvedValue({ refundAmount: 10, refundAsset: { name: 'EUR' } });
    renderTx();
    const details = (await screen.findByText(/buy|kauf|acquisto|achat/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    expect(await screen.findByText(/card|karte|carta|carte/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetRefund).toHaveBeenCalledWith(55, {}));
  });

  it('locks a crypto refund to the server target', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({
        id: 66,
        type: 'Sell',
        state: 'Failed',
        uid: 'tx-crypto',
        inputAsset: 'ETH',
        outputAsset: 'EUR',
        inputBlockchain: 'Ethereum',
      }),
    ]);
    mockGetRefund.mockResolvedValue({
      refundTarget: ' 0xserver ',
      refundAmount: 1,
      refundAsset: { name: 'ETH' },
    });
    renderTx();
    const details = (await screen.findByText(/sell|verkauf|vendita|vente/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/sell|verkauf|vendita|vente/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    const locked = await screen.findByDisplayValue('0xserver');
    expect(locked).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetRefund).toHaveBeenCalledWith(66, { refundTarget: '0xserver' }));
    fireEvent.click(screen.getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
  });

  it('lets the user pick a crypto refund address', async () => {
    mockSession.isLoggedIn = true;
    mockUserAddresses.push(
      { address: '0xaaa', blockchains: ['Ethereum'], label: 'One' },
      { address: '0xbbb', blockchains: ['Ethereum'] },
      { address: '0xccc', blockchains: ['Bitcoin'] },
    );
    mockGetDetail.mockResolvedValue([
      tx({
        id: 67,
        type: 'Swap',
        state: 'Failed',
        uid: 'tx-swap-ref',
        inputAsset: 'USDT',
        outputAsset: 'USDC',
        inputBlockchain: 'Ethereum',
      }),
    ]);
    mockGetRefund.mockResolvedValue({ refundTarget: '', refundAmount: 1, refundAsset: { name: 'USDT' } });
    renderTx();
    const details = (await screen.findByText(/swap|tausch|scambio|échange/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/swap|tausch|scambio|échange/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    const select = await screen.findByLabelText(/refund to|rückerstattung an|rimborso a|remboursement vers/i);
    fireEvent.change(select, { target: { value: '0xbbb' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetRefund).toHaveBeenCalledWith(67, { refundTarget: '0xbbb' }));
  });

  it('blocks a crypto refund when no account address matches the chain', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({
        id: 68,
        type: 'Sell',
        state: 'Failed',
        uid: 'tx-blocked',
        inputAsset: 'BTC',
        outputAsset: 'EUR',
        inputBlockchain: 'Bitcoin',
      }),
    ]);
    mockGetRefund.mockResolvedValue({ refundTarget: '   ', refundAmount: 1, refundAsset: { name: 'BTC' } });
    renderTx();
    const details = (await screen.findByText(/sell|verkauf|vendita|vente/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/sell|verkauf|vendita|vente/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    expect(await screen.findByText(/couldn't be determined|nicht automatisch|non è stato possibile|n.a pas pu être déterminée/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i })).toBeDisabled();
  });

  it('retries a failed refund load and surfaces MultiAccountIban', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({ id: 77, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank', uid: 'tx-bank-err' }),
    ]);
    mockGetRefund.mockRejectedValueOnce(new Error('refund-down'));
    const { ApiException } = jest.requireMock('@dfx.swiss/react') as {
      ApiException: new (status: number, message: string) => Error;
    };
    mockSetRefund.mockRejectedValueOnce(new ApiException(400, 'MultiAccountIban'));
    renderTx();
    const details = (await screen.findByText(/buy|kauf|acquisto|achat/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    expect(await screen.findByText(/aren't available|nicht verfügbar|non disponibili|ne sont pas/i)).toBeInTheDocument();
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 90,
      refundAsset: { name: 'EUR' },
      bankDetails: { iban: '', name: '', address: '', zip: '', city: '', country: 'CH' },
    });
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await screen.findByPlaceholderText('DE..');
    fireEvent.change(screen.getByPlaceholderText('DE..'), { target: { value: 'DE89370400440532013000' } });
    const boxes = screen.getAllByRole('textbox');
    fireEvent.change(boxes[1], { target: { value: 'Ada Lovelace' } });
    fireEvent.change(boxes[2], { target: { value: 'Street' } });
    fireEvent.change(boxes[3], { target: { value: '1' } });
    fireEvent.change(boxes[4], { target: { value: '8000' } });
    fireEvent.change(boxes[5], { target: { value: 'Zurich' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    expect(await screen.findByText(/iban|mehreren|più conti|plusieurs/i)).toBeInTheDocument();
  });

  it('validates a bank refund and fills the holder name from the profile', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({ id: 78, type: 'Buy', state: 'Expired', inputPaymentMethod: 'Bank', uid: 'tx-bank-val' }),
    ]);
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 10,
      refundAsset: { name: 'EUR' },
      fee: { dfx: 1, network: 0, bank: 0 },
      bankDetails: { iban: '', name: '', address: '', zip: '', city: '', country: '' },
    });
    mockGetCountries.mockRejectedValueOnce(new Error('countries-down'));
    renderTx();
    const details = (await screen.findByText(/buy|kauf|acquisto|achat/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    await screen.findByPlaceholderText('DE..');
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    fireEvent.change(screen.getByPlaceholderText('DE..'), { target: { value: 'DE89370400440532013000' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    expect(await screen.findByText(/fill in all fields|alle felder|tutti i campi|remplir tous les champs/i)).toBeInTheDocument();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('textbox')[1]).toHaveValue('Ada Lovelace'));
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Other Name' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DE' } });
  });

  it('shows a server error detail and ignores a second confirm while submitting', async () => {
    mockSession.isLoggedIn = true;
    mockGetDetail.mockResolvedValue([
      tx({ id: 79, type: 'Buy', state: 'Failed', inputPaymentMethod: 'checkout', uid: 'tx-card2' }),
    ]);
    const { ApiException } = jest.requireMock('@dfx.swiss/react') as {
      ApiException: new (status: number, message: string) => Error;
    };
    mockSetRefund.mockRejectedValueOnce(new ApiException(400, 'Nope'));
    renderTx();
    const details = (await screen.findByText(/buy|kauf|acquisto|achat/i)).closest('details') as HTMLElement;
    fireEvent.click(within(details).getByText(/buy|kauf|acquisto|achat/i));
    fireEvent.click(within(details).getByRole('button', { name: /request refund|rückerstattung|rimborso|remboursement/i }));
    const confirm = await screen.findByRole('button', { name: /confirm refund|rückerstattung bestätigen/i });
    fireEvent.click(confirm);
    expect(await screen.findByText(/Nope/)).toBeInTheDocument();
    mockSetRefund.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mockSetRefund).toHaveBeenCalledTimes(2);
  });

  it('revokes the CoinTracking blob after download', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabc';
    renderTx();
    await screen.findByText(/no transactions yet/i);
    fireEvent.click(screen.getByRole('button', { name: /export csv|csv exportieren|esporta csv|exporter csv/i }));
    fireEvent.click(screen.getByRole('button', { name: /cointracking/i }));
    await waitFor(() => expect(mockGetHistory).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('RefundPanel', () => {
  beforeEach(() => {
    mockUserAddresses.length = 0;
    mockUserCtx.userAddresses = mockUserAddresses;
    mockGetRefund.mockReset();
    mockSetRefund.mockReset();
    mockGetProfile.mockReset();
    mockGetCountries.mockReset();
    mockGetRefund.mockResolvedValue({ refundTarget: '', refundAmount: 1, refundAsset: { name: 'EUR' } });
    mockSetRefund.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockGetCountries.mockResolvedValue([{ id: 1, name: 'Switzerland', symbol: 'CH' }]);
  });

  it('shows a dash when the refund amount is missing and swallows a country load error', async () => {
    mockGetCountries.mockRejectedValueOnce(new Error('countries-down'));
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: undefined,
      refundAsset: undefined,
    });
    renderPanel({ id: 102, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText(/you'll get back|du erhältst zurück|riceverai|récupéreras/i)).toBeInTheDocument();
  });

  it('lists no crypto addresses when the account address list is missing', async () => {
    mockUserCtx.userAddresses = undefined as never;
    mockGetRefund.mockResolvedValue({ refundTarget: '', refundAmount: 1, refundAsset: { name: 'ETH' } });
    renderPanel({ id: 104, type: 'Sell', state: 'Failed', inputBlockchain: 'Ethereum', inputAsset: 'ETH' });
    expect(
      await screen.findByText(/couldn't be determined|nicht automatisch|non è stato possibile|n.a pas pu être déterminée/i),
    ).toBeInTheDocument();
  });

  it('maps an ApiException whose message is missing', async () => {
    const { ApiException: Thrown } = jest.requireMock('@dfx.swiss/react') as {
      ApiException: new (status: number, message: string) => Error;
    };
    const err = new Thrown(400, 'tmp');
    Object.defineProperty(err, 'message', { value: undefined });
    mockSetRefund.mockRejectedValueOnce(err);
    mockGetRefund.mockResolvedValue({
      refundTarget: 'DE89370400440532013000',
      refundAmount: 3,
      refundAsset: { name: 'EUR' },
      bankDetails: {
        iban: 'DE89370400440532013000',
        name: 'Ada',
        address: 'Street',
        zip: '8000',
        city: 'Zurich',
        country: 'CH',
      },
    });
    renderPanel({ id: 103, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    await screen.findByDisplayValue('DE89370400440532013000');
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    expect(await screen.findByText(/something went wrong|etwas ist schief|qualcosa è andato|une erreur/i)).toBeInTheDocument();
  });

  it('drops a country fetch after unmount and maps an ApiException without a message', async () => {
    let resolveCountries!: (value: unknown) => void;
    mockGetCountries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCountries = resolve;
        }),
    );
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: undefined,
      refundAsset: undefined,
    });
    const pending = renderPanel({ id: 101, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    pending.unmount();
    await act(async () => {
      resolveCountries([{ id: 1, name: 'Switzerland', symbol: 'CH' }]);
    });
  });

  function renderPanel(partial: Record<string, unknown> = {}) {
    return render(
      <LanguageProvider>
        <ToastProvider>
          <RefundPanel tx={tx(partial) as never} onClose={jest.fn()} />
        </ToastProvider>
      </LanguageProvider>,
    );
  }

  it('errors when the transaction has no id', async () => {
    renderPanel({ id: null, type: 'Buy', state: 'Failed' });
    expect(await screen.findByText(/aren't available|nicht verfügbar|non disponibili|ne sont pas/i)).toBeInTheDocument();
  });

  it('auto-selects the only matching crypto address and submits a bank refund without a house number', async () => {
    mockUserAddresses.push({ address: '0xonly', blockchains: ['Ethereum'] });
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 2,
      refundAsset: { name: 'ETH' },
    });
    renderPanel({
      id: 90,
      type: 'Sell',
      state: 'Failed',
      inputBlockchain: 'Ethereum',
      inputAsset: 'ETH',
    });
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('0xonly'));
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    await waitFor(() => expect(mockSetRefund).toHaveBeenCalledWith(90, { refundTarget: '0xonly' }));
  });

  it('treats a non-array country list as empty and a generic refund failure as genErr', async () => {
    mockGetCountries.mockResolvedValueOnce(null);
    mockGetRefund.mockResolvedValue({
      refundTarget: 'DE89370400440532013000',
      refundAmount: 3,
      refundAsset: { name: 'EUR' },
      bankDetails: {
        iban: 'DE89370400440532013000',
        name: 'Ada',
        address: 'Street',
        zip: '8000',
        city: 'Zurich',
        country: 'CH',
      },
    });
    mockSetRefund.mockRejectedValueOnce(new Error('nope'));
    renderPanel({ id: 91, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    await screen.findByDisplayValue('DE89370400440532013000');
    fireEvent.click(screen.getByRole('button', { name: /confirm refund|rückerstattung bestätigen/i }));
    expect(await screen.findByText(/something went wrong|etwas ist schief|qualcosa è andato|une erreur/i)).toBeInTheDocument();
  });

  it('ignores a profile fetch failure on a bank refund', async () => {
    mockGetProfile.mockRejectedValueOnce(new Error('profile-down'));
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 1,
      refundAsset: { name: 'EUR' },
      bankDetails: { name: '', address: 'S', zip: '1', city: 'Z', country: 'CH' },
    });
    renderPanel({ id: 93, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    await screen.findByPlaceholderText('DE..');
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
  });

  it('cancels an in-flight country fetch on unmount', async () => {
    let resolveCountries: ((value: unknown) => void) | undefined;
    mockGetCountries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCountries = resolve;
        }),
    );
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 1,
      refundAsset: { name: 'EUR' },
      bankDetails: { name: 'Ada', address: 'S', zip: '1', city: 'Z', country: 'CH' },
    });
    const { unmount } = renderPanel({ id: 92, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    unmount();
    resolveCountries?.([{ id: 1, name: 'Switzerland', symbol: 'CH' }]);
  });

  it('drops a rejected country fetch after unmount', async () => {
    let rejectCountries: ((error: unknown) => void) | undefined;
    mockGetCountries.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCountries = reject;
        }),
    );
    mockGetRefund.mockResolvedValue({
      refundTarget: '',
      refundAmount: 1,
      refundAsset: { name: 'EUR' },
      bankDetails: { name: 'Ada', address: 'S', zip: '1', city: 'Z', country: 'CH' },
    });
    const { unmount } = renderPanel({ id: 105, type: 'Buy', state: 'Failed', inputPaymentMethod: 'Bank' });
    unmount();
    rejectCountries?.(new Error('late-countries'));
  });

  it('blocks a crypto refund without an input chain and keeps a still-valid pick', async () => {
    mockGetRefund.mockResolvedValue({ refundTarget: '', refundAmount: 1, refundAsset: { name: 'ETH' } });
    const noChain = renderPanel({ id: 93, type: 'Sell', state: 'Failed', inputAsset: 'ETH' });
    expect(
      await screen.findByText(/couldn't be determined|nicht automatisch|non è stato possibile|n.a pas pu être déterminée/i),
    ).toBeInTheDocument();
    noChain.unmount();

    mockUserAddresses.push(
      { address: '0xaaa', blockchains: ['Ethereum'] },
      { address: '0xbbb', blockchains: ['Ethereum'] },
    );
    const pick = renderPanel({
      id: 94,
      type: 'Sell',
      state: 'Failed',
      inputBlockchain: 'Ethereum',
      inputAsset: 'ETH',
    });
    const select = await screen.findByLabelText(/refund to|rückerstattung an|rimborso a|remboursement vers/i);
    fireEvent.change(select, { target: { value: '0xbbb' } });
    expect(select).toHaveValue('0xbbb');
    mockUserCtx.userAddresses = [
      { address: '0xaaa', blockchains: ['Ethereum'] },
      { address: '0xbbb', blockchains: ['Ethereum'] },
      { address: '0xccc', blockchains: ['Ethereum'] },
    ];
    pick.rerender(
      <LanguageProvider>
        <ToastProvider>
          <RefundPanel
            tx={
              tx({
                id: 94,
                type: 'Sell',
                state: 'Failed',
                inputBlockchain: 'Ethereum',
                inputAsset: 'ETH',
              }) as never
            }
            onClose={jest.fn()}
          />
        </ToastProvider>
      </LanguageProvider>,
    );
    expect(await screen.findByLabelText(/refund to|rückerstattung an|rimborso a|remboursement vers/i)).toHaveValue(
      '0xbbb',
    );
    pick.unmount();
  });
});
