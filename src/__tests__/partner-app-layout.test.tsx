import { render, screen, waitFor } from '@testing-library/react';
import PartnerDashboardView from 'src/partner-dashboard/App';

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: jest.fn() }),
}));

describe('partner dashboard block order', () => {
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

  it('places the Referral block after the KPI grid and before the volume chart', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(screen.getByTestId('referral-block')).toBeInTheDocument();
      expect(screen.getByTestId('volume-time-chart')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-grid')).toBeInTheDocument();
    });

    const kpi = screen.getByTestId('kpi-grid');
    const referral = screen.getByTestId('referral-block');
    const volume = screen.getByTestId('volume-time-chart');

    // Document order: KPI → Referral → Volume chart
    const position = kpi.compareDocumentPosition(referral);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const referralThenVolume = referral.compareDocumentPosition(volume);
    expect(referralThenVolume & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
