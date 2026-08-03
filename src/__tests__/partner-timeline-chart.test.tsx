import { fireEvent, render, screen } from '@testing-library/react';
import { VolumeTimeChart } from 'src/partner-dashboard/components/volume-time-chart';
import { TransactionsTimeChart } from 'src/partner-dashboard/components/transactions-time-chart';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { formatAmount } from 'src/partner-dashboard/util/format';
import { timelineSeries } from 'src/partner-dashboard/util/series';

jest.mock('react-apexcharts', () => {
  return function MockChart(props: {
    series?: Array<{ name: string; data: Array<number | null | [number, number | null]> }>;
    options?: {
      xaxis?: {
        type?: string;
        categories?: string[];
        overwriteCategories?: string[];
        labels?: { formatter?: (value: string, ts?: number, opts?: { i?: number }) => string };
      };
      annotations?: {
        xaxis?: Array<{
          x?: number | string;
          x2?: number | string;
          label?: { text?: string };
          fillColor?: string;
        }>;
      };
    };
  }) {
    const xAnns = props.options?.annotations?.xaxis ?? [];
    const overwrite = props.options?.xaxis?.overwriteCategories;
    const categories = props.options?.xaxis?.categories ?? [];
    const formatter = props.options?.xaxis?.labels?.formatter;
    const tickLabels =
      overwrite ??
      categories.map((cat, i) => (formatter ? formatter(cat, undefined, { i }) : cat));
    return (
      <div data-testid="mock-apex-chart">
        <span data-testid="xaxis-type" data-type={props.options?.xaxis?.type ?? ''} />
        <div data-testid="xaxis-tick-labels">
          {tickLabels.map((label, i) => (
            <span key={i} data-testid="xaxis-tick-label" data-index={String(i)} data-label={label} />
          ))}
        </div>
        {(props.series ?? []).map((s) => (
          <div key={s.name} data-testid={`series-${s.name}`}>
            {s.data.map((point, i) => {
              const y = Array.isArray(point) ? point[1] : point;
              return (
                <span
                  key={i}
                  data-testid={`point-${s.name}-${i}`}
                  data-value={y === null ? 'null' : String(y)}
                />
              );
            })}
          </div>
        ))}
        <div data-testid="chart-xaxis-annotations">
          {xAnns.map((ann, i) => (
            <span
              key={i}
              data-testid="xaxis-annotation"
              data-label={ann.label?.text ?? ''}
              data-x={String(ann.x ?? '')}
              data-x2={String(ann.x2 ?? '')}
            />
          ))}
        </div>
      </div>
    );
  };
});

const timeline: PartnerTimeline = {
  period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T23:59:59.000Z' },
  currency: 'CHF',
  granularity: 'Day',
  buckets: [
    {
      date: '2026-06-01T00:00:00.000Z',
      volume: { buy: 100, sell: 10, swap: 5 },
      transactions: { buy: 4, sell: 1, swap: 1 },
      partial: true,
    },
    {
      // Deliberately thin — a day with almost no activity, never a hole.
      date: '2026-06-02T00:00:00.000Z',
      volume: { buy: 3, sell: 1, swap: 2 },
      transactions: { buy: 1, sell: 1, swap: 1 },
      partial: false,
    },
    {
      date: '2026-06-03T00:00:00.000Z',
      volume: { buy: 0, sell: 0, swap: 0 },
      transactions: { buy: 0, sell: 0, swap: 0 },
      partial: false,
    },
  ],
  meta: {},
};

describe('timeline charts — thin day is a low point, no-activity day is the zero point', () => {
  it('never returns a gap for a thin day; a no-activity day is exactly 0', () => {
    const series = timelineSeries(timeline.buckets, 'volume', 'buy');
    expect(series[0][1]).toBe(100);
    // Thin, non-zero day — a low point on the curve, never bridged/invented, never null
    expect(series[1][1]).toBe(3);
    // No-activity day is the zero point — not a hole either
    expect(series[2][1]).toBe(0);
  });

  it('renders the thin day as its own low point in the chart series, not a gap', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('volume-time-chart')).toBeInTheDocument();
    expect(screen.getByTestId('point-Buy-1')).toHaveAttribute('data-value', '3');
    expect(screen.getByTestId('point-Buy-2')).toHaveAttribute('data-value', '0');
    // No chart annotations are emitted anymore (bands are gone; partial edges
    // are chips-only)
    expect(screen.queryAllByTestId('xaxis-annotation')).toHaveLength(0);
  });

  it('table never shows the absent placeholder — every day is a real value', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.queryByText('–')).not.toBeInTheDocument();
  });

  it('table row for a thin (small non-zero) day keeps its exact value — never dropped or zeroed', () => {
    // Deliberately small, non-zero — the exact shape a k-anonymity threshold used to withhold.
    const thinTimeline: PartnerTimeline = {
      period: { from: '2026-06-10T00:00:00.000Z', to: '2026-06-10T23:59:59.000Z' },
      currency: 'CHF',
      granularity: 'Day',
      buckets: [
        {
          date: '2026-06-10T00:00:00.000Z',
          volume: { buy: 3, sell: 1, swap: 4 },
          transactions: { buy: 1, sell: 2, swap: 3 },
          partial: false,
        },
      ],
      meta: {},
    };

    render(<VolumeTimeChart timeline={thinTimeline} theme="dark" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByText(formatAmount(3, 'CHF', 2))).toBeInTheDocument();
    expect(screen.getByText(formatAmount(1, 'CHF', 2))).toBeInTheDocument();
    expect(screen.getByText(formatAmount(4, 'CHF', 2))).toBeInTheDocument();
    // Row must not be represented as absent/withheld
    expect(screen.queryByText('–')).not.toBeInTheDocument();
  });

  it('renders transactions chart as its own chart (not a second Y-axis)', () => {
    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('transactions-time-chart')).toBeInTheDocument();
    expect(screen.getByText('Transactions over time')).toBeInTheDocument();
    // The thin day (1 transaction) is a real low point, never a gap
    expect(screen.getByTestId('point-Buy-1')).toHaveAttribute('data-value', '1');
  });

  it('uses the same shared tick labels on volume and transactions charts', () => {
    const { unmount } = render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('xaxis-type')).toHaveAttribute('data-type', 'category');
    const volumeLabels = screen
      .getAllByTestId('xaxis-tick-label')
      .map((el) => el.getAttribute('data-label') ?? '');
    unmount();

    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('xaxis-type')).toHaveAttribute('data-type', 'category');
    const txLabels = screen
      .getAllByTestId('xaxis-tick-label')
      .map((el) => el.getAttribute('data-label') ?? '');
    expect(txLabels).toEqual(volumeLabels);
    // First and last buckets always labeled
    expect(volumeLabels[0]).not.toBe('');
    expect(volumeLabels[volumeLabels.length - 1]).not.toBe('');
  });

  it('renders nothing from `partial` even though the first bucket carries it (owner: marking is gone)', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    expect(timeline.buckets[0].partial).toBe(true);
    expect(screen.queryByTestId('partial-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('partial-markers')).not.toBeInTheDocument();
    expect(screen.queryByTestId('partial-marker')).not.toBeInTheDocument();
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
  });

  it('table has no "Note" column and no incomplete suffix on the partial bucket', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
  });
});
