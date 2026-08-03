import { act, render, screen, waitFor } from '@testing-library/react';
import { usePartnerDashboard } from 'src/hooks/partner-dashboard.hook';
import PartnerDashboardView from 'src/partner-dashboard/App';
import { PartnerErrorBoundary } from 'src/partner-dashboard/components/error-boundary';
import { mockSettingsState } from './helpers/mock-settings-context';

jest.mock('src/contexts/settings.context', () => ({
  // jest hoists this factory; mock-prefixed import is allowed in scope
  useSettingsContext: () => mockSettingsState,
}));

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

function HookProbe(): JSX.Element {
  const { getPartnerStatistic, getPartnerTimeline, isFixture } = usePartnerDashboard();
  return (
    <div>
      <span data-testid="is-fixture">{String(isFixture)}</span>
      <button
        type="button"
        data-testid="load"
        onClick={() => {
          void getPartnerStatistic().then(() => undefined);
          void getPartnerTimeline().then(() => undefined);
        }}
      >
        load
      </button>
    </div>
  );
}

describe('fixture mode makes no API calls (D5)', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    mockCall.mockReset();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called in fixture mode');
    });
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
    fetchSpy.mockRestore();
  });

  it('usePartnerDashboard returns fixtures without calling fetch or guarded API', async () => {
    render(<HookProbe />);
    expect(screen.getByTestId('is-fixture')).toHaveTextContent('true');

    await act(async () => {
      screen.getByTestId('load').click();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('PartnerDashboardView renders in fixture mode without network', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('partner-dashboard-root')).toHaveAttribute('data-fixture', 'true');
    });
    await waitFor(() => {
      expect(screen.getByTestId('partner-header')).toBeInTheDocument();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('error boundary keeps the shell usable (D5)', () => {
  function Boom(): JSX.Element {
    throw new Error('simulated context bootstrap failure');
  }

  // Mute expected React error-boundary noise
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders an embedded message instead of unmounting the page', () => {
    render(
      <PartnerErrorBoundary>
        <Boom />
      </PartnerErrorBoundary>,
    );

    expect(screen.getByTestId('partner-error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('partner-error-message')).toHaveTextContent(
      'simulated context bootstrap failure',
    );
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });
});
