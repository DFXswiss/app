const mockUseRealunitGuard = jest.fn();
const mockFetchPriceHistory = jest.fn();
const mockFetchBuyVolume = jest.fn();
const mockFetchHolderCount = jest.fn();
const mockFetchRegistrationStats = jest.fn();

let mockContext: Record<string, unknown>;

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/realunit/price-history-chart', () => ({
  PriceHistoryChart: ({ onTimeframeChange }: { onTimeframeChange?: () => void }) => (
    <button type="button" data-testid="price-history-chart" onClick={onTimeframeChange}>
      chart
    </button>
  ),
}));
jest.mock('src/components/realunit/buy-volume-chart', () => ({
  BuyVolumeChart: () => <div data-testid="buy-volume-chart" />,
}));
jest.mock('src/components/realunit/holder-count-chart', () => ({
  HolderCountChart: () => <div data-testid="holder-count-chart" />,
}));
jest.mock('src/components/realunit/registration-funnel', () => ({
  RegistrationFunnel: () => <div data-testid="registration-funnel" />,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/contexts/realunit.context', () => ({
  useRealunitContext: () => mockContext,
}));

import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RealunitInsightsScreen from 'src/screens/realunit-insights.screen';

function setContext(overrides: Record<string, unknown> = {}) {
  mockContext = {
    priceHistory: [{ timestamp: '2026-01-01T00:00:00.000Z', chf: 1, eur: 1, usd: 1 }],
    priceHistoryError: false,
    timeframe: 'ALL',
    fetchPriceHistory: mockFetchPriceHistory,
    buyVolume: [],
    buyVolumeLoading: false,
    buyVolumeError: false,
    holderCount: [],
    holderCountLoading: false,
    holderCountError: false,
    registrationStats: undefined,
    registrationLoading: false,
    registrationError: false,
    fetchBuyVolume: mockFetchBuyVolume,
    fetchHolderCount: mockFetchHolderCount,
    fetchRegistrationStats: mockFetchRegistrationStats,
    buyVolumeTimeframe: 'All',
    holderCountTimeframe: 'All',
    registrationTimeframe: 'All',
    ...overrides,
  };
}

describe('RealunitInsightsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setContext();
  });

  it('bootstraps price history and stats only once when StrictMode re-invokes effects', async () => {
    setContext({
      priceHistory: [],
      buyVolume: [],
      holderCount: [],
      registrationStats: undefined,
    });
    render(
      <StrictMode>
        <RealunitInsightsScreen />
      </StrictMode>,
    );
    await waitFor(() => expect(mockFetchPriceHistory).toHaveBeenCalledTimes(1));
    expect(mockFetchBuyVolume).toHaveBeenCalledTimes(1);
    expect(mockFetchHolderCount).toHaveBeenCalledTimes(1);
    expect(mockFetchRegistrationStats).toHaveBeenCalledTimes(1);
    expect(mockFetchBuyVolume).toHaveBeenCalledWith('All');
    expect(mockFetchHolderCount).toHaveBeenCalledWith('All');
    expect(mockFetchRegistrationStats).toHaveBeenCalledWith('All');
  });

  it('skips price history fetch when data is already present', async () => {
    setContext();
    render(<RealunitInsightsScreen />);
    await waitFor(() => expect(mockFetchBuyVolume).toHaveBeenCalledTimes(1));
    expect(mockFetchPriceHistory).not.toHaveBeenCalled();
    expect(mockFetchBuyVolume).toHaveBeenCalledWith('All');
    expect(mockFetchHolderCount).toHaveBeenCalledWith('All');
    expect(mockFetchHolderCount).toHaveBeenCalledTimes(1);
    expect(mockFetchRegistrationStats).toHaveBeenCalledWith('All');
    expect(mockFetchRegistrationStats).toHaveBeenCalledTimes(1);
  });

  it('shows stats error hints and loading spinners', () => {
    setContext({
      buyVolumeError: true,
      holderCountError: true,
      registrationError: true,
    });
    render(<RealunitInsightsScreen />);
    expect(screen.getByText('Failed to load buy volume.')).toBeInTheDocument();
    expect(screen.getByText('Failed to load holder count.')).toBeInTheDocument();
    expect(screen.getByText('Failed to load registration stats.')).toBeInTheDocument();
  });

  it('shows medium spinners while stats are loading without data', () => {
    setContext({
      buyVolumeLoading: true,
      buyVolume: [],
      holderCountLoading: true,
      holderCount: [],
      registrationLoading: true,
      registrationStats: undefined,
    });
    render(<RealunitInsightsScreen />);
    expect(screen.getAllByTestId('loading-spinner').some((el) => el.getAttribute('data-size') === 'md')).toBe(true);
    expect(screen.queryByTestId('buy-volume-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('holder-count-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('registration-funnel')).not.toBeInTheDocument();
  });

  it('keeps stats charts visible while a timeframe refetch is loading', () => {
    setContext({
      buyVolumeLoading: true,
      buyVolume: [{ timestamp: '2026-08-01T00:00:00.000Z', chf: 10, shares: 5, priceChf: 2 }],
      holderCountLoading: true,
      holderCount: [{ timestamp: '2026-08-01T00:00:00.000Z', holders: 3 }],
      registrationLoading: true,
      registrationStats: {
        snapshot: {
          completed: 1,
          manualReview: 0,
          confirmed: 1,
          usersActive: 1,
          usersNa: 0,
          usersBlocked: 0,
          usersDeleted: 0,
        },
        series: [{ timestamp: '2026-08-01T00:00:00.000Z', registered: 1, confirmed: 1 }],
      },
    });
    render(<RealunitInsightsScreen />);
    expect(screen.getByTestId('buy-volume-chart')).toBeInTheDocument();
    expect(screen.getByTestId('holder-count-chart')).toBeInTheDocument();
    expect(screen.getByTestId('registration-funnel')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('does not render the registration funnel when stats failed without a snapshot', () => {
    setContext({
      registrationError: true,
      registrationStats: undefined,
      registrationLoading: false,
    });
    render(<RealunitInsightsScreen />);
    expect(screen.queryByTestId('registration-funnel')).not.toBeInTheDocument();
    expect(screen.getByText('Failed to load registration stats.')).toBeInTheDocument();
  });

  it('shows a price-history error and refetches on chart click', () => {
    setContext({ priceHistoryError: true });
    render(<RealunitInsightsScreen />);
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load price history.');
    fireEvent.click(screen.getByTestId('price-history-chart'));
    expect(mockFetchPriceHistory).toHaveBeenCalled();
  });
});
