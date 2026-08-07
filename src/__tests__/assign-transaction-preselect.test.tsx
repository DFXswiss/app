// Wiring test: assign-transaction form preselects the only target on every open
// (including after a previous assignment reset) and does not open when targets fail to load.

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

const SINGLE_TARGET = {
  id: 99,
  address: 'wallet-address',
  bankUsage: 'ABCD-EFGH-IJKL',
  asset: { name: 'BTC', blockchain: 'Bitcoin' },
};

function unassignedTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uid: 'tx-uid-1',
    date: '2026-01-02T00:00:00.000Z',
    type: 'Buy',
    state: 'Unassigned',
    inputAsset: 'EUR',
    inputAmount: 100,
    outputAsset: 'BTC',
    outputAmount: 0.001,
    ...overrides,
  };
}

const UNASSIGNED_TXS = [
  unassignedTx({ id: 1, uid: 'tx-uid-1', date: '2026-01-02T00:00:00.000Z' }),
  unassignedTx({ id: 2, uid: 'tx-uid-2', date: '2026-01-01T00:00:00.000Z' }),
];

function renderList(setError = jest.fn()) {
  return {
    setError,
    ...render(
      <MemoryRouter>
        <TransactionList isSupport={false} setError={setError} />
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDetailTransactions.mockResolvedValue([]);
  mockGetUnassignedTransactions.mockResolvedValue(UNASSIGNED_TXS);
  mockGetTransactionTargets.mockResolvedValue([SINGLE_TARGET]);
  mockSetTransactionTarget.mockResolvedValue(undefined);
  mockGetTransactionInvoice.mockReset();
  mockGetTransactionReceipt.mockReset();
});

describe('TransactionList assign-transaction preselect', () => {
  // Pins that the single target is re-applied after reset() of a prior assignment
  // so the second form open still submits a valid target (not an empty field).
  it('preselects the only target again after a previous assignment', async () => {
    renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    expect(openButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(openButtons[0]);

    await screen.findByText('Remittance info');
    const buttonsAfterFirstOpen = screen.getAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(buttonsAfterFirstOpen[0]);

    await waitFor(() => {
      expect(mockSetTransactionTarget).toHaveBeenCalledWith(1, 99);
    });

    await waitFor(() => {
      expect(screen.queryByText('Remittance info')).not.toBeInTheDocument();
    });

    const openButtonsAgain = await screen.findAllByRole('button', { name: 'Assign transaction' });
    expect(openButtonsAgain.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(openButtonsAgain[1]);

    await screen.findByText('Remittance info');
    const buttonsAfterSecondOpen = screen.getAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(buttonsAfterSecondOpen[1]);

    await waitFor(() => {
      expect(mockSetTransactionTarget).toHaveBeenCalledWith(2, 99);
    });
  });

  // Pins that getTransactionTargets is cached and not re-fetched on every open.
  it('fetches the target list only once', async () => {
    renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);
    await screen.findByText('Remittance info');
    await userEvent.click(screen.getAllByRole('button', { name: 'Assign transaction' })[0]);

    await waitFor(() => {
      expect(mockSetTransactionTarget).toHaveBeenCalledWith(1, 99);
    });
    await waitFor(() => {
      expect(screen.queryByText('Remittance info')).not.toBeInTheDocument();
    });

    const openButtonsAgain = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtonsAgain[1]);
    await screen.findByText('Remittance info');
    await userEvent.click(screen.getAllByRole('button', { name: 'Assign transaction' })[1]);

    await waitFor(() => {
      expect(mockSetTransactionTarget).toHaveBeenCalledWith(2, 99);
    });

    expect(mockGetTransactionTargets).toHaveBeenCalledTimes(1);
  });

  // Pins that a failed target-list fetch surfaces the error and does not open an empty form.
  it('does not open the assignment form when the target list fails to load', async () => {
    mockGetTransactionTargets.mockRejectedValue({ message: 'TargetsUnavailable' });
    const { setError } = renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('TargetsUnavailable');
    });
    // Form must not open: no remittance label and no submit control.
    expect(screen.queryByText('Remittance info')).not.toBeInTheDocument();
    expect(document.querySelector('button[type="submit"]')).toBeNull();
  });
});
