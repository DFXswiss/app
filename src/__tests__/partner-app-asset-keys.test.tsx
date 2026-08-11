import { render, screen, waitFor } from '@testing-library/react';
import PartnerDashboardView from 'src/partner-dashboard/App';
import { buildPartnerStatisticFixture, buildPartnerTimelineFixture } from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import { mockSettingsState } from './helpers/mock-settings-context';

jest.mock('src/contexts/settings.context', () => ({
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

describe('PartnerDashboardView asset row key without blockchain', () => {
  beforeEach(() => {
    mockGetPartnerStatistic.mockReset();
    mockGetPartnerTimeline.mockReset();
  });

  it('labels an asset by name alone when blockchain is null (no " (…)" suffix)', async () => {
    const base = buildPartnerStatisticFixture();
    mockGetPartnerStatistic.mockResolvedValue({
      ...base,
      breakdown: {
        ...base.breakdown,
        assets: [
          {
            name: 'NoChainCoin',
            blockchain: null,
            direction: 'Buy' as const,
            volume: 42,
            transactions: 3,
          },
          // Second row with same name+null merges into one bar
          {
            name: 'NoChainCoin',
            blockchain: null,
            direction: 'Sell' as const,
            volume: 8,
            transactions: 1,
          },
        ],
      },
    });
    mockGetPartnerTimeline.mockResolvedValue(buildPartnerTimelineFixture('Day'));

    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('bars-assets')).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId('bar-row');
    const noChain = rows.find((el) => el.getAttribute('data-name') === 'NoChainCoin');
    expect(noChain).toBeTruthy();
    // Must not invent a parenthetical blockchain label
    expect(noChain?.getAttribute('data-name')).toBe('NoChainCoin');
    expect(noChain?.textContent).not.toMatch(/NoChainCoin \(/);
    // Merged volume 42+8
    expect(noChain).toHaveTextContent('50 CHF');
  });
});
