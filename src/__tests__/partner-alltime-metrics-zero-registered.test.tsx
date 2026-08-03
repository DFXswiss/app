import { render, screen, waitFor, within } from '@testing-library/react';
import MainPartner from 'src/Main.partner';
import { formatAmountWhole, formatCount } from 'src/partner-dashboard/util/format';

/**
 * Render-path proof for the zero-registered guard.
 *
 * Separate file on purpose: mocking `usePartnerDashboard` here would break the
 * real-fixture suite in `partner-alltime-metrics.test.tsx` if co-located.
 */
jest.mock('src/hooks/partner-dashboard.hook', () => {
  const actual = jest.requireActual('src/hooks/partner-dashboard.hook');
  const { buildPartnerStatisticFixture, buildPartnerTimelineFixture } = jest.requireActual(
    'src/partner-dashboard/fixtures/partner-statistic.fixture',
  );
  const zeroAllTimeStatistic = {
    ...buildPartnerStatisticFixture(),
    allTime: {
      volume: { buy: 0, sell: 0, total: 0 },
      registeredUsers: 0,
      tradingUsers: 0,
    },
  };
  return {
    ...actual,
    usePartnerDashboard: () => ({
      isFixture: true,
      getPartnerStatistic: async () => zeroAllTimeStatistic,
      getPartnerTimeline: async () => buildPartnerTimelineFixture('Day'),
    }),
  };
});

jest.mock('react-apexcharts', () => {
  return function MockChart() {
    return <div data-testid="mock-apex-chart" />;
  };
});

describe('partner dashboard all-time metrics with zero registered users', () => {
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

  it('shows a not-applicable conversion caption — never NaN, Infinity, or a percent', async () => {
    render(<MainPartner />);

    await waitFor(() => {
      expect(screen.getByTestId('kpi-trading-users')).toBeInTheDocument();
    });

    const tradingTile = screen.getByTestId('kpi-trading-users');

    // 1. Trading users is a real zero (formatCount), not the absent placeholder.
    const valueEl = within(tradingTile).getByTestId('kpi-value');
    expect(within(tradingTile).queryByTestId('kpi-absent')).not.toBeInTheDocument();
    expect(valueEl).toHaveTextContent(formatCount(0));

    // 2–4. Caption: visible not-applicable state; no rate formatting, no NaN/Infinity.
    // Intentionally does NOT assert the exact prose — that would only prove two literals match.
    const caption = screen.getByTestId('kpi-trading-users-caption');
    const captionText = caption.textContent ?? '';
    expect(captionText).not.toMatch(/NaN/i);
    expect(captionText).not.toMatch(/Infinity/i);
    // Real conversion rates always go through formatPercent → suffix " %".
    expect(captionText).not.toMatch(/%/);
    expect(captionText.trim().length).toBeGreaterThan(1);
    expect(captionText.trim()).not.toBe('–');

    // 5. Lifetime volume under the same zero scenario stays a real zero, not NaN.
    const lifetimeTile = screen.getByTestId('kpi-lifetime-volume');
    expect(lifetimeTile).toHaveTextContent(formatAmountWhole(0, 'CHF'));
    const lifetimeCaption = screen.getByTestId('kpi-lifetime-volume-caption');
    const lifetimeCaptionText = lifetimeCaption.textContent ?? '';
    expect(lifetimeCaptionText).not.toMatch(/NaN/i);
    expect(lifetimeCaptionText).not.toMatch(/Infinity/i);
    expect(lifetimeCaptionText).toContain(formatAmountWhole(0, 'CHF'));
  });
});
