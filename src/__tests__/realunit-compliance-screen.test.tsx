// Component tests for the RealUnit compliance customer list screen: default empty-account filter,
// toggle, search bypass, empty-state messages, and Dilisense name-check actions. Heavy transitive deps
// are mocked so the screen can render under @testing-library/react without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => null,
}));
jest.mock('src/components/error-hint', () => ({ ErrorHint: () => null }));
jest.mock('src/components/confirm-dialog', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    onConfirm,
  }: {
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          Confirm
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
import RealunitComplianceScreen from 'src/screens/realunit-compliance.screen';
import { formatDate } from 'src/util/compliance-helpers';

const IDLE_BATCH = { status: 'idle' as const, total: 0, done: 0, failed: 0, skipped: 0 };

const FULL = {
  id: 1,
  kycStatus: 'Completed',
  kycLevel: '50',
  name: 'Alice Muster',
  mail: 'a@b.ch',
  balance: 3,
  canScreen: true,
  lastNameCheckDate: '2024-06-15T12:00:00.000Z',
  lastNameCheckStatus: 'NotSanctioned' as const,
};

const EMPTY = {
  id: 2,
  kycStatus: 'NA',
  kycLevel: '0',
  balance: 0,
  canScreen: false,
};

describe('RealunitComplianceScreen empty-account filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNameCheckBatch.mockResolvedValue(IDLE_BATCH);
  });

  it('filters empty accounts in the default view and shows the toggle with the empty count', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    expect(screen.queryByRole('cell', { name: '2' })).not.toBeInTheDocument();
    expect(screen.getByText(/Customers/)).toHaveTextContent('Customers: 2');
    expect(screen.getByText(/Hide empty accounts/)).toHaveTextContent('Hide empty accounts (1)');
  });

  it('shows empty accounts when the hide toggle is turned off', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByText('Alice Muster')).toBeInTheDocument();
  });

  it('bypasses the filter when a search is active and hides the toggle', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Search by ID, email, phone or name...');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSearchCustomers).toHaveBeenCalledWith('x');
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/Hide empty accounts/)).not.toBeInTheDocument();
  });

  it('shows a dedicated message when every account is hidden by the filter', async () => {
    mockSearchCustomers.mockResolvedValue([EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('All accounts are hidden by the filter above')).toBeInTheDocument();
    });

    expect(screen.queryByText('No entries found')).not.toBeInTheDocument();
  });

  it('shows the generic empty message and no toggle when the list is empty', async () => {
    mockSearchCustomers.mockResolvedValue([]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('No entries found')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Hide empty accounts/)).not.toBeInTheDocument();
  });

  it('re-engages the filter when the search is cleared', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Search by ID, email, phone or name...');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSearchCustomers).toHaveBeenLastCalledWith(undefined);
      expect(screen.queryByRole('cell', { name: '2' })).not.toBeInTheDocument();
      expect(screen.getByText(/Hide empty accounts/)).toHaveTextContent('Hide empty accounts (1)');
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

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens a confirm dialog when Screen all is clicked', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));

    expect(
      screen.getByText('Screening all named shareholders consumes Dilisense quota – continue?'),
    ).toBeInTheDocument();
  });

  it('disables Screen when canScreen is false', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));

    const emptyRow = screen.getByRole('cell', { name: '2' }).closest('tr');
    if (emptyRow == null) throw new Error('expected empty-account row');
    const screenButton = within(emptyRow).getByRole('button', { name: /^Screen$/ });
    expect(screenButton).toBeDisabled();
    expect(screenButton).toHaveAttribute('title', 'Cannot screen without a name');
  });

  it('renders the last Dilisense check date and translated status', async () => {
    mockSearchCustomers.mockResolvedValue([FULL, EMPTY]);
    render(<RealunitComplianceScreen />);

    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    expect(screen.getByText('Last Dilisense check')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText(formatDate(FULL.lastNameCheckDate))).toBeInTheDocument();
    expect(screen.getByText('Not sanctioned')).toBeInTheDocument();
  });

  it('renders Match without birthday and open vs evaluated Sanctioned', async () => {
    mockSearchCustomers.mockResolvedValue([
      { ...FULL, lastNameCheckStatus: 'MatchWithoutBirthday' as const },
    ]);
    const { unmount } = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Match without birthday')).toBeInTheDocument();
    });
    unmount();

    mockSearchCustomers.mockResolvedValue([
      { ...FULL, lastNameCheckStatus: 'Sanctioned' as const, lastNameCheckEvaluation: undefined },
    ]);
    const second = render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Sanctioned (Open hit)')).toBeInTheDocument();
    });
    second.unmount();

    mockSearchCustomers.mockResolvedValue([
      { ...FULL, lastNameCheckStatus: 'Sanctioned' as const, lastNameCheckEvaluation: 'Ignored' as const },
    ]);
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Sanctioned')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sanctioned (Open hit)')).not.toBeInTheDocument();
  });

  it('confirms a row screen and reloads the list', async () => {
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockScreenCustomer.mockResolvedValue({
      id: 1,
      riskStatus: 'NotSanctioned',
      date: '2024-06-16T12:00:00.000Z',
    });
    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Screen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockScreenCustomer).toHaveBeenCalledWith(1);
    });
    expect(mockSearchCustomers).toHaveBeenCalledTimes(2);
  });

  it('confirms Screen all and polls while the batch is running', async () => {
    jest.useFakeTimers();
    mockSearchCustomers.mockResolvedValue([FULL]);
    mockStartNameCheckBatch.mockResolvedValue({ status: 'running', total: 1, done: 0, failed: 0, skipped: 0 });
    mockGetNameCheckBatch
      .mockResolvedValueOnce(IDLE_BATCH)
      .mockResolvedValueOnce({ status: 'running', total: 1, done: 0, failed: 0, skipped: 0 })
      .mockResolvedValue({ status: 'completed', total: 1, done: 1, failed: 0, skipped: 0 });

    render(<RealunitComplianceScreen />);
    await waitFor(() => {
      expect(screen.getByText('Alice Muster')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Screen all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockStartNameCheckBatch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Screening {{done}} / {{total}}' })).toBeDisabled();
    });

    jest.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(mockGetNameCheckBatch.mock.calls.length).toBeGreaterThan(1);
    });

    jest.useRealTimers();
  });
});
