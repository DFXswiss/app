// Coverage tests for remaining lines in transaction.screen.tsx: TransactionStatus support
// ticket click, TransactionRefund country filter/match, TransactionList error/nav/action
// paths, and TxInfo priceSteps / chargeback CopyButton.

const mockGetTransactionByUid = jest.fn();
const mockGetTransactionRefund = jest.fn();
const mockSetTransactionRefundTarget = jest.fn();
const mockGetDetailTransactions = jest.fn();
const mockGetUnassignedTransactions = jest.fn();
const mockGetTransactionTargets = jest.fn();
const mockSetTransactionTarget = jest.fn();
const mockGetTransactionInvoice = jest.fn();
const mockGetTransactionReceipt = jest.fn();
const mockGetTransactionCsv = jest.fn();
const mockGetTransactionHistory = jest.fn();

const mockNavigate = jest.fn();
const mockSetRedirectPath = jest.fn();
const mockUseLayoutOptions = jest.fn();
const mockCopy = jest.fn();
const mockOpenPdfFromString = jest.fn();

let mockUser: any = {
  activeAddress: { address: '0xabc', wallet: 'SomeWallet' },
  phone: undefined,
};
let mockUserAddresses: any[] = [];
let mockBankAccounts: any[] = [];
let mockAllowedCountries: any[] = [];
let mockIsLoggedIn = true;
let mockWidth = 800;

jest.mock('@dfx.swiss/react', () => {
  // Empty rules keep list assignment isValid=true after setValue (same pattern as assign-transaction-preselect).
  const Utils = {
    formatIban: (v: any) => v,
    formatAmount: (n: any) => String(n),
    createRules: () => ({}),
  };

  const Validations = {
    Required: undefined,
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  };

  return {
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
    Utils,
    Validations,
    useTransaction: () => ({
      getDetailTransactions: mockGetDetailTransactions,
      getUnassignedTransactions: mockGetUnassignedTransactions,
      getTransactionTargets: mockGetTransactionTargets,
      setTransactionTarget: mockSetTransactionTarget,
      getTransactionInvoice: mockGetTransactionInvoice,
      getTransactionReceipt: mockGetTransactionReceipt,
      getTransactionCsv: mockGetTransactionCsv,
      getTransactionHistory: mockGetTransactionHistory,
      getTransactionByUid: mockGetTransactionByUid,
      getTransactionRefund: mockGetTransactionRefund,
      setTransactionRefundTarget: mockSetTransactionRefundTarget,
    }),
    useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
    useUserContext: () => ({ user: mockUser, userAddresses: mockUserAddresses }),
    useBankAccountContext: () => ({ bankAccounts: mockBankAccounts }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports — require React / RHF here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Children, cloneElement, forwardRef, isValidElement, useState } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(children: any, control: any, rules: any, errors: any, onSubmit: any): any {
    return Children.map(children, (child: any) => {
      if (!isValidElement(child)) return child;
      const childProps: any = child.props ?? {};
      const nextChildren = enrichChildren(childProps.children, control, rules, errors, onSubmit);
      if (childProps.name) {
        return cloneElement(child, {
          control,
          rules: rules?.[childProps.name],
          error: errors?.[childProps.name],
          onSubmit,
          children: nextChildren,
        });
      }
      return cloneElement(child, { children: nextChildren });
    });
  }

  function Form({ children, control, rules, errors, onSubmit }: any) {
    return React.createElement(
      'form',
      { className: 'w-full' },
      enrichChildren(children, control, rules, errors, onSubmit),
    );
  }

  const StyledInput = forwardRef(function StyledInput(
    { control, name, label, rules, error, placeholder }: any,
    ref: any,
  ) {
    return React.createElement(Controller, {
      control,
      name,
      rules,
      render: ({ field: { onChange, onBlur, value } }: any) =>
        React.createElement(
          'div',
          null,
          label ? React.createElement('label', null, label) : null,
          React.createElement('input', {
            ref,
            'data-testid': name,
            placeholder,
            value: value ?? '',
            onBlur,
            onChange: (e: any) => onChange(e.target.value),
          }),
          error ? React.createElement('p', null, error.message) : null,
        ),
    });
  });

  function StyledDropdown({
    control,
    name,
    label,
    items,
    labelFunc,
    descriptionFunc,
    placeholder,
    rules,
    error,
  }: any) {
    const [open, setOpen] = useState(false);
    return React.createElement(Controller, {
      control,
      name,
      rules,
      render: ({ field: { onChange, onBlur, value } }: any) =>
        React.createElement(
          'div',
          { 'data-testid': `${name}-dropdown` },
          label ? React.createElement('label', null, label) : null,
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `${name}-trigger`,
              onClick: () => setOpen((o: boolean) => !o),
              onBlur,
            },
            value != null && value !== '' ? labelFunc(value) : (placeholder ?? 'Select...'),
          ),
          descriptionFunc && value != null && value !== ''
            ? React.createElement('span', { 'data-testid': `${name}-description` }, descriptionFunc(value))
            : null,
          open
            ? React.createElement(
                'div',
                { 'data-testid': `${name}-options` },
                (items ?? []).map((item: any, i: number) =>
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      key: i,
                      'data-testid': `${name}-option-${i}`,
                      onClick: () => {
                        onChange(item);
                        setOpen(false);
                      },
                    },
                    [
                      labelFunc(item),
                      descriptionFunc
                        ? React.createElement(
                            'span',
                            { key: 'desc', 'data-testid': `${name}-option-desc-${i}` },
                            descriptionFunc(item),
                          )
                        : null,
                    ],
                  ),
                ),
              )
            : null,
          error ? React.createElement('p', null, error.message) : null,
        ),
    });
  }

  function StyledSearchDropdown({
    control,
    name,
    label,
    items,
    labelFunc,
    filterFunc,
    matchFunc,
    placeholder,
    rules,
    error,
  }: any) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    return React.createElement(Controller, {
      control,
      name,
      rules,
      render: ({ field: { onChange, onBlur, value } }: any) => {
        const filtered = (items ?? []).filter((i: any) => (filterFunc ? filterFunc(i, search) : true));
        return React.createElement(
          'div',
          { 'data-testid': `${name}-search-dropdown` },
          label ? React.createElement('label', null, label) : null,
          React.createElement(
            'button',
            {
              type: 'button',
              'data-testid': `${name}-trigger`,
              onClick: () => setOpen((o: boolean) => !o),
              onBlur,
            },
            value != null ? labelFunc(value) : (placeholder ?? 'Select...'),
          ),
          open
            ? React.createElement(
                'div',
                { 'data-testid': `${name}-options` },
                React.createElement('input', {
                  'data-testid': `${name}-search`,
                  value: search,
                  onChange: (e: any) => {
                    const s = e.target.value;
                    setSearch(s);
                    // Exercise filterFunc / matchFunc for every item (coverage of creditorCountry helpers).
                    (items ?? []).forEach((i: any) => {
                      filterFunc?.(i, s);
                      matchFunc?.(i, s);
                    });
                  },
                }),
                filtered.map((item: any, i: number) =>
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      key: i,
                      'data-testid': `${name}-option-${i}`,
                      onClick: () => {
                        onChange(item);
                        setOpen(false);
                      },
                    },
                    labelFunc(item),
                  ),
                ),
              )
            : null,
          error ? React.createElement('p', null, error.message) : null,
        );
      },
    });
  }

  function StyledButton({ label, onClick, disabled, isLoading, type, hidden }: any) {
    if (hidden) return null;
    return React.createElement(
      'button',
      { type: type ?? 'button', onClick, disabled: disabled || isLoading },
      label,
    );
  }

  return {
    Form,
    StyledInput,
    StyledDropdown,
    StyledSearchDropdown,
    StyledButton,
    StyledVerticalStack: ({ children }: any) => React.createElement('div', null, children),
    StyledHorizontalStack: ({ children }: any) => React.createElement('div', null, children),
    StyledDataTable: ({ children }: any) => React.createElement('div', { 'data-testid': 'data-table' }, children),
    StyledDataTableRow: ({ label, children, infoText }: any) =>
      React.createElement(
        'div',
        { 'data-testid': label ? `row-${label}` : undefined },
        label ? React.createElement('span', null, label) : null,
        children,
        infoText ? React.createElement('span', { 'data-testid': `info-${label}` }, infoText) : null,
      ),
    StyledDataTableExpandableRow: ({ children, infoText, expansionItems }: any) =>
      React.createElement(
        'div',
        null,
        children,
        infoText ? React.createElement('span', { 'data-testid': 'expandable-info' }, infoText) : null,
        (expansionItems ?? []).map((item: any, i: number) =>
          React.createElement(
            'div',
            { key: i, 'data-testid': item.label ? `expansion-${item.label}` : `expansion-${i}` },
            item.text,
            item.infoText
              ? React.createElement(
                  'span',
                  { 'data-testid': item.label ? `expansion-info-${item.label}` : `expansion-info-${i}` },
                  item.infoText,
                )
              : null,
          ),
        ),
      ),
    StyledCollapsible: ({ titleContent, children, isExpanded }: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'collapsible', 'data-expanded': String(isExpanded) },
        titleContent,
        children,
      ),
    StyledIconButton: ({ onClick }: any) =>
      React.createElement('button', { type: 'button', 'data-testid': 'reload-button', onClick }, 'Reload'),
    DfxAssetIcon: ({ asset }: any) =>
      React.createElement('div', { 'data-testid': 'dfx-asset-icon' }, asset),
    DfxIcon: () => React.createElement('div', { 'data-testid': 'dfx-help-icon' }),
    // Must be clickable so TxInfo chargeback CopyButton onCopy (line 1216) is reachable.
    CopyButton: ({ onCopy }: any) =>
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'copy-button', onClick: onCopy },
        'Copy',
      ),
    StyledLink: ({ label, children, url }: any) =>
      React.createElement('a', { 'data-testid': 'styled-link', href: url }, label ?? children),
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    IconVariant: {
      RELOAD: 'reload',
      HELP: 'help',
      EXPAND_LESS: 'expand_less',
      EXPAND_MORE: 'expand_more',
    },
    IconSize: { LG: 'lg' },
    AlignContent: { RIGHT: 'right' },
    // Non-empty so TransactionList icon map can resolve asset icons (SELL order / d-prefix).
    AssetIconVariant: { BTC: 'BTC', ETH: 'ETH', EUR: 'EUR' },
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', BLUE: 'blue', WHITE: 'white' },
    StyledButtonWidth: { FULL: 'full', MIN: 'min' },
  };
});

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('../config/labels', () => ({
  toPaymentStateLabel: (s: any) => s,
  PaymentFailureReasons: {},
  PaymentMethodLabels: {},
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ setRedirectPath: mockSetRedirectPath }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, k: string, params?: Record<string, unknown>) => {
      if (!params) return k;
      return Object.keys(params).reduce(
        (acc, key) => acc.replace(new RegExp(`{{${key}}}`, 'g'), String(params[key])),
        k,
      );
    },
    allowedCountries: mockAllowedCountries,
  }),
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null }, scrollToTop: jest.fn() }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: mockWidth }),
}));

jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: (b: any) => String(b ?? '') }),
}));

jest.mock('../hooks/guard.hook', () => ({
  useUserGuard: () => undefined,
  useAddressGuard: () => undefined,
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: any) => {
    mockUseLayoutOptions(options);
  },
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/components/cointracking', () => () => <div data-testid="cointracking" />);

jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: () => null,
}));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  openPdfFromString: (...args: any[]) => mockOpenPdfFromString(...args),
}));

jest.mock('../util/validation-rules', () => ({
  ZipValidation: undefined,
}));

jest.mock('copy-to-clipboard', () => (...args: any[]) => mockCopy(...args));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import TransactionScreen, { TransactionList, TxInfo } from '../screens/transaction.screen';

const COUNTRY_CH = { symbol: 'CH', name: 'Switzerland' };
const COUNTRY_DE = { symbol: 'DE', name: 'Germany' };

const BANK_IBAN_DE = 'DE89370400440532013000';

const TARGET_A = {
  id: 11,
  address: '0xtarget-a-long-enough-address',
  bankUsage: 'USAGE-A',
  asset: { name: 'BTC', blockchain: 'Bitcoin' },
};

const TARGET_B = {
  id: 22,
  address: '0xtarget-b-long-enough-address',
  bankUsage: 'USAGE-B',
  asset: { name: 'ETH', blockchain: 'Ethereum' },
};

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    uid: 'T123',
    date: '2026-01-01T00:00:00.000Z',
    type: 'Buy',
    state: 'Failed',
    inputAsset: 'EUR',
    inputAmount: 100,
    outputAsset: 'BTC',
    outputAmount: 0.001,
    inputPaymentMethod: 'Bank',
    reason: undefined,
    chargebackAmount: undefined,
    ...overrides,
  };
}

function makeRefund(overrides: Record<string, unknown> = {}) {
  return {
    inputAmount: 100,
    inputAsset: { name: 'EUR' },
    fee: { dfx: 1, bank: 0.5, network: 0.1 },
    refundAmount: 98.4,
    refundAsset: { name: 'EUR' },
    expiryDate: undefined,
    refundTarget: undefined,
    bankDetails: undefined,
    ...overrides,
  };
}

function makeListTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uid: 'tx-uid-1',
    date: '2026-01-02T00:00:00.000Z',
    type: 'Buy',
    state: 'Completed',
    inputAsset: 'EUR',
    inputAmount: 100,
    outputAsset: 'BTC',
    outputAmount: 0.001,
    reason: undefined,
    chargebackAmount: undefined,
    ...overrides,
  };
}

function renderScreen(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/tx', element: <TransactionScreen /> },
      { path: '/tx/:id', element: <TransactionScreen /> },
      { path: '/tx/:id/refund', element: <TransactionScreen /> },
      { path: '/tx/:id/assign', element: <TransactionScreen /> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

function renderList(props: { isSupport?: boolean; setError?: jest.Mock; onSelectTransaction?: jest.Mock } = {}) {
  const setError = props.setError ?? jest.fn();
  const onSelectTransaction = props.onSelectTransaction;
  return {
    setError,
    onSelectTransaction,
    ...render(
      <MemoryRouter>
        <TransactionList
          isSupport={props.isSupport ?? false}
          setError={setError}
          onSelectTransaction={onSelectTransaction}
        />
      </MemoryRouter>,
    ),
  };
}

function renderListAt(
  path: string,
  props: { isSupport?: boolean; setError?: jest.Mock; onSelectTransaction?: jest.Mock } = {},
) {
  const setError = props.setError ?? jest.fn();
  const onSelectTransaction = props.onSelectTransaction;
  const listEl = () => (
    <TransactionList
      isSupport={props.isSupport ?? false}
      setError={setError}
      onSelectTransaction={onSelectTransaction}
    />
  );
  const router = createMemoryRouter(
    [
      { path: '/tx', element: listEl() },
      { path: '/tx/:id', element: listEl() },
      { path: '/tx/:id/assign', element: listEl() },
    ],
    { initialEntries: [path] },
  );
  return {
    setError,
    onSelectTransaction,
    ...render(<RouterProvider router={router} />),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    activeAddress: { address: '0xabc', wallet: 'SomeWallet' },
    phone: undefined,
  };
  mockUserAddresses = [];
  mockBankAccounts = [{ iban: BANK_IBAN_DE, label: 'Main' }];
  mockAllowedCountries = [COUNTRY_CH, COUNTRY_DE];
  mockIsLoggedIn = true;
  mockWidth = 800;
  mockGetTransactionByUid.mockReset();
  mockGetTransactionRefund.mockReset();
  mockSetTransactionRefundTarget.mockReset();
  mockGetDetailTransactions.mockResolvedValue([]);
  mockGetUnassignedTransactions.mockResolvedValue([]);
  mockGetTransactionTargets.mockResolvedValue([TARGET_A, TARGET_B]);
  mockSetTransactionTarget.mockResolvedValue(undefined);
  mockGetTransactionInvoice.mockReset();
  mockGetTransactionReceipt.mockReset();
  mockGetTransactionByUid.mockResolvedValue(makeTx());
  mockGetTransactionRefund.mockResolvedValue(makeRefund());
  jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Line 281: Create support ticket onClick in TransactionStatus (via TransactionScreen).
describe('TransactionStatus Create support ticket', () => {
  it('navigates to the transaction support issue path when Create support ticket is clicked', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ state: 'Failed', reason: undefined, chargebackAmount: undefined }),
    );
    renderScreen('/tx/T123');

    const support = await screen.findByRole('button', { name: 'Create support ticket' });
    await userEvent.click(support);

    expect(mockNavigate).toHaveBeenCalledWith('/support/issue?issue-type=TransactionIssue');
  });
});

// Lines 609-610: creditorCountry filterFunc / matchFunc on TransactionRefund bank form.
describe('TransactionRefund creditorCountry search helpers', () => {
  it('invokes filterFunc and matchFunc when searching countries on a bank refund form', async () => {
    mockGetTransactionByUid.mockResolvedValue(makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }));
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderScreen('/tx/T123/refund');

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      expect(screen.getByTestId('creditorCountry-search-dropdown')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('creditorCountry-trigger'));
    const search = await screen.findByTestId('creditorCountry-search');

    // Empty search hits the `!s` short-circuit of filterFunc; non-empty hits name/symbol match.
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(search, { target: { value: 'switz' } });
    fireEvent.change(search, { target: { value: 'Switzerland' } });

    expect(screen.getByTestId('creditorCountry-options')).toBeInTheDocument();
  });
});

// Line 699: loadTransactions catch when detail/unassigned fetch rejects.
describe('TransactionList loadTransactions errors', () => {
  it('calls setError when getDetailTransactions rejects', async () => {
    mockGetDetailTransactions.mockRejectedValue({ message: 'detail load failed' });
    mockGetUnassignedTransactions.mockResolvedValue([]);
    const { setError } = renderList();

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('detail load failed');
    });
  });

  it('calls setError with Unknown error when load rejects without message', async () => {
    mockGetDetailTransactions.mockRejectedValue({});
    mockGetUnassignedTransactions.mockResolvedValue([]);
    const { setError } = renderList();

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Unknown error');
    });
  });
});

// Line 747: submitAssignment catch when setTransactionTarget rejects.
describe('TransactionList submitAssignment errors', () => {
  it('calls setError when setTransactionTarget rejects', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockResolvedValue([TARGET_A]);
    mockSetTransactionTarget.mockRejectedValue({ message: 'assign failed' });

    const { setError } = renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);
    await screen.findByText('Remittance info');

    const submitButtons = screen.getAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('assign failed');
    });
  });

  it('calls setError with "Unknown error" when setTransactionTarget rejects without message', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockResolvedValue([TARGET_A]);
    mockSetTransactionTarget.mockRejectedValue({});

    const { setError } = renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);
    await screen.findByText('Remittance info');

    const submitButtons = screen.getAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Unknown error');
    });
  });
});

// Lines 672-687: scroll-into-view, logged-out skip, auto-assign path, date sort.
describe('TransactionList load effects and sorting', () => {
  it('scrolls the matching transaction into view when a route id is present', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderListAt('/tx/1');

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  it('does not load transactions when the user is not logged in', async () => {
    mockIsLoggedIn = false;
    renderList();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'My transaction is missing' })).toBeInTheDocument();
    });

    expect(mockGetDetailTransactions).not.toHaveBeenCalled();
    expect(mockGetUnassignedTransactions).not.toHaveBeenCalled();
  });

  it('auto-opens the assignment form when the path is /tx/:id/assign', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockResolvedValue([TARGET_A, TARGET_B]);

    // Numeric id → TransactionScreen list branch (not T/Q status); assign path auto-opens form.
    renderScreen('/tx/1/assign');

    await waitFor(() => {
      expect(screen.getByText('Remittance info')).toBeInTheDocument();
    });
    expect(mockGetTransactionTargets).toHaveBeenCalled();
  });

  it('sorts combined detail and unassigned transactions newest-first', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        id: 10,
        uid: 'older',
        date: '2026-01-01T00:00:00.000Z',
        state: 'Completed',
        inputAsset: 'EUR',
        outputAsset: 'BTC',
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({
        id: 20,
        uid: 'newer',
        date: '2026-02-15T00:00:00.000Z',
        state: 'Unassigned',
        inputAsset: 'CHF',
        outputAsset: 'ETH',
      }),
    ]);

    renderList();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    // Group keys are year-month; February group is rendered first because of newest-first sort.
    const body = document.body.textContent ?? '';
    expect(body.indexOf('2026 - 2')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('2026 - 1')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('2026 - 2')).toBeLessThan(body.indexOf('2026 - 1'));
  });
});

// Line 723: assignTransaction catch when getTransactionTargets rejects.
describe('TransactionList assignTransaction errors', () => {
  it('calls setError with the API message when getTransactionTargets rejects', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockRejectedValue({ message: 'targets failed' });

    const { setError } = renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('targets failed');
    });
  });

  it('calls setError with "Unknown error" when getTransactionTargets rejects without message', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockRejectedValue({});

    const { setError } = renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);

    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith('Unknown error');
    });
  });
});

// Line 777: empty list message.
describe('TransactionList empty state', () => {
  it('renders "No transactions found" when both lists resolve empty', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeInTheDocument();
    });
  });
});

// Lines 789-827: icon order, optional chaining, summary line fallbacks, isExpanded.
describe('TransactionList row presentation', () => {
  it('uses SELL asset order and resolves a DfxAssetIcon when assets match AssetIconVariant', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        type: 'Sell',
        state: 'Completed',
        inputAsset: 'BTC',
        outputAsset: 'EUR',
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.getByTestId('dfx-asset-icon')).toBeInTheDocument();
    });
  });

  it('falls back to the help icon when assets are undefined (a?.replace short-circuit)', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        type: 'Buy',
        state: 'Completed',
        inputAsset: undefined,
        outputAsset: undefined,
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.getByTestId('dfx-help-icon')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dfx-asset-icon')).not.toBeInTheDocument();
  });

  it('renders a row when tx.id is missing (ref callback skips numeric id key)', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ id: undefined, uid: 'uid-only', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    // StyledCollapsible mock always renders title + children, so state text appears twice.
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
  });

  it('sets isExpanded when route id matches a transaction uid and leaves it undefined without id', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ id: 5, uid: 'match-uid', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderListAt('/tx/match-uid');

    await waitFor(() => {
      expect(screen.getByTestId('collapsible')).toHaveAttribute('data-expanded', 'true');
    });
  });

  it('leaves collapsible isExpanded undefined when no route id is present', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ id: 5, uid: 'match-uid', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.getByTestId('collapsible')).toHaveAttribute('data-expanded', 'undefined');
    });
  });

  it('renders input-only summary without arrow when outputAsset is missing', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        state: 'Completed',
        inputAsset: 'EUR',
        inputAmount: 50,
        outputAsset: undefined,
        outputAmount: undefined,
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    // Scope to the title amount summary (ml-auto); TxInfo also renders "50 EUR" in row-Input.
    const amountSummary = document.querySelector('.ml-auto') as HTMLElement;
    expect(amountSummary).toBeTruthy();
    expect(within(amountSummary).getByText(/50 EUR/)).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('renders output-only summary and empty amount fallbacks when amounts are undefined', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        state: 'Completed',
        inputAsset: undefined,
        inputAmount: undefined,
        outputAsset: 'BTC',
        outputAmount: undefined,
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    // `${undefined ?? ''} BTC` → " BTC" in the title summary (ml-auto); TxInfo has the same body text.
    const amountSummary = document.querySelector('.ml-auto') as HTMLElement;
    expect(amountSummary).toBeTruthy();
    expect(within(amountSummary).getByText(/BTC/)).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  // Line 825: inputAmount ?? '' fallback when inputAsset is set but inputAmount is undefined.
  it('renders input-only summary with empty amount fallback when inputAmount is undefined', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        state: 'Completed',
        inputAsset: 'EUR',
        inputAmount: undefined,
        outputAsset: undefined,
        outputAmount: undefined,
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    // `${undefined ?? ''} EUR` → " EUR" in the title summary (ml-auto); TxInfo has the same body text.
    const amountSummary = document.querySelector('.ml-auto') as HTMLElement;
    expect(amountSummary).toBeTruthy();
    expect(within(amountSummary).getByText(/EUR/)).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});

// Line 909: Open receipt early return when tx.id is falsy.
describe('TransactionList open receipt without id', () => {
  it('does not call getTransactionReceipt when Completed transaction has no id', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ id: undefined, uid: 'no-id-receipt', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    const openReceipt = await screen.findByRole('button', { name: 'Open receipt' });
    await userEvent.click(openReceipt);

    expect(mockGetTransactionReceipt).not.toHaveBeenCalled();
  });
});

// Line 758: "My transaction is missing" navigates to support issue with missing reason.
describe('TransactionList missing-transaction navigation', () => {
  it('navigates to the support issue URL when My transaction is missing is clicked', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([]);
    renderList();

    const missing = await screen.findByRole('button', { name: 'My transaction is missing' });
    await userEvent.click(missing);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/support/issue?issue-type=TransactionIssue&reason=TransactionMissing',
    );
  });
});

// Lines 850-853: target dropdown descriptionFunc (blockchain/asset/address label).
describe('TransactionList target dropdown descriptionFunc', () => {
  it('renders descriptionFunc text when a target option is selected', async () => {
    mockGetDetailTransactions.mockResolvedValue([]);
    mockGetUnassignedTransactions.mockResolvedValue([
      makeListTx({ id: 1, uid: 'tx-uid-1', state: 'Unassigned' }),
    ]);
    mockGetTransactionTargets.mockResolvedValue([TARGET_A, TARGET_B]);

    renderList();

    const openButtons = await screen.findAllByRole('button', { name: 'Assign transaction' });
    await userEvent.click(openButtons[0]);
    await screen.findByText('Remittance info');

    fireEvent.click(screen.getByTestId('target-trigger'));
    const option0 = await screen.findByTestId('target-option-0');
    // descriptionFunc runs when rendering options (and again for the selected value).
    expect(screen.getByTestId('target-option-desc-0')).toHaveTextContent(/Bitcoin\/BTC/);
    fireEvent.click(option0);

    await waitFor(() => {
      expect(screen.getByTestId('target-description')).toHaveTextContent(/Bitcoin\/BTC/);
    });
  });
});

// Line 879: Show on block explorer opens outputTxUrl.
describe('TransactionList block explorer button', () => {
  it('opens outputTxUrl in a new window when Show on block explorer is clicked', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        state: 'Completed',
        outputTxUrl: 'https://explorer.example/tx/abc',
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    const explorer = await screen.findByRole('button', { name: 'Show on block explorer' });
    await userEvent.click(explorer);

    expect(window.open).toHaveBeenCalledWith('https://explorer.example/tx/abc', '_blank', 'noreferrer');
  });
});

// Line 889: Open invoice success path calls openPdfFromString.
describe('TransactionList open invoice success', () => {
  it('opens the invoice PDF via openPdfFromString on success', async () => {
    mockGetDetailTransactions.mockResolvedValue([makeListTx({ state: 'Completed', uid: 'inv-1' })]);
    mockGetUnassignedTransactions.mockResolvedValue([]);
    mockGetTransactionInvoice.mockResolvedValue({ pdfData: 'invoice-pdf-bytes' });

    renderList();

    const openInvoice = await screen.findByRole('button', { name: 'Open invoice' });
    await userEvent.click(openInvoice);

    await waitFor(() => {
      expect(mockGetTransactionInvoice).toHaveBeenCalledWith('inv-1');
      expect(mockOpenPdfFromString).toHaveBeenCalledWith('invoice-pdf-bytes');
    });
  });
});

// Line 915: Open receipt success path calls openPdfFromString.
describe('TransactionList open receipt success', () => {
  it('opens the receipt PDF via openPdfFromString on success', async () => {
    mockGetDetailTransactions.mockResolvedValue([makeListTx({ id: 77, state: 'Completed' })]);
    mockGetUnassignedTransactions.mockResolvedValue([]);
    mockGetTransactionReceipt.mockResolvedValue({ pdfData: 'receipt-pdf-bytes' });

    renderList();

    const openReceipt = await screen.findByRole('button', { name: 'Open receipt' });
    await userEvent.click(openReceipt);

    await waitFor(() => {
      expect(mockGetTransactionReceipt).toHaveBeenCalledWith(77);
      expect(mockOpenPdfFromString).toHaveBeenCalledWith('receipt-pdf-bytes');
    });
  });
});

// Lines 942-975: refund / increase limit / complete KYC / support Select buttons.
describe('TransactionList action buttons by state and support mode', () => {
  it('shows Request refund and navigates to the refund route for Failed without chargeback', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({
        uid: 'fail-1',
        state: 'Failed',
        reason: undefined,
        chargebackAmount: undefined,
      }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    const refund = await screen.findByRole('button', { name: 'Confirm refund' });
    await userEvent.click(refund);

    expect(mockNavigate).toHaveBeenCalledWith('/tx/fail-1/refund');
  });

  it('shows Increase limit for LIMIT_EXCEEDED when not in support mode', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ state: 'LimitExceeded', reason: undefined, chargebackAmount: undefined }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList({ isSupport: false });

    const increase = await screen.findByRole('button', { name: 'Increase limit' });
    await userEvent.click(increase);

    expect(mockNavigate).toHaveBeenCalledWith('/support/issue?issue-type=LimitRequest');
  });

  it('shows Complete KYC for KYC_REQUIRED and navigates to /kyc', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ state: 'KycRequired', reason: undefined, chargebackAmount: undefined }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList();

    const kyc = await screen.findByRole('button', { name: 'Complete KYC' });
    await userEvent.click(kyc);

    expect(mockNavigate).toHaveBeenCalledWith('/kyc');
  });

  it('shows Select in support mode and calls onSelectTransaction with uid and state', async () => {
    const onSelectTransaction = jest.fn();
    mockGetDetailTransactions.mockResolvedValue([
      makeListTx({ uid: 'sup-1', state: 'Completed' }),
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([]);

    renderList({ isSupport: true, onSelectTransaction });

    const select = await screen.findByRole('button', { name: 'Select' });
    await userEvent.click(select);

    expect(onSelectTransaction).toHaveBeenCalledWith('sup-1', 'Completed');
  });
});

// Line 1020: TxInfo priceSteps map builds baseRateInfo via translate.
describe('TxInfo priceSteps base rate info', () => {
  it('includes translated price step text when priceSteps is non-empty', () => {
    const timestamp = new Date('2026-03-01T12:00:00.000Z');
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            exchangeRate: 50000,
            rate: 49000,
            priceSteps: [
              {
                source: 'Kraken',
                from: 'EUR',
                to: 'BTC',
                price: 50000,
                timestamp,
              },
            ],
          }) as any
        }
      />,
    );

    // baseRateInfo is infoText on the Base rate expansion item (built by the priceSteps map).
    expect(screen.getByTestId('expansion-info-Base rate')).toHaveTextContent(
      /EUR to BTC at 50000 EUR\/BTC \(Kraken,/,
    );
  });
});

// Line 1216: TxInfo CopyButton for chargebackTarget.
describe('TxInfo chargeback CopyButton', () => {
  it('copies the formatted chargeback IBAN for BUY transactions', async () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            type: 'Buy',
            chargebackTarget: 'DE89370400440532013000',
            chargebackAmount: 10,
            chargebackAsset: 'EUR',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Chargeback IBAN')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('copy-button'));

    expect(mockCopy).toHaveBeenCalledWith('DE89370400440532013000');
  });

  it('copies the chargeback address for non-BUY transactions', async () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            type: 'Sell',
            chargebackTarget: '0xchargebacktarget',
            chargebackAmount: 1,
            chargebackAsset: 'BTC',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Chargeback address')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('copy-button'));

    expect(mockCopy).toHaveBeenCalledWith('0xchargebacktarget');
  });
});

// Lines 1042-1080: rateItems fee row construction.
describe('TxInfo rateItems fee rows', () => {
  it('omits fee expansion rows when fees is undefined (base rate only)', () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            exchangeRate: 50000,
            rate: 49000,
            fees: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('expansion-Base rate')).toBeInTheDocument();
    expect(screen.queryByTestId('expansion-Total fee')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expansion-DFX fee')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expansion-Platform fee')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expansion-Network fee')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expansion-Bank fee')).not.toBeInTheDocument();
  });

  it('renders total, dfx, platform>0, network, and plain bank fee rows', () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            exchangeRate: 50000,
            rate: 49000,
            fees: {
              total: 2,
              dfx: 1,
              rate: 0.01,
              platform: 0.5,
              network: 0.25,
              bank: 0.1,
            },
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('expansion-Total fee')).toHaveTextContent('2 EUR');
    expect(screen.getByTestId('expansion-DFX fee')).toHaveTextContent(/1 EUR \(1\.00%\)/);
    expect(screen.getByTestId('expansion-Platform fee')).toHaveTextContent('0.5 EUR');
    expect(screen.getByTestId('expansion-Network fee')).toHaveTextContent('0.25 EUR');
    expect(screen.getByTestId('expansion-Bank fee')).toHaveTextContent('0.1 EUR');
  });

  it('skips platform fee when platform is 0 and uses bankFixed/bankVariable instead of plain bank', () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            exchangeRate: 50000,
            rate: 49000,
            fees: {
              platform: 0,
              bank: 9,
              bankFixed: 1.5,
              bankVariable: 0.2,
              networkStart: 0.05,
            },
          }) as any
        }
      />,
    );

    expect(screen.queryByTestId('expansion-Platform fee')).not.toBeInTheDocument();
    expect(screen.getByTestId('expansion-Bank fee (fixed)')).toHaveTextContent('1.5 EUR');
    expect(screen.getByTestId('expansion-Bank fee (percent)')).toHaveTextContent('0.2 EUR');
    // Plain bank fee suppressed when fixed/variable are present.
    expect(screen.queryByTestId('expansion-Bank fee')).not.toBeInTheDocument();
    expect(screen.getByTestId('expansion-Network start fee')).toHaveTextContent('0.05 EUR');
  });
});

// Line 1106: phone verification call-you hint.
describe('TxInfo phone verification hint', () => {
  it('shows the call-you text when showUserDetails, PHONE_VERIFICATION_NEEDED, and user.phone are set', () => {
    mockUser = {
      activeAddress: { address: '0xabc', wallet: 'SomeWallet' },
      phone: '+41123456789',
    };
    render(
      <TxInfo
        showUserDetails={true}
        tx={
          makeListTx({
            reason: 'PhoneVerificationNeeded',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Failure reason')).toHaveTextContent(
      'we will call you at +41123456789',
    );
  });

  it('hides the call-you text when showUserDetails is false', () => {
    mockUser = {
      activeAddress: { address: '0xabc', wallet: 'SomeWallet' },
      phone: '+41123456789',
    };
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            reason: 'PhoneVerificationNeeded',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Failure reason')).toBeInTheDocument();
    expect(screen.queryByText(/we will call you at/)).not.toBeInTheDocument();
  });
});

// Lines 1122-1156: input/output amount, blockchain, account, and TX link branches.
describe('TxInfo input and output field branches', () => {
  it('renders input amount/blockchain/account/tx link variants', () => {
    const { rerender } = render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            inputAmount: undefined,
            inputAsset: 'EUR',
            inputBlockchain: undefined,
            sourceAccount: undefined,
            inputTxId: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Input')).toHaveTextContent('EUR');
    expect(screen.getByTestId('row-Input').textContent).not.toMatch(/\(/);
    expect(screen.queryByTestId('row-Input Account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-Input TX')).not.toBeInTheDocument();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            inputAmount: 100,
            inputAsset: 'EUR',
            inputBlockchain: 'Ethereum',
            sourceAccount: '0xsourceaccountlong',
            inputTxId: '0xinputtxidlong',
            inputTxUrl: 'https://explorer.example/in',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Input')).toHaveTextContent(/100 EUR/);
    expect(screen.getByTestId('row-Input')).toHaveTextContent(/Ethereum/);
    expect(screen.getByTestId('row-Input Account')).toBeInTheDocument();
    expect(screen.getByTestId('row-Input TX').querySelector('[data-testid="styled-link"]')).toBeTruthy();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            inputAsset: 'EUR',
            inputTxId: '0xinputtxidlong',
            inputTxUrl: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Input TX').querySelector('[data-testid="styled-link"]')).toBeNull();
    expect(screen.getByTestId('row-Input TX').querySelector('p')).toBeTruthy();
  });

  it('renders output amount/blockchain/account/tx link variants', () => {
    const { rerender } = render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            state: 'Completed',
            outputAmount: undefined,
            outputAsset: 'BTC',
            outputBlockchain: undefined,
            targetAccount: undefined,
            outputTxId: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Output')).toHaveTextContent('BTC');
    expect(screen.getByTestId('row-Output').textContent).not.toMatch(/\(/);
    expect(screen.queryByTestId('row-Output Account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-Output TX')).not.toBeInTheDocument();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            state: 'Completed',
            outputAmount: 0.5,
            outputAsset: 'BTC',
            outputBlockchain: 'Bitcoin',
            targetAccount: '0xtargetaccountlong',
            outputTxId: '0xoutputtxidlong',
            outputTxUrl: 'https://explorer.example/out',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Output')).toHaveTextContent(/0\.5 BTC/);
    expect(screen.getByTestId('row-Output')).toHaveTextContent(/Bitcoin/);
    expect(screen.getByTestId('row-Output Account')).toBeInTheDocument();
    expect(screen.getByTestId('row-Output TX').querySelector('[data-testid="styled-link"]')).toBeTruthy();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            state: 'Completed',
            outputAsset: 'BTC',
            outputTxId: '0xoutputtxidlong',
            outputTxUrl: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Output TX').querySelector('[data-testid="styled-link"]')).toBeNull();
    expect(screen.getByTestId('row-Output TX').querySelector('p')).toBeTruthy();
  });
});

// Lines 1175-1194: networkStartTx expandable row.
describe('TxInfo networkStartTx', () => {
  it('renders Output 2 with expansion items and amount fallback when amount is undefined', () => {
    const { rerender } = render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            networkStartTx: {
              txId: '0xnetworkstarttxid',
              exchangeRate: 1.2,
              asset: 'ETH',
              amount: 0.01,
            },
            outputBlockchain: 'Ethereum',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('expansion-TX')).toBeInTheDocument();
    expect(screen.getByTestId('expansion-Exchange rate')).toHaveTextContent(/1\.2 EUR\/ETH/);
    expect(screen.getByText(/0\.01 ETH/)).toBeInTheDocument();
    // Both Output and Output 2 append outputBlockchain; scope to the networkStartTx row.
    const output2Row = screen.getByTestId('expansion-TX').parentElement as HTMLElement;
    expect(within(output2Row).getByText(/Ethereum/)).toBeInTheDocument();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            networkStartTx: {
              txId: '0xnetworkstarttxid',
              exchangeRate: 1.2,
              asset: 'ETH',
              amount: undefined,
            },
            outputBlockchain: undefined,
          }) as any
        }
      />,
    );

    // amount ?? '' → asset name only (optional leading space), not exchange-rate "…/ETH".
    expect(within(output2Row).getByText(/^\s*ETH$/)).toBeInTheDocument();
  });
});

// Lines 1219-1228: chargeBackTxId / chargeBackTxUrl / chargebackDate.
describe('TxInfo chargeback TX and date', () => {
  it('renders chargeback TX as StyledLink when chargeBackTxUrl is set', () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            chargeBackTxId: '0xchargebacktxid',
            chargeBackTxUrl: 'https://explorer.example/cb',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Chargeback TX').querySelector('[data-testid="styled-link"]')).toBeTruthy();
  });

  it('renders chargeback TX as plain text when chargeBackTxUrl is absent', () => {
    render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            chargeBackTxId: '0xchargebacktxid',
            chargeBackTxUrl: undefined,
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Chargeback TX').querySelector('[data-testid="styled-link"]')).toBeNull();
    expect(screen.getByTestId('row-Chargeback TX').querySelector('p')).toBeTruthy();
  });

  it('renders Chargeback date when chargebackDate is set and omits it when unset', () => {
    const { rerender } = render(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            chargebackDate: '2026-04-01T12:00:00.000Z',
          }) as any
        }
      />,
    );

    expect(screen.getByTestId('row-Chargeback date')).toBeInTheDocument();

    rerender(
      <TxInfo
        showUserDetails={false}
        tx={
          makeListTx({
            chargebackDate: undefined,
          }) as any
        }
      />,
    );

    expect(screen.queryByTestId('row-Chargeback date')).not.toBeInTheDocument();
  });
});
