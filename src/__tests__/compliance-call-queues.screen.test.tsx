// Screen tests for the call-queue overview: the queues with their counts, named by callQueueLabel.

let mockIsLoggedIn = true;
const mockGetCallQueues = jest.fn();
const mockNavigate = jest.fn();
const mockUseComplianceGuard = jest.fn();
let capturedLayoutOptions: { title?: string } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
  AmlReason: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
  },
  CheckStatus: { PENDING: 'Pending', FAIL: 'Fail', PASS: 'Pass' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: ({ size }: any) => <div data-testid="loading-spinner" data-size={size} />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getCallQueues: mockGetCallQueues }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: { title?: string }) => {
    capturedLayoutOptions = options;
  },
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceCallQueuesScreen from 'src/screens/compliance-call-queues.screen';

describe('ComplianceCallQueuesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLayoutOptions = undefined;
    mockIsLoggedIn = true;
  });

  it('calls the guard and does not fetch while logged out', () => {
    mockIsLoggedIn = false;

    render(<ComplianceCallQueuesScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
    expect(mockGetCallQueues).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(capturedLayoutOptions?.title).toBe('Call Queues');
  });

  it('shows the fetch error', async () => {
    mockGetCallQueues.mockRejectedValue(new Error('Network down'));

    render(<ComplianceCallQueuesScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down'));
  });

  it('lists the queues under their labels and opens a queue by its key', async () => {
    mockGetCallQueues.mockResolvedValue([
      { queue: 'UnavailableSuspicious', count: 2 },
      { queue: 'ManualCheckPhone', count: 0 },
    ]);

    render(<ComplianceCallQueuesScreen />);

    await waitFor(() => expect(screen.getByText('Callback')).toBeInTheDocument());
    expect(screen.getByText('ManualCheckPhone')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // the full-stack specs read the key from the row, the cell shows the label
    expect(screen.getByText('Callback').closest('tr')).toHaveAttribute('data-queue', 'UnavailableSuspicious');

    fireEvent.click(screen.getByText('Callback'));
    expect(mockNavigate).toHaveBeenCalledWith('compliance/call-queues/UnavailableSuspicious');
  });

  it('shows the empty state without queues', async () => {
    mockGetCallQueues.mockResolvedValue([]);

    render(<ComplianceCallQueuesScreen />);

    await waitFor(() => expect(screen.getByText('No entries found')).toBeInTheDocument());
  });
});
