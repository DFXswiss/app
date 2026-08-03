import { render, screen, waitFor } from '@testing-library/react';
import PartnerDashboardView from 'src/partner-dashboard/App';
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

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

describe('partner dashboard KPI groups', () => {
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

  it('splits period and all-time KPIs into labeled sections with correct membership', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-period-section')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-alltime-section')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-grid')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-alltime-grid')).toBeInTheDocument();
    });

    expect(screen.getByTestId('kpi-period-heading')).toHaveTextContent('This period');
    expect(screen.getByTestId('kpi-alltime-heading')).toHaveTextContent('All-time totals');

    const periodSection = screen.getByTestId('kpi-period-section');
    const alltimeSection = screen.getByTestId('kpi-alltime-section');
    const periodGrid = screen.getByTestId('kpi-grid');
    const alltimeGrid = screen.getByTestId('kpi-alltime-grid');

    expect(periodSection.contains(periodGrid)).toBe(true);
    expect(alltimeSection.contains(alltimeGrid)).toBe(true);

    const periodKpis = [
      'kpi-volume',
      'kpi-transactions',
      'kpi-avg',
      'kpi-active-users',
      'kpi-new-users',
    ] as const;
    const alltimeKpis = ['kpi-registered', 'kpi-trading-users', 'kpi-lifetime-volume'] as const;

    for (const testId of periodKpis) {
      const tile = screen.getByTestId(testId);
      expect(periodGrid.contains(tile)).toBe(true);
      expect(alltimeGrid.contains(tile)).toBe(false);
    }

    for (const testId of alltimeKpis) {
      const tile = screen.getByTestId(testId);
      expect(alltimeGrid.contains(tile)).toBe(true);
      expect(periodGrid.contains(tile)).toBe(false);
    }

    // Document order: period grid before all-time grid
    const order = periodGrid.compareDocumentPosition(alltimeGrid);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
