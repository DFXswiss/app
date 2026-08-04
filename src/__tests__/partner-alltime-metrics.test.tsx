import { render, screen, waitFor } from '@testing-library/react';
import PartnerDashboardView from 'src/partner-dashboard/App';
import {
  formatAmountWhole,
  formatCount,
  formatPercent,
} from 'src/partner-dashboard/util/format';
import { mockSettingsState } from 'src/test-helpers/mock-settings-context';

jest.mock('src/contexts/settings.context', () => ({
  // jest allows out-of-scope vars prefixed with `mock` inside the factory
  useSettingsContext: () => mockSettingsState,
}));

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

describe('partner dashboard all-time metrics (trading users + lifetime volume)', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = 'true';
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('fetch must not be called in fixture mode');
    });
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
    fetchSpy.mockRestore();
  });

  it('shows trading users, conversion rate caption, and lifetime volume with buy/sell split', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-trading-users')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-lifetime-volume')).toBeInTheDocument();
    });

    // Fixture: tradingUsers=24360, registeredUsers=126547, volume.total=12713029.93
    const tradingCount = formatCount(24360);
    const tradingTile = screen.getByTestId('kpi-trading-users');
    expect(tradingTile).toHaveTextContent(tradingCount);

    const tradingCaption = screen.getByTestId('kpi-trading-users-caption');
    expect(tradingCaption).toHaveTextContent('of registered users');
    // ~19.2 % (one decimal); do not hard-code a specific rounding beyond formatPercent
    expect(tradingCaption.textContent).toMatch(/19[,.][23]\s*%/);
    // Sanity: same as formatPercent on the fixture ratio
    const expectedPct = formatPercent(24360 / 126547, 1);
    expect(tradingCaption).toHaveTextContent(expectedPct);

    const lifetimeTotal = formatAmountWhole(12_713_029.93, 'CHF');
    const lifetimeTile = screen.getByTestId('kpi-lifetime-volume');
    expect(lifetimeTile).toHaveTextContent(lifetimeTotal);

    const lifetimeCaption = screen.getByTestId('kpi-lifetime-volume-caption');
    expect(lifetimeCaption).toHaveTextContent('Buy');
    expect(lifetimeCaption).toHaveTextContent('Sell');
    expect(lifetimeCaption).toHaveTextContent(formatAmountWhole(11_858_002.52, 'CHF'));
    expect(lifetimeCaption).toHaveTextContent(formatAmountWhole(855_027.41, 'CHF'));

    // DOM order: registered → trading users → lifetime volume
    const registered = screen.getByTestId('kpi-registered');
    const trading = screen.getByTestId('kpi-trading-users');
    const lifetime = screen.getByTestId('kpi-lifetime-volume');

    expect(registered.compareDocumentPosition(trading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trading.compareDocumentPosition(lifetime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
