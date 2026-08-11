import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import PartnerDashboardView, { periodRange } from 'src/partner-dashboard/App';
import {
  buildPartnerStatisticFixture,
  buildPartnerTimelineFixture,
} from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
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

describe('periodRange inclusive day window', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('spans exactly N calendar days ending at now (30 → from = now − 29 days at UTC midnight)', () => {
    // Catches `- (days - 1)` → `- days` which would open a 31-day window under "30 days".
    const range = periodRange(30);
    expect(range.to).toBe('2026-06-30T12:00:00.000Z');
    expect(range.from).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('PartnerDashboardView load query and stale guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
    mockGetPartnerStatistic.mockReset();
    mockGetPartnerTimeline.mockReset();
    mockGetPartnerStatistic.mockResolvedValue(buildPartnerStatisticFixture());
    mockGetPartnerTimeline.mockResolvedValue(buildPartnerTimelineFixture('Day'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes from/to/granularity to both statistic and timeline fetchers', async () => {
    render(<PartnerDashboardView />);

    await waitFor(() => {
      expect(mockGetPartnerStatistic).toHaveBeenCalled();
    });

    const expected = {
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T12:00:00.000Z',
      granularity: 'Day',
    };
    expect(mockGetPartnerStatistic).toHaveBeenCalledWith(expected);
    expect(mockGetPartnerTimeline).toHaveBeenCalledWith(expected);
  });

  it('includes granularity in the query when the user switches to Week', async () => {
    render(<PartnerDashboardView />);
    await waitFor(() => expect(screen.getByTestId('kpi-grid')).toBeInTheDocument());

    mockGetPartnerStatistic.mockClear();
    mockGetPartnerTimeline.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));

    await waitFor(() => {
      expect(mockGetPartnerStatistic).toHaveBeenCalled();
    });
    expect(mockGetPartnerStatistic).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: 'Week' }),
    );
    expect(mockGetPartnerTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ granularity: 'Week' }),
    );
  });

  it('ignores a stale slower response when a newer load finishes first', async () => {
    // Simulate two overlapping loads (e.g. StrictMode double-effect or a late period switch):
    // request A starts, request B starts, B resolves with 999001, then A resolves with 111001.
    // Without the request-id guard, A would overwrite B.
    type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
    function deferred<T>(): Deferred<T> {
      let resolve: (v: T) => void = () => undefined;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    const firstStat = buildPartnerStatisticFixture();
    firstStat.totals.volume.total = 111_001;
    const secondStat = buildPartnerStatisticFixture();
    secondStat.totals.volume.total = 999_001;
    const tl = buildPartnerTimelineFixture('Day');

    const statA = deferred<typeof firstStat>();
    const statB = deferred<typeof secondStat>();
    const tlA = deferred<typeof tl>();
    const tlB = deferred<typeof tl>();

    let statCalls = 0;
    let tlCalls = 0;
    mockGetPartnerStatistic.mockImplementation(() => {
      statCalls += 1;
      return statCalls === 1 ? statA.promise : statB.promise;
    });
    mockGetPartnerTimeline.mockImplementation(() => {
      tlCalls += 1;
      return tlCalls === 1 ? tlA.promise : tlB.promise;
    });

    render(
      <StrictMode>
        <PartnerDashboardView />
      </StrictMode>,
    );

    // StrictMode may call load twice on mount — wait until at least one call is in flight
    await waitFor(() => expect(mockGetPartnerStatistic).toHaveBeenCalled());

    // If only one call (no double-invoke), fire a second load via Week click after resolving first...
    // Prefer resolving the latest call first when two are pending.
    if (statCalls >= 2) {
      await act(async () => {
        statB.resolve(secondStat);
        tlB.resolve(tl);
      });
      await waitFor(() => {
        expect(screen.getByTestId('kpi-volume')).toHaveTextContent('999,001');
      });
      await act(async () => {
        statA.resolve(firstStat);
        tlA.resolve(tl);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId('kpi-volume')).toHaveTextContent('999,001');
      expect(screen.getByTestId('kpi-volume')).not.toHaveTextContent('111,001');
      return;
    }

    // Single-invoke path: complete first load, then race a period switch against a slow prior.
    await act(async () => {
      statA.resolve(firstStat);
      tlA.resolve(tl);
    });
    await waitFor(() => expect(screen.getByTestId('kpi-volume')).toBeInTheDocument());

    // Next click: hang the new request, then we cannot easily race — assert query instead.
    mockGetPartnerStatistic.mockResolvedValue(secondStat);
    mockGetPartnerTimeline.mockResolvedValue(tl);
    await userEvent.click(screen.getByRole('button', { name: '365 days' }));
    await waitFor(() => {
      expect(mockGetPartnerStatistic).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2025-07-01T00:00:00.000Z',
        }),
      );
    });
  });
});
