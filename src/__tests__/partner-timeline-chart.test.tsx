import { fireEvent, render, screen } from '@testing-library/react';
import { VolumeTimeChart } from 'src/partner-dashboard/components/volume-time-chart';
import { TransactionsTimeChart } from 'src/partner-dashboard/components/transactions-time-chart';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
import { ABSENT_LABEL, formatAmount, formatCount } from 'src/partner-dashboard/util/format';
import { timelineSeries } from 'src/partner-dashboard/util/series';

jest.mock('src/partner-dashboard/util/chart-theme', () => {
  const actual = jest.requireActual('src/partner-dashboard/util/chart-theme') as typeof import('src/partner-dashboard/util/chart-theme');
  return {
    ...actual,
    // Force missing axis color so the chart's `?? ''` fallback branch is exercised.
    baseChartOptions: (theme: 'light' | 'dark') => {
      const base = actual.baseChartOptions(theme);
      return {
        ...base,
        xaxis: {
          ...base.xaxis,
          labels: {
            ...base.xaxis?.labels,
            style: {
              ...base.xaxis?.labels?.style,
              colors: undefined,
            },
          },
        },
      };
    },
  };
});

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
      yaxis?: {
        labels?: { formatter?: (val: number) => string };
      };
      tooltip?: {
        x?: { formatter?: (val: number, opts?: { dataPointIndex?: number }) => string };
        y?: { formatter?: (val: number) => string };
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
    const yFormatter = props.options?.yaxis?.labels?.formatter;
    const tooltipX = props.options?.tooltip?.x?.formatter;
    const tooltipY = props.options?.tooltip?.y?.formatter;
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
        {/* Expose Apex formatters so tests can assert return values with real inputs. */}
        {yFormatter && (
          <div data-testid="chart-y-formatters">
            <span data-testid="y-fmt-1000" data-result={yFormatter(1000)} />
            <span data-testid="y-fmt-999" data-result={yFormatter(999)} />
            <span data-testid="y-fmt-0" data-result={yFormatter(0)} />
            <span data-testid="y-fmt-2500" data-result={yFormatter(2500)} />
          </div>
        )}
        {tooltipY && (
          <div data-testid="chart-tooltip-y-formatters">
            <span data-testid="tooltip-y-nan" data-result={tooltipY(Number.NaN)} />
            <span data-testid="tooltip-y-value" data-result={tooltipY(1234.56)} />
            <span data-testid="tooltip-y-zero" data-result={tooltipY(0)} />
          </div>
        )}
        {tooltipX && (
          <div data-testid="chart-tooltip-x-formatters">
            <span
              data-testid="tooltip-x-0"
              data-result={tooltipX(0, { dataPointIndex: 0 })}
            />
            <span
              data-testid="tooltip-x-missing"
              data-result={tooltipX(0, { dataPointIndex: 99 })}
            />
            <span data-testid="tooltip-x-no-opts" data-result={tooltipX(0)} />
          </div>
        )}
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

describe('volume chart Apex formatters (y-axis k-rule + tooltip)', () => {
  it('formats y-axis: 1000 → "1k", values under 1000 stay plain integers', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);

    expect(screen.getByTestId('y-fmt-1000')).toHaveAttribute('data-result', '1k');
    expect(screen.getByTestId('y-fmt-2500')).toHaveAttribute('data-result', '3k');
    expect(screen.getByTestId('y-fmt-999')).toHaveAttribute('data-result', '999');
    expect(screen.getByTestId('y-fmt-0')).toHaveAttribute('data-result', '0');
  });

  it('tooltip y: NaN → ABSENT_LABEL; finite values use formatAmount', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);

    expect(screen.getByTestId('tooltip-y-nan')).toHaveAttribute('data-result', ABSENT_LABEL);
    expect(screen.getByTestId('tooltip-y-value')).toHaveAttribute(
      'data-result',
      formatAmount(1234.56, 'CHF', 2),
    );
    expect(screen.getByTestId('tooltip-y-zero')).toHaveAttribute(
      'data-result',
      formatAmount(0, 'CHF', 2),
    );
  });

  it('tooltip x: bucket date via toLocaleDateString; missing index → empty string', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);

    // Charts format with the partner locale (en-US under test i18n), not the host default.
    const expected = new Date(timeline.buckets[0].date).toLocaleDateString('en-US');
    expect(screen.getByTestId('tooltip-x-0')).toHaveAttribute('data-result', expected);
    expect(screen.getByTestId('tooltip-x-missing')).toHaveAttribute('data-result', '');
    // opts undefined → dataPointIndex defaults to 0
    expect(screen.getByTestId('tooltip-x-no-opts')).toHaveAttribute('data-result', expected);
  });

  it('empty timeline still builds formatters and shows the empty state (no chart series)', () => {
    const empty: PartnerTimeline = {
      period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T23:59:59.000Z' },
      currency: 'CHF',
      granularity: 'Day',
      buckets: [],
      meta: {},
    };
    render(<VolumeTimeChart timeline={empty} theme="dark" />);
    expect(screen.getByText('No volume data for the selected period.')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-apex-chart')).not.toBeInTheDocument();
  });
});

describe('transactions chart Apex formatters', () => {
  it('formats y-axis via formatCount(Math.round(val))', () => {
    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);

    expect(screen.getByTestId('y-fmt-1000')).toHaveAttribute(
      'data-result',
      formatCount(1000),
    );
    expect(screen.getByTestId('y-fmt-999')).toHaveAttribute('data-result', formatCount(999));
    expect(screen.getByTestId('y-fmt-0')).toHaveAttribute('data-result', formatCount(0));
  });

  it('tooltip y: NaN → ABSENT_LABEL; finite values use formatCount', () => {
    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);

    expect(screen.getByTestId('tooltip-y-nan')).toHaveAttribute('data-result', ABSENT_LABEL);
    expect(screen.getByTestId('tooltip-y-value')).toHaveAttribute(
      'data-result',
      formatCount(Math.round(1234.56)),
    );
    expect(screen.getByTestId('tooltip-y-zero')).toHaveAttribute(
      'data-result',
      formatCount(0),
    );
  });

  it('tooltip x: bucket date via toLocaleDateString; missing index → empty string', () => {
    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);

    const expected = new Date(timeline.buckets[0].date).toLocaleDateString('en-US');
    expect(screen.getByTestId('tooltip-x-0')).toHaveAttribute('data-result', expected);
    expect(screen.getByTestId('tooltip-x-missing')).toHaveAttribute('data-result', '');
  });

  it('empty timeline shows empty state without a chart', () => {
    const empty: PartnerTimeline = {
      period: { from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T23:59:59.000Z' },
      currency: 'CHF',
      granularity: 'Day',
      buckets: [],
      meta: {},
    };
    render(<TransactionsTimeChart timeline={empty} theme="dark" />);
    expect(screen.getByText('No transaction data for the selected period.')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-apex-chart')).not.toBeInTheDocument();
  });
});
