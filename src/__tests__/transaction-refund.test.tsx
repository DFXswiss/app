// Component tests for TransactionRefund (transaction.screen.tsx): load/refund fetch,
// expiry refetch timers, address filtering, onSubmit combinations, Add bank account
// branch, and rendered bank-detail / form conditionals.

const mockGetTransactionByUid = jest.fn();
const mockGetTransactionRefund = jest.fn();
const mockSetTransactionRefundTarget = jest.fn();
const mockNavigate = jest.fn();
const mockUseLayoutOptions = jest.fn();

let mockUser: any = { activeAddress: { address: '0xabc', wallet: 'SomeWallet' } };
let mockUserAddresses: any[] = [];
let mockBankAccounts: any[] = [];
let mockAllowedCountries: any[] = [];
let mockIsLoggedIn = true;
let mockWidth = 800;

jest.mock('@dfx.swiss/react', () => {
  const Utils = {
    formatIban: (v: any) => v,
    formatAmount: (n: any) => String(n),
    // Passthrough that drops undefined field rules and merges array-of-rule-objects
    // (e.g. ZipValidation) into a single RHF rules object — matches real Utils.createRules.
    createRules: (rules: Record<string, any>) => {
      const out: Record<string, any> = {};
      for (const key of Object.keys(rules)) {
        const value = rules[key];
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          out[key] = value.reduce((prev: any, curr: any) => (curr ? { ...prev, ...curr } : prev), {});
        } else {
          out[key] = value;
        }
      }
      return out;
    },
  };

  const Validations = {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
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
      getDetailTransactions: jest.fn(),
      getUnassignedTransactions: jest.fn(),
      getTransactionTargets: jest.fn(),
      setTransactionTarget: jest.fn(),
      getTransactionInvoice: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getTransactionCsv: jest.fn(),
      getTransactionHistory: jest.fn(),
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
                    labelFunc(item),
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
                    labelFunc(item),
                  ),
                ),
              )
            : null,
          error ? React.createElement('p', null, error.message) : null,
        ),
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
    StyledDataTableExpandableRow: ({ children }: any) => React.createElement('div', null, children),
    StyledCollapsible: ({ titleContent, children }: any) =>
      React.createElement('div', null, titleContent, children),
    StyledIconButton: () => null,
    DfxAssetIcon: () => null,
    DfxIcon: () => null,
    CopyButton: () => null,
    StyledLink: ({ label, children }: any) => React.createElement('div', null, label ?? children),
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
    AssetIconVariant: {},
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
  useAppHandlingContext: () => ({ setRedirectPath: jest.fn() }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, k: string) => k,
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
  AddBankAccount: ({ onSubmit, confirmationText }: any) => (
    <div data-testid="add-bank-account">
      <p data-testid="add-bank-confirmation">{confirmationText}</p>
      <button
        type="button"
        data-testid="add-bank-submit"
        onClick={() => onSubmit({ iban: 'LI21088110104928' })}
      >
        Confirm new bank account
      </button>
    </div>
  ),
}));

jest.mock('../util/utils', () => ({
  ...jest.requireActual('../util/utils'),
  openPdfFromString: jest.fn(),
}));

// Keep real ZipValidation (array of Required + length rule) so bank-refund isValid is observable.

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('../screens/transaction.screen', () => {
  const React = require('react');
  const actual = jest.requireActual('../screens/transaction.screen');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    TransactionList: () => React.createElement('div', { 'data-testid': 'transaction-list' }),
    TxInfo: () => React.createElement('div', { 'data-testid': 'tx-info' }),
  };
});

import { Utils } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import TransactionScreen from '../screens/transaction.screen';

const COUNTRY_CH = { symbol: 'CH', name: 'Switzerland' };
const COUNTRY_DE = { symbol: 'DE', name: 'Germany' };

const BANK_IBAN_DE = 'DE89370400440532013000';
const BANK_IBAN_CH = 'CH9300762011623852957';

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
    inputBlockchain: undefined,
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

function renderRefund(path = '/tx/T123/refund', state?: Record<string, unknown>) {
  const router = createMemoryRouter(
    [
      { path: '/tx', element: <TransactionScreen /> },
      { path: '/tx/:id', element: <TransactionScreen /> },
      { path: '/tx/:id/refund', element: <TransactionScreen /> },
    ],
    {
      initialEntries: state ? [{ pathname: path, state }] : [path],
    },
  );
  return render(<RouterProvider router={router} />);
}

async function waitForRefundFormLoaded() {
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });
  expect(screen.getByText('Transaction amount')).toBeInTheDocument();
}

function changeAndBlur(testId: string, value: string) {
  const input = screen.getByTestId(testId);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function selectDropdownOption(name: string, optionIndex: number) {
  fireEvent.click(screen.getByTestId(`${name}-trigger`));
  fireEvent.click(screen.getByTestId(`${name}-option-${optionIndex}`));
  fireEvent.blur(screen.getByTestId(`${name}-trigger`));
}

async function fillBankCreditorFields(options?: { houseNumber?: string; name?: string }) {
  const name = options?.name ?? 'Jane Doe';
  const houseNumber = options?.houseNumber ?? '12';

  if (screen.queryByTestId('creditorName')) {
    changeAndBlur('creditorName', name);
  }
  changeAndBlur('creditorStreet', 'Main Street');
  changeAndBlur('creditorHouseNumber', houseNumber);
  changeAndBlur('creditorZip', '8000');
  changeAndBlur('creditorCity', 'Zurich');
  selectDropdownOption('creditorCountry', 0);

  await waitFor(() => {
    expect(screen.getByTestId('creditorCountry-trigger')).toHaveTextContent('Switzerland');
  });
}

async function fillBankRefundForm(options?: { ibanIndex?: number; houseNumber?: string; name?: string }) {
  if (screen.queryByTestId('iban-dropdown')) {
    selectDropdownOption('iban', options?.ibanIndex ?? 0);
  }
  await fillBankCreditorFields(options);
}

async function waitForSubmitEnabled(label: string | RegExp = /refund/i) {
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: label });
    expect(btn).not.toBeDisabled();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { activeAddress: { address: '0xabc', wallet: 'SomeWallet' } };
  mockUserAddresses = [];
  mockBankAccounts = [
    { iban: BANK_IBAN_DE, label: 'Main' },
    { iban: BANK_IBAN_CH, label: 'Savings' },
  ];
  mockAllowedCountries = [COUNTRY_CH, COUNTRY_DE];
  mockIsLoggedIn = true;
  mockWidth = 800;
  mockGetTransactionByUid.mockReset();
  mockGetTransactionRefund.mockReset();
  mockSetTransactionRefundTarget.mockReset();
  mockSetTransactionRefundTarget.mockResolvedValue(undefined);
  mockGetTransactionByUid.mockResolvedValue(makeTx());
  mockGetTransactionRefund.mockResolvedValue(makeRefund());
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Line 350: getTransactionByUid rejection surfaces via parent setError → ErrorHint.
describe('TransactionRefund transaction load errors', () => {
  it('calls setError with the API message when getTransactionByUid rejects', async () => {
    mockGetTransactionByUid.mockRejectedValue({ message: 'tx load failed' });
    renderRefund();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('tx load failed');
    });
    expect(mockGetTransactionRefund).not.toHaveBeenCalled();
  });

  it('calls setError with "Unknown error" when getTransactionByUid rejects without message', async () => {
    mockGetTransactionByUid.mockRejectedValue({});
    renderRefund();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });
});

// Lines 356-365: fetchRefund success, expiryDate timers (future/past), clearTimeout, errors, unmount cleanup.
describe('TransactionRefund fetchRefund', () => {
  it('loads refund details and shows the amount table on success without expiryDate', async () => {
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ expiryDate: undefined }));
    renderRefund();

    await waitForRefundFormLoaded();
    expect(mockGetTransactionRefund).toHaveBeenCalledWith(42);
    expect(screen.getByTestId('row-Transaction amount')).toHaveTextContent('100 EUR');
    expect(screen.getByTestId('row-Refund amount')).toHaveTextContent('98.4 EUR');
  });

  it('schedules a refetch when expiryDate is in the future and refetches after the timeout', async () => {
    jest.useFakeTimers();
    const future = new Date(Date.now() + 5000).toISOString();
    mockGetTransactionRefund
      .mockResolvedValueOnce(makeRefund({ expiryDate: future, refundAmount: 98.4 }))
      .mockResolvedValueOnce(makeRefund({ expiryDate: undefined, refundAmount: 97 }));

    renderRefund();

    await waitFor(
      () => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByText('Transaction amount')).toBeInTheDocument();
      },
      { advanceTimers: jest.advanceTimersByTime },
    );

    expect(mockGetTransactionRefund).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await waitFor(
      () => {
        expect(mockGetTransactionRefund).toHaveBeenCalledTimes(2);
      },
      { advanceTimers: jest.advanceTimersByTime },
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('row-Refund amount')).toHaveTextContent('97 EUR');
      },
      { advanceTimers: jest.advanceTimersByTime },
    );
  });

  // Past expiryDate schedules the next fetch with delay 0, so the refetch runs immediately.
  it('refetches immediately when expiryDate is already in the past', async () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    mockGetTransactionRefund
      .mockResolvedValueOnce(makeRefund({ expiryDate: past, refundAmount: 90 }))
      .mockResolvedValue(makeRefund({ expiryDate: future, refundAmount: 90 }));

    renderRefund();

    await waitFor(() => expect(mockGetTransactionRefund).toHaveBeenCalledTimes(2));
  });

  it('clears a previous refetch timeout when a subsequent refund response also has expiryDate', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const future1 = new Date(Date.now() + 8000).toISOString();
    const future2 = new Date(Date.now() + 12_000).toISOString();

    mockGetTransactionRefund
      .mockResolvedValueOnce(makeRefund({ expiryDate: future1 }))
      .mockResolvedValueOnce(makeRefund({ expiryDate: future2 }))
      .mockResolvedValueOnce(makeRefund({ expiryDate: undefined }));

    renderRefund();

    await waitFor(
      () => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(mockGetTransactionRefund).toHaveBeenCalledTimes(1);
      },
      { advanceTimers: jest.advanceTimersByTime },
    );

    await act(async () => {
      jest.advanceTimersByTime(8000);
    });

    await waitFor(
      () => {
        expect(mockGetTransactionRefund).toHaveBeenCalledTimes(2);
      },
      { advanceTimers: jest.advanceTimersByTime },
    );

    // Second response with expiryDate re-enters the branch that clears the prior timeout id.
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('surfaces getTransactionRefund errors via setError', async () => {
    mockGetTransactionRefund.mockRejectedValue({ message: 'refund unavailable' });
    renderRefund();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('refund unavailable');
    });
  });

  it('surfaces "Unknown error" when getTransactionRefund rejects without message', async () => {
    mockGetTransactionRefund.mockRejectedValue({});
    renderRefund();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });

  it('clears the pending refetch timeout on unmount', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const future = new Date(Date.now() + 30_000).toISOString();
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ expiryDate: future }));

    const { unmount } = renderRefund();

    await waitFor(
      () => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByText('Transaction amount')).toBeInTheDocument();
      },
      { advanceTimers: jest.advanceTimersByTime },
    );

    const callsBeforeUnmount = mockGetTransactionRefund.mock.calls.length;
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockGetTransactionRefund).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});

// Lines 377-383: filter userAddresses by inputBlockchain; auto-setValue when exactly one match.
describe('TransactionRefund address filtering', () => {
  it('lists multiple matching addresses for a crypto refund and does not auto-select', async () => {
    mockUserAddresses = [
      { address: '0xaaa111', blockchains: ['Ethereum'] },
      { address: '0xbbb222', blockchains: ['Ethereum', 'Bitcoin'] },
      { address: '0xccc333', blockchains: ['Bitcoin'] },
    ];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Sell', inputPaymentMethod: 'Crypto', inputBlockchain: 'Ethereum' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    fireEvent.click(screen.getByTestId('address-trigger'));
    const options = within(screen.getByTestId('address-options')).getAllByRole('button');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(/0xaaa/);
    expect(options[1]).toHaveTextContent(/0xbbb/);
  });

  it('auto-selects the only matching address via setValue when exactly one is allowed', async () => {
    mockUserAddresses = [
      { address: '0xonlymatch', blockchains: ['Bitcoin'] },
      { address: '0xother', blockchains: ['Ethereum'] },
    ];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Sell', inputPaymentMethod: 'Crypto', inputBlockchain: 'Bitcoin' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    await waitFor(() => {
      expect(screen.getByTestId('address-trigger')).toHaveTextContent(/0xonlymatch/);
    });
  });
});

// Lines 385-428: onSubmit combinations (bank buy, card buy, crypto, refundName, houseNumber, errors).
describe('TransactionRefund onSubmit', () => {
  it('submits a bank buy refund with form target, creditor data, house number, and navigates to /tx', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined, bankDetails: undefined }));
    mockSetTransactionRefundTarget.mockResolvedValue(undefined);

    renderRefund();
    await waitForRefundFormLoaded();
    await fillBankRefundForm({ ibanIndex: 0, houseNumber: '12', name: 'Jane Doe' });
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, {
        refundTarget: BANK_IBAN_DE,
        creditorData: {
          name: 'Jane Doe',
          address: 'Main Street',
          houseNumber: '12',
          zip: '8000',
          city: 'Zurich',
          country: 'CH',
        },
      });
      expect(mockNavigate).toHaveBeenCalledWith('/tx');
    });
  });

  it('omits houseNumber when the house number field is left empty', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();
    await fillBankRefundForm({ houseNumber: '' });
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalled();
    });
    const payload = mockSetTransactionRefundTarget.mock.calls[0][1];
    expect(payload.creditorData.houseNumber).toBeUndefined();
  });

  it('uses bankDetails.name as refundName when refundTarget is fixed and bank name is present', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        refundTarget: BANK_IBAN_DE,
        bankDetails: {
          name: 'Fixed Bank Name',
          address: 'Bank St',
          houseNumber: '1',
          zip: '8000',
          city: 'Zurich',
          country: 'CH',
          iban: BANK_IBAN_DE,
          bic: 'UBSWCHZH80A',
        },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    // Name input hidden when bankDetails.name and refundTarget are both set.
    expect(screen.queryByTestId('creditorName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('iban-dropdown')).not.toBeInTheDocument();

    changeAndBlur('creditorStreet', 'Side Street');
    changeAndBlur('creditorHouseNumber', '3');
    changeAndBlur('creditorZip', '8001');
    changeAndBlur('creditorCity', 'Bern');
    selectDropdownOption('creditorCountry', 0);
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, {
        refundTarget: undefined,
        creditorData: {
          name: 'Fixed Bank Name',
          address: 'Side Street',
          houseNumber: '3',
          zip: '8001',
          city: 'Bern',
          country: 'CH',
        },
      });
    });
  });

  it('falls back to creditorName when refundTarget is fixed but bankDetails.name is missing', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        refundTarget: BANK_IBAN_CH,
        bankDetails: { iban: BANK_IBAN_CH, bic: 'POFICHBE' },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('creditorName')).toBeInTheDocument();
    await fillBankCreditorFields({ name: 'Fallback Name' });
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalled();
    });
    const payload = mockSetTransactionRefundTarget.mock.calls[0][1];
    expect(payload.refundTarget).toBeUndefined();
    expect(payload.creditorData.name).toBe('Fallback Name');
  });

  it('submits a card buy refund without refundTarget or creditorData', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Card', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    // Card path hides bank form fields entirely.
    expect(screen.queryByTestId('iban-dropdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('creditorName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('creditorStreet')).not.toBeInTheDocument();

    await waitForSubmitEnabled('Confirm refund');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, {
        refundTarget: undefined,
        creditorData: undefined,
      });
      expect(mockNavigate).toHaveBeenCalledWith('/tx');
    });
  });

  it('submits a crypto (non-buy) refund with the selected address as refundTarget', async () => {
    mockUserAddresses = [
      { address: '0xcrypto1', blockchains: ['Ethereum'] },
      { address: '0xcrypto2', blockchains: ['Ethereum'] },
    ];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({
        type: 'Sell',
        inputPaymentMethod: 'Crypto',
        inputBlockchain: 'Ethereum',
        state: 'Unassigned',
      }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByRole('button', { name: 'Request refund' })).toBeInTheDocument();
    selectDropdownOption('address', 1);
    await waitForSubmitEnabled('Request refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Request refund' }));
    });

    await waitFor(() => {
      expect(mockSetTransactionRefundTarget).toHaveBeenCalledWith(42, {
        refundTarget: '0xcrypto2',
        creditorData: undefined,
      });
      expect(mockNavigate).toHaveBeenCalledWith('/tx');
    });
  });

  it('keeps the form and sets localError when setTransactionRefundTarget fails with MultiAccountIban', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));
    mockSetTransactionRefundTarget.mockRejectedValue({
      message: 'MultiAccountIban is not allowed here',
    });

    renderRefund();
    await waitForRefundFormLoaded();
    await fillBankRefundForm();
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'This IBAN cannot be used for refunds. Please select a personal bank account.',
        ),
      ).toBeInTheDocument();
    });
    // Form remains (not replaced by ErrorHint).
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByText('Transaction amount')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/tx');
  });

  it('propagates non-MultiAccountIban submit errors via setError', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));
    mockSetTransactionRefundTarget.mockRejectedValue({ message: 'backend rejected refund' });

    renderRefund();
    await waitForRefundFormLoaded();
    await fillBankRefundForm();
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('backend rejected refund');
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/tx');
  });

  it('propagates "Unknown error" when submit rejects without a message', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));
    mockSetTransactionRefundTarget.mockRejectedValue({});

    renderRefund();
    await waitForRefundFormLoaded();
    await fillBankRefundForm();
    await waitForSubmitEnabled('Confirm refund');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });
});

// Lines 450-457: selectedIban === "Add bank account" renders AddBankAccount and writes IBAN back.
describe('TransactionRefund add bank account branch', () => {
  it('shows AddBankAccount when Add bank account is selected and writes the new IBAN into the form', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank', state: 'Failed' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    // bankAccounts (2) + "Add bank account" → option index 2
    fireEvent.click(screen.getByTestId('iban-trigger'));
    fireEvent.click(screen.getByTestId('iban-option-2'));

    await waitFor(() => {
      expect(screen.getByTestId('add-bank-account')).toBeInTheDocument();
    });
    expect(screen.getByTestId('add-bank-confirmation')).toHaveTextContent(
      'The bank account has been added, all transactions from this IBAN will now be associated with your account.',
    );
    expect(screen.queryByText('Transaction amount')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('add-bank-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('add-bank-account')).not.toBeInTheDocument();
      expect(screen.getByText('Transaction amount')).toBeInTheDocument();
    });
    expect(screen.getByTestId('iban-trigger')).toHaveTextContent('LI21088110104928');
  });
});

// Lines 458-610: loading spinner, bankDetails display rows, form field conditionals, button labels.
describe('TransactionRefund rendered view', () => {
  it('shows the loading spinner while transaction or refund details are missing', async () => {
    mockGetTransactionByUid.mockReturnValue(new Promise(() => {}));
    renderRefund();

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByText('Transaction amount')).not.toBeInTheDocument();
  });

  it('shows the loading spinner after transaction loads while refund is still pending', async () => {
    mockGetTransactionByUid.mockResolvedValue(makeTx());
    mockGetTransactionRefund.mockReturnValue(new Promise(() => {}));
    renderRefund();

    await waitFor(() => {
      expect(mockGetTransactionByUid).toHaveBeenCalled();
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByText('Transaction amount')).not.toBeInTheDocument();
  });

  it('renders fee rows and refund amount info text when details are loaded', async () => {
    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('row-DFX fee')).toHaveTextContent('1 EUR');
    expect(screen.getByTestId('row-Bank fee')).toHaveTextContent('0.5 EUR');
    expect(screen.getByTestId('row-Network fee')).toHaveTextContent('0.1 EUR');
    expect(screen.getByTestId('info-Refund amount')).toHaveTextContent(
      'Refund amount is the transaction amount minus the fee.',
    );
  });

  it('renders bankDetails name/address/city/country/iban/bic rows when those fields are set', async () => {
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        refundTarget: BANK_IBAN_DE,
        bankDetails: {
          name: 'Acme Corp',
          address: 'Bahnhofstrasse',
          houseNumber: '10',
          zip: '8001',
          city: 'Zurich',
          country: 'Switzerland',
          iban: BANK_IBAN_DE,
          bic: 'UBSWCHZH80A',
        },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('row-Name')).toHaveTextContent('Acme Corp');
    expect(screen.getByTestId('row-Address')).toHaveTextContent('Bahnhofstrasse 10');
    expect(screen.getByTestId('row-City')).toHaveTextContent('8001 Zurich');
    expect(screen.getByTestId('row-Country')).toHaveTextContent('Switzerland');
    expect(screen.getByTestId('row-IBAN')).toHaveTextContent(BANK_IBAN_DE);
    expect(screen.getByTestId('row-BIC')).toHaveTextContent('UBSWCHZH80A');
  });

  it('hides bankDetails name/address/city/country/iban/bic rows when bankDetails is absent', async () => {
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ bankDetails: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.queryByTestId('row-Name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-Address')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-City')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-Country')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-IBAN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-BIC')).not.toBeInTheDocument();
  });

  it('renders address row from houseNumber alone and city row from zip alone', async () => {
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        bankDetails: {
          houseNumber: '99',
          zip: '3000',
        },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('row-Address')).toHaveTextContent('99');
    expect(screen.getByTestId('row-City')).toHaveTextContent('3000');
    expect(screen.queryByTestId('row-Name')).not.toBeInTheDocument();
  });

  it('shows the address dropdown for crypto refunds without refundTarget and hides bank fields', async () => {
    mockUserAddresses = [{ address: '0xsolo', blockchains: ['Ethereum'] }];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Sell', inputPaymentMethod: 'Crypto', inputBlockchain: 'Ethereum' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('address-dropdown')).toBeInTheDocument();
    expect(screen.queryByTestId('iban-dropdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('creditorStreet')).not.toBeInTheDocument();
  });

  it('hides the address dropdown when crypto refund already has a refundTarget', async () => {
    mockUserAddresses = [{ address: '0xsolo', blockchains: ['Ethereum'] }];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Sell', inputPaymentMethod: 'Crypto', inputBlockchain: 'Ethereum' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: '0xfixed' }));

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.queryByTestId('address-dropdown')).not.toBeInTheDocument();
  });

  it('shows IBAN dropdown and name field for bank buy without fixed refundTarget', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({ refundTarget: undefined, bankDetails: undefined }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('iban-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('creditorName')).toBeInTheDocument();
    expect(screen.getByTestId('creditorStreet')).toBeInTheDocument();
    expect(screen.getByTestId('creditorCountry-search-dropdown')).toBeInTheDocument();
  });

  it('labels the submit button Confirm refund when state is Failed', async () => {
    mockGetTransactionByUid.mockResolvedValue(makeTx({ state: 'Failed', inputPaymentMethod: 'Card' }));
    renderRefund();
    await waitForRefundFormLoaded();
    expect(screen.getByRole('button', { name: 'Confirm refund' })).toBeInTheDocument();
  });

  it('labels the submit button Request refund when state is not Failed', async () => {
    mockGetTransactionByUid.mockResolvedValue(makeTx({ state: 'Unassigned', inputPaymentMethod: 'Card' }));
    renderRefund();
    await waitForRefundFormLoaded();
    expect(screen.getByRole('button', { name: 'Request refund' })).toBeInTheDocument();
  });

  it('hides the IBAN dropdown when bankAccounts is empty/falsy for bank buy', async () => {
    mockBankAccounts = null as any;
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.queryByTestId('iban-dropdown')).not.toBeInTheDocument();
    // Address fields still render for bank refunds.
    expect(screen.getByTestId('creditorStreet')).toBeInTheDocument();
  });

  it('shows creditor name when bankDetails.name is set but refundTarget is missing (IBAN override)', async () => {
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        refundTarget: undefined,
        bankDetails: { name: 'Only Name' },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('row-Name')).toHaveTextContent('Only Name');
    expect(screen.getByTestId('creditorName')).toBeInTheDocument();
    expect(screen.getByTestId('iban-dropdown')).toBeInTheDocument();
  });

  it('falls back to raw bankDetails.iban when Utils.formatIban returns a falsy value', async () => {
    jest.spyOn(Utils, 'formatIban').mockReturnValue(undefined as any);
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({
        refundTarget: BANK_IBAN_DE,
        bankDetails: {
          name: 'Acme Corp',
          iban: BANK_IBAN_DE,
          bic: 'UBSWCHZH80A',
        },
      }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    expect(screen.getByTestId('row-IBAN')).toHaveTextContent(BANK_IBAN_DE);
  });

  it('shows an empty chargeback-address description when inputBlockchain is nullish for toString', async () => {
    // Filter requires a truthy inputBlockchain; use an object whose toString() is nullish so
    // descriptionFunc hits `transaction.inputBlockchain?.toString() ?? ''` on the fallback side.
    const blockchain = { toString: () => undefined as unknown as string };
    mockUserAddresses = [{ address: '0xsolo', blockchains: [blockchain] }];
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({
        type: 'Sell',
        inputPaymentMethod: 'Crypto',
        inputBlockchain: blockchain,
      }),
    );
    mockGetTransactionRefund.mockResolvedValue(makeRefund({ refundTarget: undefined }));

    renderRefund();
    await waitForRefundFormLoaded();

    await waitFor(() => {
      expect(screen.getByTestId('address-trigger')).toHaveTextContent(/0xsolo/);
    });
    expect(screen.getByTestId('address-description')).toHaveTextContent('');
  });

  it('uses empty string for IBAN dropdown labels when Utils.formatIban returns falsy', async () => {
    jest.spyOn(Utils, 'formatIban').mockImplementation((v: any) => {
      if (v === BANK_IBAN_DE) return undefined as any;
      return v;
    });
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({ refundTarget: undefined, bankDetails: undefined }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    fireEvent.click(screen.getByTestId('iban-trigger'));
    const options = within(screen.getByTestId('iban-options')).getAllByRole('button');
    // DE is first bank account; formatIban falls back to '' for that option only.
    expect(options[0]).toHaveTextContent('');
    expect(options[1]).toHaveTextContent(BANK_IBAN_CH);
    expect(options[2]).toHaveTextContent('Add bank account');
  });

  it('renders the country search dropdown with zero options when allowedCountries is undefined', async () => {
    mockAllowedCountries = undefined as any;
    mockGetTransactionByUid.mockResolvedValue(
      makeTx({ type: 'Buy', inputPaymentMethod: 'Bank' }),
    );
    mockGetTransactionRefund.mockResolvedValue(
      makeRefund({ refundTarget: undefined, bankDetails: undefined }),
    );

    renderRefund();
    await waitForRefundFormLoaded();

    fireEvent.click(screen.getByTestId('creditorCountry-trigger'));
    expect(screen.getByTestId('creditorCountry-options')).toBeInTheDocument();
    expect(screen.queryByTestId('creditorCountry-option-0')).not.toBeInTheDocument();
  });
});
