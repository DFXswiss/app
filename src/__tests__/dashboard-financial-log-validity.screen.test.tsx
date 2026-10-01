// Component tests for the admin financial log validity screen. The shared form controls and overlay
// are reduced to accessible HTML so both ID and range workflows can be exercised without the app shell.

type MockValidation = (value: unknown) => true | string;
type MockFormContext = {
  control: import('react-hook-form').Control<import('react-hook-form').FieldValues>;
  rules?: Record<string, MockValidation[]>;
};

const mockCall = jest.fn();
const mockUseAdminGuard = jest.fn();
const mockUseLayoutOptions = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    createRules: (rules: Record<string, MockValidation[]>) => rules,
  },
  Validations: {
    Required: (value: unknown) => (String(value ?? '').trim() ? true : 'required'),
    Custom: (validation: MockValidation) => validation,
  },
}));

jest.mock('@dfx.swiss/react-components', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { useController } = jest.requireActual<typeof import('react-hook-form')>('react-hook-form');
  const FormContext = React.createContext<MockFormContext | undefined>(undefined);

  return {
    DfxIcon: () => <span data-testid="success-icon" />,
    Form: ({
      children,
      control,
      rules,
    }: {
      children: import('react').ReactNode;
      control: MockFormContext['control'];
      rules?: Record<string, MockValidation[]>;
    }) => <FormContext.Provider value={{ control, rules }}>{children}</FormContext.Provider>,
    IconSize: { SM: 'sm' },
    IconVariant: { CHECK: 'check' },
    StyledButton: ({
      label,
      onClick,
      disabled,
    }: {
      label: string;
      onClick?: () => void | Promise<void>;
      disabled?: boolean;
    }) => (
      <button type="button" disabled={disabled} onClick={() => void onClick?.()}>
        {label}
      </button>
    ),
    StyledButtonColor: { BLUE: 'blue', GREEN: 'green', RED: 'red' },
    StyledButtonWidth: { FULL: 'full' },
    StyledInput: ({
      name,
      label,
      type,
      placeholder,
    }: {
      name: string;
      label: string;
      type?: string;
      placeholder?: string;
    }) => {
      const context = React.useContext(FormContext);
      if (!context) throw new Error('StyledInput must be rendered inside Form');

      const fieldRules = context.rules?.[name] ?? [];
      const { field, fieldState } = useController({
        name,
        control: context.control,
        rules: {
          validate: (value: unknown) => {
            for (const validate of fieldRules) {
              const result = validate(value);
              if (result !== true) return result;
            }
            return true;
          },
        },
      });

      return (
        <label>
          <span>{label}</span>
          <input
            aria-label={label}
            data-input-type={type}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            placeholder={placeholder}
            ref={field.ref}
            type={type}
            value={String(field.value ?? '')}
          />
          {fieldState.error?.message && <span role="alert">{String(fieldState.error.message)}</span>}
        </label>
      );
    },
    StyledVerticalStack: ({ children }: { children: import('react').ReactNode }) => <div>{children}</div>,
  };
});

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    messageContent,
    onCancel,
    onConfirm,
  }: {
    messageContent?: JSX.Element;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
  }) => (
    <div>
      <div data-testid="confirmation-message">{messageContent}</div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={() => void onConfirm()}>
        Confirm
      </button>
    </div>
  ),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translateError: (key: string) => key }),
}));

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useAdminGuard: () => mockUseAdminGuard(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardFinancialLogValidityScreen from 'src/screens/dashboard-financial-log-validity.screen';
import * as localDateTimeUtil from 'src/util/local-date-time.util';

type SectionName = 'By log ID' | 'By financial range / threshold';
type RangeValue =
  | 'From (created >=)'
  | 'To (created <)'
  | 'Min totalBalanceChf (exclusive)'
  | 'Max totalBalanceChf (exclusive)'
  | 'Reason (shown on the chart)';

function renderScreen(): void {
  render(<DashboardFinancialLogValidityScreen />);
}

function section(name: SectionName): ReturnType<typeof within> {
  const container = screen.getByRole('heading', { name }).parentElement;
  if (!container) throw new Error(`Missing section: ${name}`);
  return within(container);
}

function setInput(label: 'Log ID' | RangeValue, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function setRange(values: Partial<Record<RangeValue, string>>): void {
  Object.entries(values).forEach(([label, value]) => setInput(label as RangeValue, value ?? ''));
}

async function requestId(label: 'Set valid = true' | 'Set valid = false'): Promise<void> {
  fireEvent.click(section('By log ID').getByRole('button', { name: label }));
  await screen.findByRole('button', { name: 'Confirm' });
}

async function requestRange(
  label: 'Set valid = true' | 'Set valid = false' | 'Add info point (set valid)',
): Promise<void> {
  fireEvent.click(section('By financial range / threshold').getByRole('button', { name: label }));
  await screen.findByRole('button', { name: 'Confirm' });
}

async function confirm(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

const RANGE_VALIDATION_CASES: {
  name: string;
  values: Partial<Record<RangeValue, string>>;
  message: string;
}[] = [
  {
    name: 'requires a filter',
    values: { 'Reason (shown on the chart)': 'Reconcile chart' },
    message: 'At least one filter is required (from, to, min or max).',
  },
  {
    name: 'requires from to precede to',
    values: {
      'From (created >=)': '2026-02-02T10:00',
      'To (created <)': '2026-02-01T10:00',
      'Reason (shown on the chart)': 'Reconcile chart',
    },
    message: "'from' must be earlier than or equal to 'to'.",
  },
  {
    name: 'rejects a from value with seconds',
    values: { 'From (created >=)': '2026-09-30T19:00:30' },
    message: "Invalid 'from' date.",
  },
  {
    name: 'rejects a to value with seconds',
    values: { 'To (created <)': '2026-09-30T19:00:30' },
    message: "Invalid 'to' date.",
  },
  ...['1e3', '.5', '+5', '9'.repeat(309)].map((value) => ({
    name: `rejects ${value} as a minimum`,
    values: {
      'From (created >=)': '2026-01-15T10:00',
      'Min totalBalanceChf (exclusive)': value,
      'Reason (shown on the chart)': 'Reject invalid minimum',
    },
    message: "'min' must be a number.",
  })),
  ...['1e3', '.5', '+5', '9'.repeat(309)].map((value) => ({
    name: `rejects ${value} as a maximum`,
    values: {
      'From (created >=)': '2026-01-15T10:00',
      'Max totalBalanceChf (exclusive)': value,
      'Reason (shown on the chart)': 'Reject invalid maximum',
    },
    message: "'max' must be a number.",
  })),
  {
    name: 'requires min to be less than max',
    values: {
      'Min totalBalanceChf (exclusive)': '5',
      'Max totalBalanceChf (exclusive)': '5',
      'Reason (shown on the chart)': 'Reconcile chart',
    },
    message: "'min' must be less than 'max'.",
  },
  {
    name: 'requires a reason',
    values: { 'Min totalBalanceChf (exclusive)': '1' },
    message: 'A reason is required.',
  },
  {
    name: 'rejects a reason containing only spaces',
    values: {
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': '   ',
    },
    message: 'A reason is required.',
  },
  {
    name: 'limits the reason length',
    values: {
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': 'x'.repeat(1025),
    },
    message: 'The reason must be at most 1024 characters.',
  },
];

const LOCAL_DATE_TIME_RESULT_CASES: {
  name: string;
  label: 'From (created >=)' | 'To (created <)';
  value: string;
  status: 'invalid' | 'ambiguous';
  message: string;
}[] = [
  {
    name: 'rejects a from time in a daylight saving gap',
    label: 'From (created >=)',
    value: '2026-03-29T02:30',
    status: 'invalid',
    message: "Invalid 'from' date.",
  },
  {
    name: 'rejects a to time in a daylight saving gap',
    label: 'To (created <)',
    value: '2026-03-29T02:30',
    status: 'invalid',
    message: "Invalid 'to' date.",
  },
  {
    name: 'rejects an ambiguous from time',
    label: 'From (created >=)',
    value: '2026-10-25T02:30',
    status: 'ambiguous',
    message: "Ambiguous 'from' time (daylight saving change).",
  },
  {
    name: 'rejects an ambiguous to time',
    label: 'To (created <)',
    value: '2026-10-25T02:30',
    status: 'ambiguous',
    message: "Ambiguous 'to' time (daylight saving change).",
  },
];

describe('DashboardFinancialLogValidityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('guards and configures the screen and explains the range audit action', () => {
    renderScreen();

    expect(mockUseAdminGuard).toHaveBeenCalledWith();
    expect(mockUseLayoutOptions).toHaveBeenCalledWith({ title: 'Log Validity', noMaxWidth: true });
    expect(screen.getByLabelText('Reason (shown on the chart)')).toHaveAttribute('placeholder', 'Reason');
    expect(screen.getByLabelText('Min totalBalanceChf (exclusive)')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Max totalBalanceChf (exclusive)')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Add info point (set valid)' })).toBeInTheDocument();
    expect(screen.getByText(/A reason is required and is shown on the treasury chart/)).toHaveTextContent(
      "'Add info point' records the matched entries on the chart and sets any of them that are not valid to valid = true.",
    );
  });

  it('validates an empty and then a non-digit log ID through the ID rules', async () => {
    renderScreen();

    fireEvent.click(section('By log ID').getByRole('button', { name: 'Set valid = true' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('required');

    setInput('Log ID', '1e3');
    fireEvent.click(section('By log ID').getByRole('button', { name: 'Set valid = true' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('pattern'));
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('keeps the latest ID success visible for four seconds after overlapping successes', async () => {
    jest.useFakeTimers();
    mockCall.mockResolvedValueOnce({ id: 17, valid: true }).mockResolvedValueOnce({ id: 18, valid: true });
    renderScreen();
    setInput('Log ID', '17');

    await requestId('Set valid = true');
    expect(screen.getByTestId('confirmation-message')).toHaveTextContent('Set validity of log #17 to true?');
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({ url: 'log/17', method: 'PUT', data: { valid: true } });
    expect(await screen.findByText('Saved: log #17 set to valid = true')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(3000));
    setInput('Log ID', '18');
    await requestId('Set valid = true');
    await confirm();
    expect(await screen.findByText('Saved: log #18 set to valid = true')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Saved: log #18 set to valid = true')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2999));
    expect(screen.getByText('Saved: log #18 set to valid = true')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Saved: log #18 set to valid = true')).not.toBeInTheDocument();
  });

  it('sets one ID invalid', async () => {
    mockCall.mockResolvedValueOnce({ id: 18, valid: false });
    renderScreen();
    setInput('Log ID', '18');

    await requestId('Set valid = false');
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({ url: 'log/18', method: 'PUT', data: { valid: false } });
    expect(await screen.findByText('Saved: log #18 set to valid = false')).toBeInTheDocument();
  });

  it.each([
    { rejection: new Error('ID update failed'), message: 'ID update failed' },
    { rejection: 'rejected', message: 'Unknown error' },
  ])('shows $message when an ID call fails', async ({ rejection, message }) => {
    mockCall.mockRejectedValueOnce(rejection);
    renderScreen();
    setInput('Log ID', '19');

    await requestId('Set valid = true');
    await confirm();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it.each(RANGE_VALIDATION_CASES)('$name', async ({ values, message }) => {
    renderScreen();
    setRange(values);

    fireEvent.click(section('By financial range / threshold').getByRole('button', { name: 'Set valid = true' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it.each(LOCAL_DATE_TIME_RESULT_CASES)('$name', async ({ label, value, status, message }) => {
    const parseLocalDateTime = jest.spyOn(localDateTimeUtil, 'parseLocalDateTime').mockReturnValue({ status });
    renderScreen();
    setRange({ [label]: value });

    fireEvent.click(section('By financial range / threshold').getByRole('button', { name: 'Set valid = true' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(parseLocalDateTime).toHaveBeenCalledWith(value, Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('updates a fully filtered range to valid with a trimmed reason and a singular message', async () => {
    const from = '2026-01-01T10:00';
    const to = '2026-01-02T10:00';
    mockCall.mockResolvedValueOnce({ affected: 1, audited: 1 });
    renderScreen();
    setRange({
      'From (created >=)': from,
      'To (created <)': to,
      'Min totalBalanceChf (exclusive)': '-12.5',
      'Max totalBalanceChf (exclusive)': '9.5',
      'Reason (shown on the chart)': '  Correct reconciliation  ',
    });

    await requestRange('Set valid = true');
    expect(screen.getByTestId('confirmation-message')).toHaveTextContent(
      `Update all financial data logs matching from ${new Date(from).toISOString()}, to ${new Date(
        to,
      ).toISOString()}, min -12.5, max 9.5 to valid = true?`,
    );
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'log/financial/validity',
      method: 'PUT',
      data: {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        min: -12.5,
        max: 9.5,
        valid: true,
        reference: 'Correct reconciliation',
      },
    });
    expect(await screen.findByText('Updated 1 entry to valid = true.')).toBeInTheDocument();
    expect(screen.getByLabelText('From (created >=)')).toHaveValue('');
    expect(screen.getByLabelText('To (created <)')).toHaveValue('');
    expect(screen.getByLabelText('Min totalBalanceChf (exclusive)')).toHaveValue('');
    expect(screen.getByLabelText('Max totalBalanceChf (exclusive)')).toHaveValue('');
    expect(screen.getByLabelText('Reason (shown on the chart)')).toHaveValue('');
  });

  it('updates a range to invalid with a plural message', async () => {
    mockCall.mockResolvedValueOnce({ affected: 2, audited: 2 });
    renderScreen();
    setRange({
      'Min totalBalanceChf (exclusive)': '-10',
      'Reason (shown on the chart)': 'Exclude bad snapshots',
    });

    await requestRange('Set valid = false');
    expect(screen.getByTestId('confirmation-message')).toHaveTextContent(
      'Update all financial data logs matching min -10 to valid = false?',
    );
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'log/financial/validity',
      method: 'PUT',
      data: { min: -10, valid: false, reference: 'Exclude bad snapshots' },
    });
    expect(await screen.findByText('Updated 2 entries to valid = false.')).toBeInTheDocument();
  });

  it('accepts and sends a reason of exactly 1024 characters', async () => {
    const reference = 'x'.repeat(1024);
    mockCall.mockResolvedValueOnce({ affected: 0, audited: 0 });
    renderScreen();
    setRange({
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': reference,
    });

    await requestRange('Set valid = true');
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'log/financial/validity',
      method: 'PUT',
      data: { min: 1, valid: true, reference },
    });
    expect(await screen.findByText('Updated 0 entries to valid = true.')).toBeInTheDocument();
  });

  it('records a singular info point and requests valid true', async () => {
    mockCall.mockResolvedValueOnce({ affected: 0, audited: 1 });
    renderScreen();
    setRange({
      'Max totalBalanceChf (exclusive)': '500',
      'Reason (shown on the chart)': '  Treasury checkpoint  ',
    });

    await requestRange('Add info point (set valid)');
    expect(screen.getByTestId('confirmation-message')).toHaveTextContent(
      'Record an info point for all financial data logs matching max 500? Entries that are not valid yet are set to valid = true.',
    );
    await confirm();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'log/financial/validity',
      method: 'PUT',
      data: { max: 500, valid: true, reference: 'Treasury checkpoint', auditAll: true },
    });
    expect(
      await screen.findByText('Recorded an info point for 1 entry (0 changed to valid = true).'),
    ).toBeInTheDocument();
  });

  it('reports when an info point request matches no entries', async () => {
    mockCall.mockResolvedValueOnce({ affected: 0, audited: 0 });
    renderScreen();
    setRange({
      'Max totalBalanceChf (exclusive)': '500',
      'Reason (shown on the chart)': 'Empty checkpoint',
    });

    await requestRange('Add info point (set valid)');
    await confirm();

    expect(await screen.findByText('No matching entries; no info point was recorded.')).toBeInTheDocument();
  });

  it('records plural info points', async () => {
    mockCall.mockResolvedValueOnce({ affected: 1, audited: 3 });
    renderScreen();
    setRange({
      'From (created >=)': '2026-01-01T00:00',
      'Reason (shown on the chart)': 'Monthly checkpoint',
    });

    await requestRange('Add info point (set valid)');
    await confirm();

    expect(
      await screen.findByText('Recorded an info point for 3 entries (1 changed to valid = true).'),
    ).toBeInTheDocument();
  });

  it.each([
    { rejection: new Error('Range update failed'), message: 'Range update failed' },
    { rejection: 503, message: 'Unknown error' },
  ])('shows $message when a range call fails', async ({ rejection, message }) => {
    mockCall.mockRejectedValueOnce(rejection);
    renderScreen();
    setRange({
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': 'Retry range',
    });

    await requestRange('Set valid = true');
    await confirm();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Min totalBalanceChf (exclusive)')).toHaveValue('1');
    expect(screen.getByLabelText('Reason (shown on the chart)')).toHaveValue('Retry range');
  });

  it('cancels a pending range update without calling the API', async () => {
    renderScreen();
    setRange({
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': 'Do not apply',
    });

    await requestRange('Set valid = true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'By financial range / threshold' })).toBeInTheDocument();
    expect(screen.getByLabelText('Min totalBalanceChf (exclusive)')).toHaveValue('1');
    expect(screen.getByLabelText('Reason (shown on the chart)')).toHaveValue('Do not apply');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('keeps the latest range success visible for four seconds after overlapping successes', async () => {
    jest.useFakeTimers();
    mockCall.mockResolvedValueOnce({ affected: 1, audited: 1 }).mockResolvedValueOnce({ affected: 2, audited: 2 });
    renderScreen();
    setRange({
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': 'Temporary success',
    });

    await requestRange('Set valid = true');
    await confirm();
    expect(await screen.findByText('Updated 1 entry to valid = true.')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(3000));
    setRange({
      'Max totalBalanceChf (exclusive)': '10',
      'Reason (shown on the chart)': 'Latest success',
    });
    await requestRange('Set valid = false');
    await confirm();
    expect(await screen.findByText('Updated 2 entries to valid = false.')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Updated 2 entries to valid = false.')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2999));
    expect(screen.getByText('Updated 2 entries to valid = false.')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Updated 2 entries to valid = false.')).not.toBeInTheDocument();
  });

  it('clears pending success timers on unmount without warnings', async () => {
    jest.useFakeTimers();
    mockCall.mockResolvedValueOnce({ id: 20, valid: true }).mockResolvedValueOnce({ affected: 1, audited: 1 });
    const { unmount } = render(<DashboardFinancialLogValidityScreen />);

    setInput('Log ID', '20');
    await requestId('Set valid = true');
    await confirm();
    expect(await screen.findByText('Saved: log #20 set to valid = true')).toBeInTheDocument();

    setRange({
      'Min totalBalanceChf (exclusive)': '1',
      'Reason (shown on the chart)': 'Unmount cleanup',
    });
    await requestRange('Set valid = true');
    await confirm();
    expect(await screen.findByText('Updated 1 entry to valid = true.')).toBeInTheDocument();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      unmount();
      expect(jest.getTimerCount()).toBe(0);
      act(() => jest.runOnlyPendingTimers());
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });

  it('does not update ID state or start a timer when the request resolves after unmount', async () => {
    jest.useFakeTimers();
    let resolveCall: ((value: { id: number; valid: boolean }) => void) | undefined;
    const delayedCall = new Promise<{ id: number; valid: boolean }>((resolve) => {
      resolveCall = resolve;
    });
    mockCall.mockReturnValueOnce(delayedCall);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<DashboardFinancialLogValidityScreen />);

    try {
      setInput('Log ID', '21');
      await requestId('Set valid = true');
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(mockCall).toHaveBeenCalledTimes(1);

      unmount();
      const resolve = resolveCall;
      if (resolve === undefined) throw new Error('The delayed ID request was not created');
      await act(async () => {
        resolve({ id: 21, valid: true });
        await delayedCall;
        await Promise.resolve();
      });

      expect(jest.getTimerCount()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not update range state or start a timer when the request resolves after unmount', async () => {
    jest.useFakeTimers();
    let resolveCall: ((value: { affected: number; audited: number }) => void) | undefined;
    const delayedCall = new Promise<{ affected: number; audited: number }>((resolve) => {
      resolveCall = resolve;
    });
    mockCall.mockReturnValueOnce(delayedCall);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(<DashboardFinancialLogValidityScreen />);

    try {
      setRange({
        'From (created >=)': '2026-09-30T19:00',
        'Reason (shown on the chart)': 'Unmount pending range',
      });
      await requestRange('Set valid = true');
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(mockCall).toHaveBeenCalledTimes(1);

      unmount();
      const resolve = resolveCall;
      if (resolve === undefined) throw new Error('The delayed range request was not created');
      await act(async () => {
        resolve({ affected: 1, audited: 1 });
        await delayedCall;
        await Promise.resolve();
      });

      expect(jest.getTimerCount()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
