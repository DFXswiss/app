// Component tests for the RealUnit compliance customer list screen: default empty-account filter,
// toggle, search bypass, empty-state messages, and Dilisense name-check actions. Heavy transitive deps
// are mocked so the screen can render under @testing-library/react without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));
jest.mock('src/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));
jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: () => undefined,
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockSearchCustomers = jest.fn();
const mockScreenCustomer = jest.fn();
const mockStartNameCheckBatch = jest.fn();
const mockGetNameCheckBatch = jest.fn();
jest.mock('src/hooks/realunit-compliance.hook', () => ({
  useRealunitCompliance: () => ({
    searchCustomers: mockSearchCustomers,
    screenCustomer: mockScreenCustomer,
    startNameCheckBatch: mockStartNameCheckBatch,
    getNameCheckBatch: mockGetNameCheckBatch,
  }),
}));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RealUnitNameCheckBatchDto } from 'src/dto/realunit-compliance.dto';
import RealunitComplianceScreen from 'src/screens/realunit-compliance.screen';
import { formatDate } from 'src/util/compliance-helpers';

const IDLE_BATCH = { status: 'Idle' as const, total: 0, done: 0, failed: 0, skipped: 0 };

const FULL = {
  id: 1,
  kycStatus: 'Completed',
  kycLevel: '50',
  name: 'Alice Muster',
  mail: 'a@b.ch',
  balance: 3,
  canScreen: true,
  realUnitInsider: false,
  lastNameCheckDate: '2024-06-15T12:00:00.000Z',
  lastNameCheckStatus: 'NoMatch' as const,
};

const EMPTY = {
  id: 2,
  kycStatus: 'NA',
  kycLevel: '0',
  balance: 0,
  canScreen: false,
  realUnitInsider: true,
};

async function loadAll(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Load all customers' }));
  await waitFor(() => {
    expect(screen.getByText('Alice Muster')).toBeInTheDocument();
  });
}

describe('RealunitComplianceScreen empty-account filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNameCheckBatch.mockResolvedValue(IDLE_BATCH);
  });

  it('does not load customers on open', async () => {
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(mockGetNameCheckBatch).toHaveBeenCalled();
    });
    expect(mockSearchCustomers).not.toHaveBeenCalled();
    expect(screen.getByText(/No customers loaded/)).toBeInTheDocument();
  });

  it('loads the complete list only after Load all customers', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();
    expect(mockSearchCustomers).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
  });

  it('filters to insiders after an explicit load', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'insider' } });
    expect(screen.queryByText('Alice Muster')).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
  });

  it('filters to accounts without balance after an explicit load', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'without' } });
    expect(screen.queryByText('Alice Muster')).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
  });

  it('searches only when a key is present', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    const input = screen.getByPlaceholderText('Search by ID, email, phone or name...');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockSearchCustomers).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(mockSearchCustomers).toHaveBeenCalledWith('x');
    });
  });
});

describe('RealunitComplianceScreen name-check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNameCheckBatch.mockResolvedValue(IDLE_BATCH);
  });

  it('does not navigate when the Screen button is clicked', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens a confirm dialog when Screen all is clicked', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));

    expect(
      screen.getByText('Screening all named shareholders consumes Dilisense quota – continue?'),
    ).toBeInTheDocument();
  });

  it('disables Screen when canScreen is false', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    const emptyRow = screen.getByRole('cell', { name: '2' }).closest('tr');
    if (emptyRow == null) throw new Error('expected empty-account row');
    const screenButton = within(emptyRow).getByRole('button', { name: /^Screen$/ });
    expect(screenButton).toBeDisabled();
    expect(screenButton).toHaveAttribute('title', 'Cannot screen without a name');
  });

  it('renders the last Dilisense check date and translated status', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    expect(screen.getByText('Last Dilisense check')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText(formatDate(FULL.lastNameCheckDate))).toBeInTheDocument();
    expect(screen.getByText('No match')).toBeInTheDocument();
  });

  it('renders Match without Birthday and open vs evaluated Match with Birthday', async () => {
    mockSearchCustomers.mockResolvedValue([{ ...FULL, lastNameCheckStatus: 'MatchWithoutBirthday' as const }]);
    const { unmount } = render(<RealunitComplianceScreen />);
    await loadAll();
    expect(screen.getByText('Match without Birthday')).toBeInTheDocument();
    unmount();

    mockSearchCustomers.mockResolvedValue([
      { ...FULL, lastNameCheckStatus: 'MatchWithBirthday' as const, lastNameCheckEvaluation: undefined },
    ]);
    const second = render(<RealunitComplianceScreen />);
    await loadAll();
    expect(screen.getByText('Match with Birthday (Open)')).toBeInTheDocument();
    second.unmount();

    mockSearchCustomers.mockResolvedValue([
      { ...FULL, lastNameCheckStatus: 'MatchWithBirthday' as const, lastNameCheckEvaluation: 'Ignored' as const },
    ]);
    render(<RealunitComplianceScreen />);
    await loadAll();
    expect(screen.getByText('Match with Birthday')).toBeInTheDocument();
    expect(screen.queryByText('Match with Birthday (Open)')).not.toBeInTheDocument();
  });

  it('confirms a row screen and reloads the list', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockResolvedValue({
      id: 1,
      riskStatus: 'NoMatch',
      date: '2024-06-16T12:00:00.000Z',
    });
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockScreenCustomer).toHaveBeenCalledWith(1);
    });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(2);
  });

  it('does not apply a stale list after a newer loadCustomers', async () => {
    jest.useFakeTimers();
    let resolveSearch: (value: (typeof FULL)[]) => void = () => undefined;
    mockSearchCustomers
      .mockResolvedValueOnce([FULL])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSearch = resolve;
          }),
      )
      .mockResolvedValue([
        { ...FULL, lastNameCheckStatus: 'MatchWithBirthday' as const, lastNameCheckEvaluation: 'Ignored' as const },
      ]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Completed', total: 1, done: 1, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by ID, email, phone or name...'), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByText('Match with Birthday')).toBeInTheDocument();
    });

    resolveSearch([{ ...FULL, name: 'Stale Name' }]);
    await waitFor(() => {
      expect(screen.queryByText('Stale Name')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Match with Birthday')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('does not apply a stale list error after a newer loadCustomers', async () => {
    jest.useFakeTimers();
    let rejectSearch: (reason: Error) => void = () => undefined;
    mockSearchCustomers
      .mockResolvedValueOnce([FULL])
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSearch = reject;
          }),
      )
      .mockResolvedValue([
        { ...FULL, lastNameCheckStatus: 'MatchWithBirthday' as const, lastNameCheckEvaluation: 'Ignored' as const },
      ]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Completed', total: 1, done: 1, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by ID, email, phone or name...'), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByText('Match with Birthday')).toBeInTheDocument();
    });

    rejectSearch(new Error('stale search down'));
    await waitFor(() => {
      expect(screen.queryByText('stale search down')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Match with Birthday')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('confirms Screen all and polls while the batch is running', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockResolvedValue({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 });
    mockGetNameCheckBatch
      .mockResolvedValueOnce(IDLE_BATCH)
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Completed', total: 1, done: 1, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockStartNameCheckBatch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();

    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(mockGetNameCheckBatch.mock.calls.length).toBeGreaterThan(1);
    });

    jest.useRealTimers();
  });

  it('shows an error when the customer list fails to load', async () => {
    mockSearchCustomers.mockRejectedValue(new Error('list down'));
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('list down')).toBeInTheDocument();
    });
  });

  it('shows an error when the batch status fails to load', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockRejectedValue(new Error('batch down'));
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('batch down')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Screen$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Screen all' })).toBeDisabled();
  });

  it('shows an error when a row screen fails', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockRejectedValue(new Error('dilisense down'));
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByText('dilisense down')).toBeInTheDocument();
    });
  });

  it('clears a previous row-screen error when confirm starts again', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockRejectedValueOnce(new Error('dilisense down')).mockResolvedValue(undefined);
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('dilisense down')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.queryByText('dilisense down')).not.toBeInTheDocument();
    });
  });

  it('closes the confirm dialog on Cancel', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    expect(
      screen.getByText('Screening all named shareholders consumes Dilisense quota – continue?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Screening all named shareholders consumes Dilisense quota – continue?'),
    ).not.toBeInTheDocument();
  });

  it('starts polling when a batch is already running on mount', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 3, done: 1, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Completed', total: 3, done: 3, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(mockSearchCustomers.mock.calls.length).toBeGreaterThan(1);
    });
    jest.useRealTimers();
  });

  it('keeps screening locked when polling errors', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 3, done: 1, failed: 0, skipped: 0 })
      .mockRejectedValue(new Error('poll down'));

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(screen.getByText('poll down')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    jest.useRealTimers();
  });

  it('does not start a second screen while confirm is in flight', async () => {
    let resolveScreen: () => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScreen = () => resolve(undefined);
        }),
    );
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(mockScreenCustomer).toHaveBeenCalledTimes(1);
    resolveScreen();
    await waitFor(() => {
      expect(mockSearchCustomers.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('navigates to the customer dossier when a row is clicked', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByText('Alice Muster'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/compliance/user/1');
  });

  it('reloads the list when Screen all finishes immediately', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockResolvedValue({
      status: 'Completed',
      total: 0,
      done: 0,
      failed: 0,
      skipped: 1,
    });
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockStartNameCheckBatch).toHaveBeenCalled();
      expect(mockSearchCustomers).toHaveBeenCalledTimes(2);
    });
  });

  it('shows an error when Screen all fails to start', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockRejectedValue(new Error('quota'));
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByText('quota')).toBeInTheDocument();
    });
  });

  it('renders a dash for an unknown result and a missing date', async () => {
    mockSearchCustomers.mockResolvedValue([
      {
        ...FULL,
        lastNameCheckDate: undefined,
        lastNameCheckStatus: undefined,
        balance: undefined,
        accountType: undefined,
        mail: undefined,
        kycLevel: undefined,
      },
    ]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    const row = screen.getByText('Alice Muster').closest('tr');
    if (row == null) throw new Error('expected customer row');
    expect(within(row).getAllByText('-').length).toBeGreaterThan(0);
  });

  it('does not navigate when the Screen cell is clicked outside the button', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    render(<RealunitComplianceScreen />);
    await loadAll();

    const cell = screen.getByRole('button', { name: /^Screen$/ }).closest('td');
    if (cell == null) throw new Error('expected Screen cell');
    fireEvent.click(cell);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows Unknown error when a list load fails without a message', async () => {
    mockSearchCustomers.mockRejectedValue({ message: undefined });
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('keeps the confirm dialog open while a screen request is in flight', async () => {
    let resolveScreen: () => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScreen = () => resolve(undefined);
        }),
    );
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByText('A Dilisense screening consumes provider quota and costs money – continue?'),
    ).toBeInTheDocument();

    resolveScreen();
    await waitFor(() => {
      expect(
        screen.queryByText('A Dilisense screening consumes provider quota and costs money – continue?'),
      ).not.toBeInTheDocument();
    });
  });

  it('disables Search while a row screen is in flight and still closes the dialog', async () => {
    let resolveScreen: () => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScreen = () => resolve(undefined);
        }),
    );
    render(<RealunitComplianceScreen />);
    await loadAll();

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText('Search by ID, email, phone or name...'), { key: 'Enter' });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
    resolveScreen();

    await waitFor(() => {
      expect(
        screen.queryByText('A Dilisense screening consumes provider quota and costs money – continue?'),
      ).not.toBeInTheDocument();
    });
  });

  it('ignores a late row-screen result after unmount', async () => {
    let resolveScreen: () => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScreen = () => resolve(undefined);
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    unmount();
    resolveScreen();
  });

  it('ignores a late row-screen error after unmount', async () => {
    let rejectScreen: (reason: Error) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectScreen = reject;
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    unmount();
    rejectScreen(new Error('late'));
  });

  it('ignores a late Screen-all error after unmount', async () => {
    let rejectBatch: (reason: Error) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockResolvedValue(IDLE_BATCH);
    mockStartNameCheckBatch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectBatch = reject;
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    unmount();
    rejectBatch(new Error('late'));
  });

  it('skips overlapping poll ticks while a request is in flight', async () => {
    jest.useFakeTimers();
    let resolvePoll: (value: RealUnitNameCheckBatchDto) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 2, done: 0, failed: 0, skipped: 0 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          }),
      )
      .mockResolvedValue({ status: 'Completed', total: 2, done: 2, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    jest.advanceTimersByTime(2000);
    jest.advanceTimersByTime(2000);
    expect(mockGetNameCheckBatch).toHaveBeenCalledTimes(2);
    resolvePoll({ status: 'Running', total: 2, done: 1, failed: 0, skipped: 0 });
    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(mockGetNameCheckBatch.mock.calls.length).toBeGreaterThan(2);
    });
    jest.useRealTimers();
  });

  it('ignores a poll result after the screen unmounts', async () => {
    let resolvePoll: (value: RealUnitNameCheckBatchDto) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          }),
      );

    jest.useFakeTimers();
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    jest.advanceTimersByTime(2000);
    unmount();
    resolvePoll({ status: 'Completed', total: 1, done: 1, failed: 0, skipped: 0 });
    jest.useRealTimers();
  });

  it('shows an ellipsis on Search while the list is loading', async () => {
    let resolveSearch: (value: (typeof FULL)[]) => void = () => undefined;
    mockSearchCustomers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '…' })).toBeDisabled();
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Search by ID, email, phone or name...'), { key: 'Enter' });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
    resolveSearch([FULL]);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
  });

  it('does not search when a non-Enter key is pressed', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    render(<RealunitComplianceScreen />);
    await loadAll();
    const input = screen.getByPlaceholderText('Search by ID, email, phone or name...');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'a' });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
  });

  it('shows Unknown error when polling fails without a message', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockRejectedValue({});
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
    jest.useRealTimers();
  });

  it('shows Unknown error when the batch status fails without a message', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockRejectedValue({});
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('shows Unknown error when a row screen fails without a message', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockRejectedValue({});
    render(<RealunitComplianceScreen />);
    await loadAll();
    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('shows Unknown error when Screen all fails without a message', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockRejectedValue({});
    render(<RealunitComplianceScreen />);
    await loadAll();
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('ignores a poll error after the screen unmounts', async () => {
    let rejectPoll: (reason: Error) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPoll = reject;
          }),
      );
    jest.useFakeTimers();
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    jest.advanceTimersByTime(2000);
    unmount();
    rejectPoll(new Error('late'));
    jest.useRealTimers();
  });

  it('ignores a late mount batch response after unmount', async () => {
    let resolveBatch: (value: RealUnitNameCheckBatchDto) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    unmount();
    resolveBatch({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 });
  });

  it('ignores a late Screen-all response after unmount', async () => {
    let resolveBatch: (value: RealUnitNameCheckBatchDto) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockResolvedValue(IDLE_BATCH);
    mockStartNameCheckBatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    unmount();
    resolveBatch({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 });
  });

  it('disables Screen until the mount batch status has loaded', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitComplianceScreen />);
    await loadAll();
    expect(screen.getByRole('button', { name: /^Screen$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Screen all' })).toBeDisabled();
  });

  it('shows a failed mount batch status without reloading the list', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockResolvedValue({
      status: 'Failed',
      total: 2,
      done: 0,
      failed: 2,
      skipped: 0,
      error: 'quota',
    });
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('quota')).toBeInTheDocument();
    });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
  });

  it('shows a failed Screen-all response without treating it as success', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockResolvedValue({
      status: 'Failed',
      total: 1,
      done: 0,
      failed: 1,
      skipped: 0,
      error: 'quota',
    });
    render(<RealunitComplianceScreen />);
    await loadAll();
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('quota')).toBeInTheDocument();
    });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
  });

  it('clears a Failed batch error when a new run starts', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch
      .mockResolvedValueOnce({
        status: 'Failed',
        total: 1,
        done: 0,
        failed: 1,
        skipped: 0,
        error: 'quota',
      })
      .mockResolvedValue({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 });
    render(<RealunitComplianceScreen />);
    await loadAll();
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText('quota')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.queryByText('quota')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
  });

  it('keeps a failed poll status error instead of reloading the list', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 2, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Failed', total: 2, done: 0, failed: 2, skipped: 0, error: 'quota' });
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    const callsBeforePoll = mockSearchCustomers.mock.calls.length;
    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(screen.getByText('quota')).toBeInTheDocument();
    });
    expect(mockSearchCustomers.mock.calls.length).toBe(callsBeforePoll);
    jest.useRealTimers();
  });

  it('ignores a late mount batch error after unmount', async () => {
    let rejectBatch: (reason: Error) => void = () => undefined;
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectBatch = reject;
        }),
    );
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });
    unmount();
    rejectBatch(new Error('late batch'));
  });

  it('shows Unknown error when a failed poll status has no error', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockGetNameCheckBatch
      .mockResolvedValueOnce({ status: 'Running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'Failed', total: 1, done: 0, failed: 1, skipped: 0 });
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });
    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
    jest.useRealTimers();
  });
});
