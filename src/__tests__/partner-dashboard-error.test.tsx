import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartnerDashboardView from 'src/partner-dashboard/App';
import { PartnerErrorBoundary } from 'src/partner-dashboard/components/error-boundary';
import { ErrorState } from 'src/partner-dashboard/components/error-state';
import { buildPartnerStatisticFixture, buildPartnerTimelineFixture } from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import { mockSettingsState } from './helpers/mock-settings-context';

jest.mock('src/contexts/settings.context', () => ({
  // jest hoists this factory; mock-prefixed import is allowed in scope
  useSettingsContext: () => mockSettingsState,
}));

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

const mockGetPartnerStatistic = jest.fn();
const mockGetPartnerTimeline = jest.fn();

jest.mock('src/hooks/partner-dashboard.hook', () => ({
  usePartnerDashboard: () => ({
    getPartnerStatistic: mockGetPartnerStatistic,
    getPartnerTimeline: mockGetPartnerTimeline,
    isFixture: false,
  }),
}));

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

describe('ErrorState', () => {
  it('renders the message and calls onRetry when Retry is pressed', async () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Partner metrics could not be loaded." onRetry={onRetry} />);

    const root = screen.getByTestId('dashboard-error');
    expect(root).toHaveAttribute('role', 'alert');
    expect(root).toHaveTextContent('Partner metrics could not be loaded.');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('PartnerDashboardView load error path', () => {
  beforeEach(() => {
    mockGetPartnerStatistic.mockReset();
    mockGetPartnerTimeline.mockReset();
  });

  it('shows dashboard-error with Error.message and clears KPIs when getPartnerStatistic fails', async () => {
    mockGetPartnerStatistic.mockRejectedValue(new Error('statistic endpoint 503'));
    mockGetPartnerTimeline.mockResolvedValue(buildPartnerTimelineFixture('Day'));

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dashboard-error')).toHaveTextContent('statistic endpoint 503');
    expect(screen.queryByTestId('kpi-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('volume-time-chart')).not.toBeInTheDocument();
  });

  it('uses the translated fallback when the rejection is not an Error with a message', async () => {
    mockGetPartnerStatistic.mockRejectedValue('raw-string-failure');
    mockGetPartnerTimeline.mockRejectedValue('raw-string-failure');

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dashboard-error')).toHaveTextContent(
      'Partner metrics could not be loaded.',
    );
  });

  it('uses the fallback when Error.message is empty', async () => {
    mockGetPartnerStatistic.mockRejectedValue(new Error(''));
    mockGetPartnerTimeline.mockRejectedValue(new Error(''));

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('dashboard-error')).toHaveTextContent(
      'Partner metrics could not be loaded.',
    );
  });

  it('Retry reloads metrics via a fresh load (reloadToken path)', async () => {
    mockGetPartnerStatistic
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(buildPartnerStatisticFixture());
    mockGetPartnerTimeline
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(buildPartnerTimelineFixture('Day'));

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });

    const callsAfterError = mockGetPartnerStatistic.mock.calls.length;
    expect(callsAfterError).toBeGreaterThanOrEqual(1);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(mockGetPartnerStatistic.mock.calls.length).toBeGreaterThan(callsAfterError);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('kpi-grid')).toBeInTheDocument();
    });
  });

  it('a later failure clears previously loaded KPIs (statistic/timeline null in catch)', async () => {
    mockGetPartnerStatistic
      .mockResolvedValueOnce(buildPartnerStatisticFixture())
      .mockRejectedValue(new Error('second failure'));
    mockGetPartnerTimeline
      .mockResolvedValueOnce(buildPartnerTimelineFixture('Day'))
      .mockRejectedValue(new Error('second failure'));

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-grid')).toBeInTheDocument();
    });

    // Period change re-runs load (same path as reloadToken) while KPI data is on screen
    await userEvent.click(screen.getByRole('button', { name: '90 days' }));

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('dashboard-error')).toHaveTextContent('second failure');
    expect(screen.queryByTestId('kpi-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('volume-time-chart')).not.toBeInTheDocument();
  });
});

describe('PartnerErrorBoundary handleRetry', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let shouldThrow = true;

  function MaybeBoom(): JSX.Element {
    if (shouldThrow) {
      throw new Error('boundary child boom');
    }
    return <div data-testid="boundary-recovered">recovered</div>;
  }

  beforeEach(() => {
    shouldThrow = true;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('componentDidCatch logs the error and Try again clears the boundary state', async () => {
    render(
      <PartnerErrorBoundary>
        <MaybeBoom />
      </PartnerErrorBoundary>,
    );

    expect(screen.getByTestId('partner-error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('partner-error-message')).toHaveTextContent('boundary child boom');

    // componentDidCatch breadcrumb
    expect(consoleErrorSpy).toHaveBeenCalled();
    const boundaryLog = consoleErrorSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('Partner dashboard error boundary'),
    );
    expect(boundaryLog).toBeDefined();
    expect(boundaryLog?.[1]).toBeInstanceOf(Error);

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(screen.getByTestId('boundary-recovered')).toBeInTheDocument();
    expect(screen.queryByTestId('partner-error-boundary')).not.toBeInTheDocument();
  });

  it('shows Unknown error when the thrown Error has an empty message', () => {
    function EmptyMessageBoom(): JSX.Element {
      throw new Error('');
    }

    render(
      <PartnerErrorBoundary>
        <EmptyMessageBoom />
      </PartnerErrorBoundary>,
    );

    expect(screen.getByTestId('partner-error-message')).toHaveTextContent('Unknown error');
  });
});
