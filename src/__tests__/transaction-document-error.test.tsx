// Wiring test: TransactionList shows a row-scoped ErrorHint when invoice/receipt PDF
// load fails, using getStoredPaymentDetailErrorMessage (not buy-flow personal-IBAN copy).

const mockGetDetailTransactions = jest.fn();
const mockGetUnassignedTransactions = jest.fn();
const mockGetTransactionTargets = jest.fn();
const mockSetTransactionTarget = jest.fn();
const mockGetTransactionInvoice = jest.fn();
const mockGetTransactionReceipt = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  TransactionState: {
    COMPLETED: 'Completed',
    UNASSIGNED: 'Unassigned',
    FAILED: 'Failed',
    CHECK_PENDING: 'CheckPending',
    KYC_REQUIRED: 'KycRequired',
    LIMIT_EXCEEDED: 'LimitExceeded',
    RETURN_PENDING: 'ReturnPending',
    RETURNED: 'Returned',
  },
  TransactionType: {
    BUY: 'Buy',
    SELL: 'Sell',
  },
  TransactionFailureReason: {
    BANK_RELEASE_PENDING: 'BankReleasePending',
    INPUT_NOT_CONFIRMED: 'InputNotConfirmed',
    PHONE_VERIFICATION_NEEDED: 'PhoneVerificationNeeded',
  },
  CryptoPaymentMethod: {
    CRYPTO: 'Crypto',
  },
  FiatPaymentMethod: {
    BANK: 'Bank',
    INSTANT: 'Instant',
    CARD: 'Card',
  },
  ExportFormat: {
    CSV: 'Csv',
  },
  SupportIssueType: {
    TRANSACTION_ISSUE: 'TransactionIssue',
  },
  SupportIssueReason: {
    TRANSACTION_MISSING: 'TransactionMissing',
  },
  Utils: {
    formatIban: (v: any) => v,
    formatAmount: (n: any) => String(n),
    createRules: () => ({}),
  },
  Validations: {
    Required: undefined,
  },
  useTransaction: () => ({
    getDetailTransactions: mockGetDetailTransactions,
    getUnassignedTransactions: mockGetUnassignedTransactions,
    getTransactionTargets: mockGetTransactionTargets,
    setTransactionTarget: mockSetTransactionTarget,
    getTransactionInvoice: mockGetTransactionInvoice,
    getTransactionReceipt: mockGetTransactionReceipt,
  }),
  useSessionContext: () => ({ isLoggedIn: true }),
  useUserContext: () => ({ user: { activeAddress: undefined, phone: undefined } }),
  useBankAccountContext: () => ({ bankAccounts: [] }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick, hidden, isLoading, type }: any) =>
    hidden ? null : (
      <button type={type ?? 'button'} onClick={onClick} disabled={isLoading}>
        {label}
      </button>
    ),
  StyledCollapsible: ({ titleContent, children }: any) => (
    <div>
      {titleContent}
      {children}
    </div>
  ),
  StyledDataTable: ({ children }: any) => <div>{children}</div>,
  StyledDataTableRow: ({ children }: any) => <div>{children}</div>,
  StyledDataTableExpandableRow: ({ children }: any) => <div>{children}</div>,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
  StyledIconButton: () => null,
  DfxAssetIcon: () => null,
  DfxIcon: () => null,
  CopyButton: () => null,
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
  IconVariant: { RELOAD: 'reload', HELP: 'help' },
  IconSize: { LG: 'lg' },
  AlignContent: { RIGHT: 'right' },
  AssetIconVariant: {},
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white', BLUE: 'blue' },
  StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  Form: ({ children }: any) => <div>{children}</div>,
  StyledDropdown: () => null,
  StyledInput: () => null,
  StyledLink: ({ label, children }: any) => <div>{label ?? children}</div>,
  StyledSearchDropdown: () => null,
}));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('../config/labels', () => ({
  toPaymentStateLabel: (s: any) => s,
  PaymentFailureReasons: {},
  PaymentMethodLabels: {},
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ setRedirectPath: jest.fn() }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, k: string) => k,
    allowedCountries: [],
  }),
}));
jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null }, scrollToTop: jest.fn() }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));

jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: () => '' }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useUserGuard: () => undefined,
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('src/components/cointracking', () => () => null);
jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: () => null,
}));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  openPdfFromString: jest.fn(),
}));

jest.mock('../util/validation-rules', () => ({
  ZipValidation: undefined,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TransactionList } from '../screens/transaction.screen';

function tx(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uid: 'tx-uid-1',
    date: '2026-01-01T00:00:00.000Z',
    type: 'Buy',
    state: 'Completed',
    inputAsset: 'EUR',
    inputAmount: 100,
    outputAsset: 'BTC',
    outputAmount: 0.001,
    ...overrides,
  };
}

function renderList() {
  return render(
    <MemoryRouter>
      <TransactionList isSupport={false} setError={jest.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDetailTransactions.mockResolvedValue([tx()]);
  mockGetUnassignedTransactions.mockResolvedValue([]);
  mockGetTransactionInvoice.mockReset();
  mockGetTransactionReceipt.mockReset();
});

describe('TransactionList document error display', () => {
  it('does not request a receipt when the completed transaction has no id', async () => {
    mockGetDetailTransactions.mockResolvedValue([tx({ id: null })]);
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Open receipt' }));
    expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
  });

  it('maps StoredBankNoLongerAcceptsPayments on Open receipt to customer-facing copy', async () => {
    mockGetTransactionReceipt.mockRejectedValue({ message: 'StoredBankNoLongerAcceptsPayments' });

    renderList();

    const openReceipt = await screen.findByRole('button', { name: 'Open receipt' });
    await userEvent.click(openReceipt);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent(
        'This bank no longer accepts payments. Please start a new purchase.',
      );
    });
    expect(screen.queryByText('StoredBankNoLongerAcceptsPayments')).not.toBeInTheDocument();
  });

  it('maps StoredPersonalIbanIsNoLongerActive on Open invoice to customer-facing copy', async () => {
    mockGetTransactionInvoice.mockRejectedValue({ message: 'StoredPersonalIbanIsNoLongerActive' });

    renderList();

    const openInvoice = await screen.findByRole('button', { name: 'Open invoice' });
    await userEvent.click(openInvoice);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent(
        'This personal IBAN is no longer active. Please start a new purchase.',
      );
    });
  });

  it('shows raw message for buy-flow tokens not mapped by stored-detail errors', async () => {
    mockGetTransactionReceipt.mockRejectedValue({ message: 'KycRequired' });

    renderList();

    const openReceipt = await screen.findByRole('button', { name: 'Open receipt' });
    await userEvent.click(openReceipt);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('KycRequired');
    });
    expect(screen.queryByText('Personal IBANs require KYC level 50.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Personal IBANs require/)).not.toBeInTheDocument();
  });

  it('scopes the document error hint to the failing transaction row only', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      tx({ id: 1, uid: 'tx-uid-1', date: '2026-01-02T00:00:00.000Z' }),
      tx({ id: 2, uid: 'tx-uid-2', date: '2026-01-01T00:00:00.000Z' }),
    ]);
    mockGetTransactionReceipt.mockImplementation((id: number) => {
      if (id === 1) return Promise.reject({ message: 'StoredBankNoLongerAcceptsPayments' });
      return Promise.resolve({ pdfData: 'ok' });
    });

    renderList();

    const openReceiptButtons = await screen.findAllByRole('button', { name: 'Open receipt' });
    expect(openReceiptButtons).toHaveLength(2);

    await userEvent.click(openReceiptButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByTestId('error-hint')).toHaveLength(1);
    });
    expect(screen.getByTestId('error-hint')).toHaveTextContent(
      'This bank no longer accepts payments. Please start a new purchase.',
    );
  });

  it('uses error.message directly without a silent Unknown error fallback (A5)', async () => {
    mockGetTransactionInvoice.mockRejectedValue({ message: 'Network failure detail' });

    renderList();

    const openInvoice = await screen.findByRole('button', { name: 'Open invoice' });
    await userEvent.click(openInvoice);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network failure detail');
    });
    expect(screen.queryByText('Unknown error')).not.toBeInTheDocument();
  });
});
