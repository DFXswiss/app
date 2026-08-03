import { renderHook } from '@testing-library/react';
import { usePartnerDashboard } from 'src/hooks/partner-dashboard.hook';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

describe('usePartnerDashboard via useGuardedApi', () => {
  const originalFixture = process.env.REACT_APP_PARTNER_FIXTURE;

  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue({});
    process.env.REACT_APP_PARTNER_FIXTURE = 'false';
  });

  afterEach(() => {
    process.env.REACT_APP_PARTNER_FIXTURE = originalFixture;
  });

  it('calls statistic/partner and statistic/partner/timeline with session-backed call', async () => {
    const { result } = renderHook(() => usePartnerDashboard());
    expect(result.current.isFixture).toBe(false);

    await result.current.getPartnerStatistic({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
    });
    expect(mockCall).toHaveBeenCalledWith({
      url: 'statistic/partner?from=2026-01-01T00%3A00%3A00.000Z&to=2026-01-31T00%3A00%3A00.000Z',
      method: 'GET',
    });

    mockCall.mockClear();
    await result.current.getPartnerTimeline({ granularity: 'Week' });
    expect(mockCall).toHaveBeenCalledWith({
      url: 'statistic/partner/timeline?granularity=Week',
      method: 'GET',
    });
  });
});
