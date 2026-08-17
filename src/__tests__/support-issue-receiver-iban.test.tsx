// Component tests for the advisory free-text receiver IBAN check on SupportIssueScreen
// (src/screens/support-issue.screen.tsx). The check must never block or delay submit, and a hint
// must never belong to a value that is no longer in the field.
//
// @dfx.swiss/react and @dfx.swiss/react-components are fully mocked here (object-literal factories,
// no requireActual): loading the real packages under this repo's test command fails on their ESM
// `export` syntax, so this mock has to stand in completely rather than spread over the real module.
// StyledInput is wired through react-hook-form Controller so useWatch('receiverIban') updates and
// focus/blur bubble to the wrapper div that gates non-positive hints.

const mockCheckReceiveIban = jest.fn();
const mockCreateSupportIssue = jest.fn();
const mockNavigate = jest.fn();
const mockClearParams = jest.fn();
const mockTranslate = jest.fn((_ns: string, key: string) => key);
const mockUseUserContext = jest.fn(() => ({
  user: undefined as { mail?: string; kyc?: { level: number } } | undefined,
  isUserLoading: false,
}));
const mockUseSessionContext = jest.fn(() => ({
  isLoggedIn: false,
  logout: jest.fn(),
}));

jest.mock('@dfx.swiss/react', () => {
  const SupportIssueType = {
    GENERIC_ISSUE: 'GenericIssue',
    TRANSACTION_ISSUE: 'TransactionIssue',
    VERIFICATION_CALL: 'VerificationCall',
    KYC_ISSUE: 'KycIssue',
    LIMIT_REQUEST: 'LimitRequest',
    PARTNERSHIP_REQUEST: 'PartnershipRequest',
    NOTIFICATION_OF_CHANGES: 'NotificationOfChanges',
    BUG_REPORT: 'BugReport',
  };

  const SupportIssueReason = {
    OTHER: 'Other',
    DATA_REQUEST: 'DataRequest',
    FUNDS_NOT_RECEIVED: 'FundsNotReceived',
    TRANSACTION_MISSING: 'TransactionMissing',
    REJECT_CALL: 'RejectCall',
    REPEAT_CALL: 'RepeatCall',
    NAME_CHANGED: 'NameChanged',
    ADDRESS_CHANGED: 'AddressChanged',
    CIVIL_STATUS_CHANGED: 'CivilStatusChanged',
  };

  const ReceiveIbanStatus = {
    DFX_IBAN: 'DfxIban',
    NOT_MATCHED: 'NotMatched',
    INVALID_IBAN: 'InvalidIban',
    LOGIN_REQUIRED: 'LoginRequired',
  };

  const TransactionState = {
    WAITING_FOR_PAYMENT: 'WaitingForPayment',
  };

  const KycLevel = { Link: 0, Sell: 30, Completed: 50 };

  // Mirrors the screen's only two calls into the real Utils: createRules merges an array of rule
  // objects per field into a single object (a falsy entry, e.g. a condition that evaluated to
  // `false`, is skipped and does not contribute keys), and formatIban is a pass-through here since
  // no assertion in this file depends on its formatting.
  const Utils = {
    createRules: (rules: Record<string, any>) => {
      for (const property in rules) {
        if (Array.isArray(rules[property])) {
          rules[property] = rules[property].reduce(
            (prev: any, curr: any) => (prev ? { ...prev, ...curr } : undefined),
            {},
          );
        }
      }
      return rules;
    },
    formatIban: (iban: string) => iban,
  };

  // Mirrors the screen's calls into the real Validations: Required returns a react-hook-form
  // "required" rule with message 'required'; Custom wraps an arbitrary validator function as a
  // react-hook-form "validate" rule (the validator itself decides pass/fail per field); Iban fails
  // with a sentinel so that if the receiver field ever gained Validations.Iban, submission tests
  // with non-IBAN free text would fail instead of staying green.
  const Validations = {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
    Iban: (_countries: unknown[]) => ({ validate: () => 'iban' }),
  };

  return {
    SupportIssueType,
    SupportIssueReason,
    ReceiveIbanStatus,
    TransactionState,
    KycLevel,
    FiatPaymentMethod: {},
    FileType: {},
    FundOrigin: {},
    InvestmentDate: {},
    Limit: {},
    PaymentQuoteStatus: {},
    PhoneCallTime: {},
    TransactionFailureReason: {},
    UserRole: {},
    Utils,
    Validations,
    useBank: () => ({ checkReceiveIban: mockCheckReceiveIban }),
    useBankAccountContext: () => ({ bankAccounts: undefined }),
    useSessionContext: () => mockUseSessionContext(),
    useSupportChatContext: () => ({
      createSupportIssue: mockCreateSupportIssue,
      loadSupportIssue: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
      supportIssue: undefined,
    }),
    useUserContext: () => mockUseUserContext(),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above the module's imports, so React and
  // react-hook-form (imported normally further down for the tests themselves) are not yet
  // in scope here and must be required directly instead.
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

  // This mock intentionally does not attach an onSubmit handler to the <form> element itself; it only
  // forwards onSubmit to children that carry a name prop (same as control/rules/error). That is deliberate:
  // a form-level onSubmit would let a native submit-button click fire submission even without the screen's
  // own onClick handler, which would hide a missing handler as a bug.
  function Form({ children, control, rules, errors, onSubmit }: any) {
    return React.createElement(
      'form',
      { className: 'w-full' },
      enrichChildren(children, control, rules, errors, onSubmit),
    );
  }

  const StyledInput = forwardRef(function StyledInput(
    { control, name, label, rules, error, placeholder, loading, multiLine, disabled }: any,
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
          React.createElement(
            'div',
            { className: 'relative' },
            loading ? React.createElement('svg', { 'data-testid': `${name}-spinner` }) : null,
            multiLine
              ? React.createElement('textarea', {
                  ref,
                  placeholder,
                  value: value ?? '',
                  disabled,
                  onBlur,
                  onChange: (e: any) => onChange(e.target.value),
                })
              : React.createElement('input', {
                  ref,
                  placeholder,
                  value: value ?? '',
                  disabled,
                  onBlur,
                  onChange: (e: any) => onChange(e.target.value),
                }),
          ),
          error ? React.createElement('p', null, error.message) : null,
        ),
    });
  });

  function StyledDropdown({ control, name, label, items, labelFunc, placeholder, disabled }: any) {
    const [open, setOpen] = useState(false);
    return React.createElement(Controller, {
      control,
      name,
      render: ({ field: { onChange, value } }: any) =>
        React.createElement(
          'div',
          null,
          label ? React.createElement('label', null, label) : null,
          React.createElement(
            'button',
            {
              type: 'button',
              disabled,
              onClick: () => setOpen((o: boolean) => !o),
            },
            value != null ? labelFunc(value) : placeholder,
          ),
          open
            ? React.createElement(
                'div',
                null,
                items.map((item: any, i: number) =>
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      key: i,
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
        ),
    });
  }

  function StyledButton({ label, onClick, disabled, isLoading, type }: any) {
    return React.createElement('button', { type: type ?? 'button', onClick, disabled: disabled || isLoading }, label);
  }

  const StyledVerticalStack = ({ children }: any) => React.createElement('div', null, children);
  const StyledLoadingSpinner = () => null;
  const StyledLink = ({ label }: any) => React.createElement('a', null, label);
  const StyledFileUpload = () => null;
  const SpinnerSize = { SM: 'sm', LG: 'lg' };
  const StyledButtonWidth = { FULL: 'full', MIN: 'min' };

  return {
    Form,
    StyledInput,
    StyledDropdown,
    StyledButton,
    StyledVerticalStack,
    StyledLoadingSpinner,
    StyledLink,
    StyledFileUpload,
    SpinnerSize,
    StyledButtonWidth,
  };
});

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (ns: string, key: string) => mockTranslate(ns, key),
    translateError: (message: string) => message,
    allowedCountries: [],
  }),
}));

const mockUseUserGuard = jest.fn();

jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: (...args: unknown[]) => mockUseUserGuard(...args),
  useKycLevelGuard: () => undefined,
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    setParams: jest.fn(),
    clearParams: mockClearParams,
  }),
}));

jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: () => null,
}));

jest.mock('src/screens/transaction.screen', () => ({
  TransactionList: () => null,
}));

jest.mock('src/components/support-issue/limit-request-fields', () => ({
  LimitRequestFields: () => null,
}));

jest.mock('src/components/error-hint', () => {
  // Same hoisting reason as the @dfx.swiss/react-components mock above: this factory runs
  // before the file's imports, so React has to be required here rather than imported.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: { message: string }) =>
      React.createElement('div', { 'data-testid': 'error-hint' }, message),
  };
});

import { ReceiveIbanStatus, SupportIssueReason, SupportIssueType } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import SupportIssueScreen from 'src/screens/support-issue.screen';

const ReceiverIbanCheckDelay = 500;

const HINTS = {
  [ReceiveIbanStatus.DFX_IBAN]: 'We have recognized this IBAN.',
  [ReceiveIbanStatus.NOT_MATCHED]:
    'We could not recognize this IBAN with the information available to us. You can submit your request anyway.',
  [ReceiveIbanStatus.INVALID_IBAN]: 'This does not look like a valid IBAN.',
  [ReceiveIbanStatus.LOGIN_REQUIRED]: 'Please log in so that we can also check your personal IBAN.',
} as const;

const UNAVAILABLE_HINT = 'We could not check this IBAN at the moment. You can submit your request anyway.';

/** 21 alphanumerics — above the 15-char check threshold in support-issue.screen.tsx. */
const VALID_NORMALIZED = 'CH9300762011623852957';
const VALID_FORMATTED = 'CH93 0076 2011 6238 5295 7';
/** 13 alphanumerics — below the threshold. */
const BELOW_THRESHOLD = 'CH93007620116';
/** Exactly 14 alphanumerics — one character below ReceiverIbanCheckMinLength (15). */
const EXACTLY_BELOW_THRESHOLD = 'CH930076201162';
/** Exactly 15 alphanumerics — exactly ReceiverIbanCheckMinLength. */
const EXACTLY_AT_THRESHOLD = 'CH9300762011623';
/**
 * 16 characters including dashes, but only 13 alphanumerics after the same normalization the screen
 * applies (iban?.replace(/[^A-Za-z0-9]/g, '')). Must not cross the threshold via separators.
 */
const DASHED_BELOW_THRESHOLD = 'LI75-0881-1010-5';

const MISSING_PATH = `?issue-type=${SupportIssueType.TRANSACTION_ISSUE}&reason=${SupportIssueReason.TRANSACTION_MISSING}`;
const FUNDS_PATH = `?issue-type=${SupportIssueType.TRANSACTION_ISSUE}&reason=${SupportIssueReason.FUNDS_NOT_RECEIVED}`;

function renderScreen(search = MISSING_PATH) {
  const router = createMemoryRouter([{ path: '/support/issue', element: <SupportIssueScreen /> }], {
    initialEntries: [`/support/issue${search}`],
  });
  return { ...render(<RouterProvider router={router} />), router };
}

/**
 * Pick type/reason through StyledDropdown so react-hook-form runs field validation.
 * URL setValue in the screen does not pass shouldValidate, which leaves isValid false for submit tests.
 */
function chooseDropdownOption(closedButtonName: RegExp, optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: closedButtonName }));
  const options = screen.getAllByRole('button', { name: optionName });
  fireEvent.click(options[options.length - 1]);
}

function selectTransactionMissingViaUi() {
  chooseDropdownOption(/Select\.\.\./i, /^Transaction issue$/i);
  chooseDropdownOption(/Select\.\.\./i, /^Transaction missing$/i);
}

function getReceiverIbanInput(): HTMLInputElement {
  const label = screen.getByText('Receiver IBAN', { selector: 'label' });
  const stack = label.parentElement;
  if (!stack) throw new Error('Receiver IBAN label has no parent');
  const input = stack.querySelector('input');
  if (!input) throw new Error('Receiver IBAN input not found');
  return input as HTMLInputElement;
}

function getReceiverIbanFieldRoot(): HTMLElement {
  const input = getReceiverIbanInput();
  // StyledInput stack (label + input row + optional error) sits inside the focus-tracking wrapper.
  const stack = input.parentElement?.parentElement;
  if (!stack) throw new Error('Receiver IBAN field root not found');
  return stack;
}

function receiverHasLoadingSpinner(): boolean {
  const input = getReceiverIbanInput();
  const relative = input.parentElement;
  if (!relative) return false;
  // StyledInput renders an SVG next to the input when loading.
  return relative.querySelector('svg') != null;
}

function getNextButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^Next$/i }) as HTMLButtonElement;
}

async function advanceDebounce(ms = ReceiverIbanCheckDelay) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  // Flush the checkReceiveIban promise microtasks started by the debounced effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function typeReceiverIban(value: string) {
  const input = getReceiverIbanInput();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

function fillTransactionMissingForm(receiverIban: string) {
  const ibanInputs = screen.getAllByPlaceholderText('XX XXXX XXXX XXXX XXXX X');
  fireEvent.change(ibanInputs[0], { target: { value: 'DE89370400440532013000' } });
  fireEvent.change(ibanInputs[1], { target: { value: receiverIban } });

  const today = new Date().toISOString().split('T')[0];
  fireEvent.change(screen.getByPlaceholderText(today), { target: { value: '2024-06-15' } });
  fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Test User' } });

  const descriptionLabel = screen.getByText('Description', { selector: 'label' });
  const textarea = descriptionLabel.parentElement?.querySelector('textarea');
  if (!textarea) throw new Error('Description textarea not found');
  fireEvent.change(textarea, { target: { value: 'I am missing a bank transfer.' } });
}

describe('SupportIssueScreen receiver IBAN check', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: undefined });
    mockCheckReceiveIban.mockReset();
    mockCreateSupportIssue.mockReset();
    mockCreateSupportIssue.mockResolvedValue('issue-uid-1');
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
  });

  // --- A. Visibility ---
  it('shows the free-text receiver IBAN field for TRANSACTION_MISSING', () => {
    renderScreen(MISSING_PATH);
    expect(screen.getByText('Receiver IBAN', { selector: 'label' })).toBeInTheDocument();
  });

  it('does not render the receiver IBAN field for FUNDS_NOT_RECEIVED', () => {
    renderScreen(FUNDS_PATH);
    expect(screen.queryByText('Receiver IBAN', { selector: 'label' })).not.toBeInTheDocument();
  });

  // --- B. Threshold ---
  it('does not call checkReceiveIban when the normalized value is shorter than 15 characters', async () => {
    renderScreen();
    await typeReceiverIban(BELOW_THRESHOLD);
    await advanceDebounce();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();
  });

  it('does not call checkReceiveIban at exactly 14 normalized characters (one below the threshold)', async () => {
    renderScreen();
    await typeReceiverIban(EXACTLY_BELOW_THRESHOLD);
    await advanceDebounce();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();
  });

  it('calls checkReceiveIban exactly once at exactly 15 normalized characters (the threshold)', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.NOT_MATCHED });
    renderScreen();
    await typeReceiverIban(EXACTLY_AT_THRESHOLD);
    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(mockCheckReceiveIban).toHaveBeenCalledWith(EXACTLY_AT_THRESHOLD);
  });

  // --- C. Normalization ---
  it('does not treat separators as part of the length threshold', async () => {
    renderScreen();
    // 16 raw characters, 13 alphanumerics after normalization — still incomplete.
    await typeReceiverIban(DASHED_BELOW_THRESHOLD);
    await advanceDebounce();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();
  });

  it('sends the normalized IBAN without spaces when the threshold is met', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    await typeReceiverIban(VALID_FORMATTED);
    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(mockCheckReceiveIban).toHaveBeenCalledWith(VALID_NORMALIZED);
  });

  // --- D. Debounce ---
  it('debounces rapid keystrokes into a single check for the final value', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.NOT_MATCHED });
    renderScreen();
    const input = getReceiverIbanInput();

    fireEvent.change(input, { target: { value: 'CH930076201162385295' } });
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: 'CH9300762011623852956' } });
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: VALID_NORMALIZED } });
    // Still within the 500ms window of the last keystroke — no request yet.
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();

    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(mockCheckReceiveIban).toHaveBeenCalledWith(VALID_NORMALIZED);
  });

  it('does not trigger a new check for a formatting-only edit that keeps the normalized value equal', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.NOT_MATCHED });
    renderScreen();
    const input = getReceiverIbanInput();

    fireEvent.change(input, { target: { value: VALID_FORMATTED } });
    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(mockCheckReceiveIban).toHaveBeenCalledWith(VALID_NORMALIZED);

    fireEvent.blur(input);
    expect(screen.getByText(HINTS[ReceiveIbanStatus.NOT_MATCHED])).toBeInTheDocument();

    // Same alphanumerics, different separators (dashes instead of spaces) - normalizeIban strips
    // both, so this must not read as a changed value: no new check, and the hint must not flicker.
    const reformatted = 'CH93-0076-2011-6238-5295-7';
    fireEvent.change(input, { target: { value: reformatted } });
    expect(screen.getByText(HINTS[ReceiveIbanStatus.NOT_MATCHED])).toBeInTheDocument();

    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
  });

  // --- E. Reset on change ---
  it('clears an existing hint immediately when the customer changes the value', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    await advanceDebounce();
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();

    fireEvent.change(input, { target: { value: `${VALID_NORMALIZED}0` } });
    // Hint is cleared on normalizedReceiver change before any new answer arrives.
    expect(screen.queryByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).not.toBeInTheDocument();
  });

  it('clears a visible unavailable hint immediately when the customer changes the value', async () => {
    mockCheckReceiveIban.mockRejectedValue({ statusCode: 429 });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    await advanceDebounce();
    fireEvent.blur(input);
    expect(screen.getByText(UNAVAILABLE_HINT)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: `${VALID_NORMALIZED}0` } });
    expect(screen.queryByText(UNAVAILABLE_HINT)).not.toBeInTheDocument();
  });

  it('clears a visible loading spinner immediately when the customer changes the value', async () => {
    mockCheckReceiveIban.mockImplementation(() => new Promise(() => undefined));
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    await act(async () => {
      jest.advanceTimersByTime(ReceiverIbanCheckDelay);
    });
    expect(receiverHasLoadingSpinner()).toBe(true);

    fireEvent.change(input, { target: { value: `${VALID_NORMALIZED}0` } });
    expect(receiverHasLoadingSpinner()).toBe(false);
  });

  // --- F. Stale response ---
  it('ignores a slow response for a previous value so it cannot overwrite the current hint', async () => {
    const resolvers: Array<(value: { status: string }) => void> = [];
    mockCheckReceiveIban.mockImplementation(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    renderScreen();
    const input = getReceiverIbanInput();
    const first = 'CH9300762011623852957';
    const second = 'DE89370400440532013000';

    fireEvent.change(input, { target: { value: first } });
    await advanceDebounce();
    expect(resolvers).toHaveLength(1);

    fireEvent.change(input, { target: { value: second } });
    await advanceDebounce();
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[1]({ status: ReceiveIbanStatus.DFX_IBAN });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();

    await act(async () => {
      resolvers[0]({ status: ReceiveIbanStatus.NOT_MATCHED });
      await Promise.resolve();
      await Promise.resolve();
    });
    // Late NOT_MATCHED for the first IBAN must not replace the DFX hint for the current value.
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();
    expect(screen.queryByText(HINTS[ReceiveIbanStatus.NOT_MATCHED])).not.toBeInTheDocument();
  });

  it('ignores a stale rejection for a previous value so it cannot overwrite the current hint', async () => {
    const deferred: Array<{ resolve: (value: { status: string }) => void; reject: (reason?: unknown) => void }> = [];
    mockCheckReceiveIban.mockImplementation(
      () =>
        new Promise<{ status: string }>((resolve, reject) => {
          deferred.push({ resolve, reject });
        }),
    );

    renderScreen();
    const input = getReceiverIbanInput();
    const first = 'CH9300762011623852957';
    const second = 'DE89370400440532013000';

    fireEvent.change(input, { target: { value: first } });
    await advanceDebounce();
    expect(deferred).toHaveLength(1);

    fireEvent.change(input, { target: { value: second } });
    await advanceDebounce();
    expect(deferred).toHaveLength(2);

    await act(async () => {
      deferred[1].resolve({ status: ReceiveIbanStatus.DFX_IBAN });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();

    await act(async () => {
      deferred[0].reject({ statusCode: 429 });
      await Promise.resolve();
      await Promise.resolve();
    });
    // A late rejection for the first (stale) IBAN must not replace the current DFX hint,
    // nor show the "check unavailable" hint that a current rejection would trigger.
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE_HINT)).not.toBeInTheDocument();
  });

  // --- G. Stale debounced value ---
  it('does not request a check while the debounced value no longer matches the field', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    const input = getReceiverIbanInput();
    const first = 'CH9300762011623852957';
    const second = 'DE89370400440532013000';

    fireEvent.change(input, { target: { value: first } });
    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(mockCheckReceiveIban).toHaveBeenLastCalledWith(first);

    // After the change, debounced still holds `first` until the delay elapses; the effect must not
    // call checkReceiveIban with that stale debounced value (iban !== normalizedReceiver guard).
    fireEvent.change(input, { target: { value: second } });
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);

    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(2);
    expect(mockCheckReceiveIban).toHaveBeenLastCalledWith(second);
  });

  // --- H. Focus gating ---
  it('shows DFX_IBAN immediately while the field is focused', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    // Keep focus: non-positive hints wait for blur, positive confirmation may appear immediately.
    fireEvent.focus(input);
    await advanceDebounce();
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();
  });

  it.each([
    [ReceiveIbanStatus.NOT_MATCHED, HINTS[ReceiveIbanStatus.NOT_MATCHED]],
    [ReceiveIbanStatus.INVALID_IBAN, HINTS[ReceiveIbanStatus.INVALID_IBAN]],
    [ReceiveIbanStatus.LOGIN_REQUIRED, HINTS[ReceiveIbanStatus.LOGIN_REQUIRED]],
  ] as const)('hides %s while focused and shows it after blur', async (status, hint) => {
    mockCheckReceiveIban.mockResolvedValue({ status });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    fireEvent.focus(input);
    await advanceDebounce();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('hides the unavailable hint while focused and shows it after blur', async () => {
    mockCheckReceiveIban.mockRejectedValue({ statusCode: 429 });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    fireEvent.focus(input);
    await advanceDebounce();
    expect(screen.queryByText(UNAVAILABLE_HINT)).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.getByText(UNAVAILABLE_HINT)).toBeInTheDocument();
  });

  // --- I. Hint texts and colors ---
  it.each([
    [ReceiveIbanStatus.DFX_IBAN, HINTS[ReceiveIbanStatus.DFX_IBAN], 'text-dfxGreen-100'],
    [ReceiveIbanStatus.NOT_MATCHED, HINTS[ReceiveIbanStatus.NOT_MATCHED], 'text-dfxGray-800'],
    [ReceiveIbanStatus.INVALID_IBAN, HINTS[ReceiveIbanStatus.INVALID_IBAN], 'text-dfxGray-800'],
    [ReceiveIbanStatus.LOGIN_REQUIRED, HINTS[ReceiveIbanStatus.LOGIN_REQUIRED], 'text-dfxGray-800'],
  ] as const)('renders the configured hint text and color for %s', async (status, hint, colorClass) => {
    mockCheckReceiveIban.mockResolvedValue({ status });
    renderScreen();
    const input = await typeReceiverIban(VALID_NORMALIZED);
    await advanceDebounce();
    if (status !== ReceiveIbanStatus.DFX_IBAN) {
      fireEvent.blur(input);
    }
    const element = screen.getByText(hint);
    expect(element).toBeInTheDocument();
    expect(element).toHaveClass(colorClass);
  });

  it('passes the receiver IBAN hint through translate with the screens/support namespace', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    await typeReceiverIban(VALID_NORMALIZED);
    await advanceDebounce();

    expect(mockTranslate).toHaveBeenCalledWith('screens/support', HINTS[ReceiveIbanStatus.DFX_IBAN]);
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();
  });

  // --- J. Failure / rate limit ---
  it.each([
    [429, { statusCode: 429, message: 'Too Many Requests' }],
    [500, { statusCode: 500, message: 'Internal Server Error' }],
  ] as const)(
    'shows the unavailable hint after a rejected check (%s) without treating it as a form error, and submits the raw receiver IBAN',
    async (_statusCode, rejection) => {
      mockCheckReceiveIban.mockRejectedValue(rejection);
      renderScreen('');
      selectTransactionMissingViaUi();
      fillTransactionMissingForm(VALID_FORMATTED);
      await advanceDebounce();
      fireEvent.blur(getReceiverIbanInput());

      expect(screen.getByText(UNAVAILABLE_HINT)).toBeInTheDocument();
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      // No validation error message attached to the receiver field from the check failure.
      expect(within(getReceiverIbanFieldRoot()).queryByText('required')).not.toBeInTheDocument();
      expect(getNextButton()).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(getNextButton());
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockCreateSupportIssue).toHaveBeenCalled();
      const request = mockCreateSupportIssue.mock.calls[0][0];
      expect(request.transaction.receiverIban).toBe(VALID_FORMATTED);
    },
  );

  // --- K. Spinner ---
  it('sets loading on the input while the check runs and clears it on success', async () => {
    let resolveCheck!: (value: { status: string }) => void;
    mockCheckReceiveIban.mockImplementation(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveCheck = resolve;
        }),
    );

    renderScreen();
    await typeReceiverIban(VALID_NORMALIZED);
    await act(async () => {
      jest.advanceTimersByTime(ReceiverIbanCheckDelay);
    });
    // Effect has started the request; spinner is on before the promise settles.
    expect(receiverHasLoadingSpinner()).toBe(true);

    await act(async () => {
      resolveCheck({ status: ReceiveIbanStatus.DFX_IBAN });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(receiverHasLoadingSpinner()).toBe(false);
  });

  it('clears the loading spinner when the check is rejected', async () => {
    let rejectCheck!: (reason?: unknown) => void;
    mockCheckReceiveIban.mockImplementation(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectCheck = reject;
        }),
    );

    renderScreen();
    await typeReceiverIban(VALID_NORMALIZED);
    await act(async () => {
      jest.advanceTimersByTime(ReceiverIbanCheckDelay);
    });
    expect(receiverHasLoadingSpinner()).toBe(true);

    await act(async () => {
      rejectCheck({ statusCode: 500 });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(receiverHasLoadingSpinner()).toBe(false);
  });

  // --- L. Never blocks submit ---
  it('does not set a receiverIban field error or disable submit for a negative check result', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.INVALID_IBAN });
    renderScreen('');
    selectTransactionMissingViaUi();
    fillTransactionMissingForm(VALID_NORMALIZED);
    await advanceDebounce();
    fireEvent.blur(getReceiverIbanInput());

    expect(screen.getByText(HINTS[ReceiveIbanStatus.INVALID_IBAN])).toBeInTheDocument();
    expect(within(getReceiverIbanFieldRoot()).queryByText('required')).not.toBeInTheDocument();
    expect(getNextButton()).not.toBeDisabled();
  });

  it('does not set a receiverIban field error or disable submit for a non-IBAN free-text value', async () => {
    // Below the check threshold, so no backend call; still non-empty free text that Validations.Iban
    // would reject if it were ever added to the receiverIban rules. Submit should pass the raw value through.
    renderScreen('');
    selectTransactionMissingViaUi();
    fillTransactionMissingForm('not-a-valid-iban!!');
    fireEvent.blur(getReceiverIbanInput());
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(getReceiverIbanFieldRoot()).queryByText('required')).not.toBeInTheDocument();
    expect(within(getReceiverIbanFieldRoot()).queryByText('iban')).not.toBeInTheDocument();
    expect(getNextButton()).not.toBeDisabled();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(getNextButton());
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateSupportIssue).toHaveBeenCalled();
    const request = mockCreateSupportIssue.mock.calls[0][0];
    expect(request.transaction.receiverIban).toBe('not-a-valid-iban!!');
  });

  it('does not disable submit while a check is still in flight', async () => {
    mockCheckReceiveIban.mockImplementation(() => new Promise(() => undefined));
    renderScreen('');
    selectTransactionMissingViaUi();
    fillTransactionMissingForm(VALID_NORMALIZED);
    await act(async () => {
      jest.advanceTimersByTime(ReceiverIbanCheckDelay);
    });
    expect(receiverHasLoadingSpinner()).toBe(true);
    expect(getNextButton()).not.toBeDisabled();
  });

  it('submits the raw receiver IBAN while a check is still unresolved (in flight)', async () => {
    mockCheckReceiveIban.mockImplementation(() => new Promise(() => undefined));
    renderScreen('');
    selectTransactionMissingViaUi();
    fillTransactionMissingForm(VALID_FORMATTED);
    await act(async () => {
      jest.advanceTimersByTime(ReceiverIbanCheckDelay);
    });
    expect(receiverHasLoadingSpinner()).toBe(true);

    await act(async () => {
      fireEvent.click(getNextButton());
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateSupportIssue).toHaveBeenCalled();
    const request = mockCreateSupportIssue.mock.calls[0][0];
    expect(request.transaction.receiverIban).toBe(VALID_FORMATTED);
  });

  it.each([
    ReceiveIbanStatus.DFX_IBAN,
    ReceiveIbanStatus.NOT_MATCHED,
    ReceiveIbanStatus.INVALID_IBAN,
    ReceiveIbanStatus.LOGIN_REQUIRED,
  ] as const)('submits the raw, unnormalized receiver IBAN the customer typed for %s', async (status) => {
    mockCheckReceiveIban.mockResolvedValue({ status });
    renderScreen('');
    selectTransactionMissingViaUi();
    fillTransactionMissingForm(VALID_FORMATTED);
    await advanceDebounce();
    fireEvent.blur(getReceiverIbanInput());

    expect(getNextButton()).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(getNextButton());
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateSupportIssue).toHaveBeenCalled();
    const request = mockCreateSupportIssue.mock.calls[0][0];
    // onSubmit passes data.receiverIban through unchanged (spaces kept).
    expect(request.transaction.receiverIban).toBe(VALID_FORMATTED);
  });

  // --- M. Whitespace-only ---
  it('treats whitespace-only receiver IBAN as empty (invalid) and accepts a non-empty non-IBAN', async () => {
    renderScreen();
    const input = getReceiverIbanInput();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(getReceiverIbanFieldRoot()).getByText('required')).toBeInTheDocument();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'not-a-valid-iban!!' } });
    fireEvent.blur(input);
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(getReceiverIbanFieldRoot()).queryByText('required')).not.toBeInTheDocument();
  });

  it('disables submit when the receiver IBAN field is left untouched', async () => {
    renderScreen('');
    selectTransactionMissingViaUi();

    const ibanInputs = screen.getAllByPlaceholderText('XX XXXX XXXX XXXX XXXX X');
    fireEvent.change(ibanInputs[0], { target: { value: 'DE89370400440532013000' } }); // sender only
    const today = new Date().toISOString().split('T')[0];
    fireEvent.change(screen.getByPlaceholderText(today), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Test User' } });
    const descriptionLabel = screen.getByText('Description', { selector: 'label' });
    const textarea = descriptionLabel.parentElement?.querySelector('textarea');
    if (!textarea) throw new Error('Description textarea not found');
    fireEvent.change(textarea, { target: { value: 'I am missing a bank transfer.' } });
    // Blur without ever entering a value - still "left untouched" in the sense this test is
    // about, but this is what makes react-hook-form actually run validation for the field, so
    // isValid genuinely reflects whether Validations.Required still applies to it.
    fireEvent.blur(getReceiverIbanInput());
    await act(async () => {
      await Promise.resolve();
    });

    expect(getNextButton()).toBeDisabled();
    expect(mockCheckReceiveIban).not.toHaveBeenCalled();
  });

  // --- N. Reason change ---
  it('hides the field and does not issue further checks after leaving TRANSACTION_MISSING', async () => {
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen();
    await typeReceiverIban(VALID_NORMALIZED);
    await advanceDebounce();
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
    expect(screen.getByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).toBeInTheDocument();

    chooseDropdownOption(/Transaction missing/i, /^Other$/i);

    expect(screen.queryByText('Receiver IBAN', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByText(HINTS[ReceiveIbanStatus.DFX_IBAN])).not.toBeInTheDocument();
    // Reason change only clears state; it must not start another check.
    expect(mockCheckReceiveIban).toHaveBeenCalledTimes(1);
  });
});

describe('SupportIssueScreen mail gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: undefined });
    mockCheckReceiveIban.mockReset();
    mockCreateSupportIssue.mockReset();
    mockCreateSupportIssue.mockResolvedValue('issue-uid-1');
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
  });

  it('redirects logged-in users without mail to /account/mail and hides the form', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: { mail: undefined, kyc: { level: 50 } }, isUserLoading: false });
    renderScreen('');

    expect(mockNavigate).toHaveBeenCalledWith('/account/mail', { setRedirect: true });
    expect(screen.queryByText('Email address', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Issue type', { selector: 'label' })).not.toBeInTheDocument();
    expect(mockCreateSupportIssue).not.toHaveBeenCalled();
  });

  it('keeps the form hidden and does not redirect while a logged-in user is still loading', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: undefined, isUserLoading: true });
    renderScreen('');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.queryByText('Issue type', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument();
  });

  it('shows the form for logged-in users with mail and does not send mail on create', async () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: { mail: 'a@b.c', kyc: { level: 50 } }, isUserLoading: false });
    mockCheckReceiveIban.mockResolvedValue({ status: ReceiveIbanStatus.DFX_IBAN });
    renderScreen('');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.queryByText('Email address', { selector: 'label' })).not.toBeInTheDocument();

    selectTransactionMissingViaUi();
    fillTransactionMissingForm(VALID_FORMATTED);
    await advanceDebounce();
    fireEvent.blur(getReceiverIbanInput());

    expect(getNextButton()).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(getNextButton());
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateSupportIssue).toHaveBeenCalled();
    const request = mockCreateSupportIssue.mock.calls[0][0];
    expect(request.mail).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(request, 'mail')).toBe(false);
  });

  it('shows the form for logged-out users without redirect or email field', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: false, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: undefined });
    renderScreen('');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.queryByText('Email address', { selector: 'label' })).not.toBeInTheDocument();
    expect(screen.getByText('Issue type', { selector: 'label' })).toBeInTheDocument();
  });

  it('does not redirect logged-in users without mail to /account/mail on the guest/quote path', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: { mail: undefined, kyc: { level: 50 } }, isUserLoading: false });
    renderScreen('?quote=Qtest');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.getByText('Issue type', { selector: 'label' })).toBeInTheDocument();
  });

  it('keeps the quote-path latch after the URL quote param is cleared on the same instance', async () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: { mail: undefined, kyc: { level: 50 } }, isUserLoading: false });
    const { router } = renderScreen('?quote=Qtest');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.getByText('Issue type', { selector: 'label' })).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/support/issue');
    });

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.getByText('Issue type', { selector: 'label' })).toBeInTheDocument();
  });

  it('does not redirect logged-in users without mail to /account/mail on the guest/tx path', () => {
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout: jest.fn() });
    mockUseUserContext.mockReturnValue({ user: { mail: undefined, kyc: { level: 50 } }, isUserLoading: false });
    renderScreen('?tx=T1E448FF200A877DC');

    expect(mockNavigate).not.toHaveBeenCalledWith('/account/mail', expect.anything());
    expect(screen.getByText('Issue type', { selector: 'label' })).toBeInTheDocument();
  });
});

describe('SupportIssueScreen tx query param', () => {
  beforeEach(() => {
    mockUseUserGuard.mockReset();
    mockClearParams.mockReset();
  });

  it('skips the login guard when tx is present', () => {
    renderScreen(`?issue-type=${SupportIssueType.TRANSACTION_ISSUE}&tx=T1E448FF200A877DC`);

    expect(mockUseUserGuard).toHaveBeenCalledWith('/login', false);
  });

  it('keeps the login guard active without a tx or order param', () => {
    renderScreen(`?issue-type=${SupportIssueType.TRANSACTION_ISSUE}`);

    expect(mockUseUserGuard).toHaveBeenCalledWith('/login', true);
  });

  it('logs out a logged-in session when tx is present', () => {
    const logout = jest.fn();
    mockUseSessionContext.mockReturnValue({ isLoggedIn: true, logout });
    renderScreen(`?issue-type=${SupportIssueType.TRANSACTION_ISSUE}&tx=T1E448FF200A877DC`);
    expect(logout).toHaveBeenCalled();
  });
});
