import { fireEvent, render, screen } from '@testing-library/react';
import { VolumeTimeChart } from 'src/partner-dashboard/components/volume-time-chart';
import { TransactionsTimeChart } from 'src/partner-dashboard/components/transactions-time-chart';
import {
  PartialLegendNote,
  suppressedXAnnotations,
  timelineXAnnotations,
} from 'src/partner-dashboard/components/partial-marker';
import { PartnerTimeline } from 'src/dto/partner-statistic.dto';
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
      suppressed: false,
      partial: true,
    },
    {
      date: '2026-06-02T00:00:00.000Z',
      volume: null,
      transactions: null,
      suppressed: true,
      partial: false,
    },
    {
      date: '2026-06-03T00:00:00.000Z',
      volume: { buy: 0, sell: 0, swap: 0 },
      transactions: { buy: 0, sell: 0, swap: 0 },
      suppressed: false,
      partial: false,
    },
  ],
  meta: { suppressionThreshold: 5, suppressedCount: 1 },
};

describe('timeline charts — suppressed vs real zero', () => {
  it('interpolates suppressed buckets for geometry (no null hole) while real zero stays 0', () => {
    const series = timelineSeries(timeline.buckets, 'volume', 'buy');
    // Suppressed mid-point is geometry between 100 and 0 — not null (no chart hole)
    expect(series[1][1]).not.toBeNull();
    expect(series[1][1]).toBe(50);
    // Real zero day stays on the zero line
    expect(series[2][1]).toBe(0);
    expect(series[0][1]).toBe(100);
  });

  it('marks suppressed buckets with an annotation band, not real zero days', () => {
    const suppressed = suppressedXAnnotations(timeline.buckets);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]).not.toHaveProperty('label');
    expect(suppressed[0].x).toBe(new Date(timeline.buckets[1].date).getTime());

    // Real zero (index 2) must not get a suppressed annotation
    const zeroT = new Date(timeline.buckets[2].date).getTime();
    for (const ann of suppressed) {
      // Band is [x, x2); zero day starts at x2 of the suppressed range (next bucket)
      expect(ann.x).not.toBe(zeroT);
    }

    const combined = timelineXAnnotations(timeline.buckets);
    for (const a of combined) {
      expect(a).not.toHaveProperty('label');
    }
    // Suppressed band is present (by x position)
    expect(combined.some((a) => a.x === new Date(timeline.buckets[1].date).getTime())).toBe(true);
  });

  it('renders volume chart series without a null gap and with suppressed annotation band', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('volume-time-chart')).toBeInTheDocument();
    // Geometry: continuous value, not null hole
    expect(screen.getByTestId('point-Buy-1')).not.toHaveAttribute('data-value', 'null');
    expect(screen.getByTestId('point-Buy-2')).toHaveAttribute('data-value', '0');

    const anns = screen.getAllByTestId('xaxis-annotation');
    // Category axis: annotation x is the bucket ISO date string
    const suppressedDate = timeline.buckets[1].date;
    const suppressedAnn = anns.find((el) => el.getAttribute('data-x') === suppressedDate);
    expect(suppressedAnn).toBeTruthy();
    expect(suppressedAnn).toHaveAttribute('data-label', '');
  });

  it('table still shows the absent placeholder for suppressed, not the geometry value', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    // Three directions for the suppressed day — never the interpolated geometry number
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('50')).not.toBeInTheDocument();
  });

  it('renders transactions chart as its own chart (not a second Y-axis)', () => {
    render(<TransactionsTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('transactions-time-chart')).toBeInTheDocument();
    expect(screen.getByText('Transactions over time')).toBeInTheDocument();
    expect(screen.getByTestId('point-Buy-1')).not.toHaveAttribute('data-value', 'null');
    const anns = screen.getAllByTestId('xaxis-annotation');
    const suppressedDate = timeline.buckets[1].date;
    expect(anns.some((el) => el.getAttribute('data-x') === suppressedDate)).toBe(true);
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

  it('exposes partial-bucket legend when any bucket is partial', () => {
    render(<PartialLegendNote hasPartial={true} />);
    expect(screen.getByTestId('partial-legend')).toHaveTextContent(/incomplete/i);
  });

  it('renders visible partial markers for edge buckets (not only a legend note)', () => {
    render(<VolumeTimeChart timeline={timeline} theme="dark" />);
    expect(screen.getByTestId('partial-markers')).toBeInTheDocument();
    const markers = screen.getAllByTestId('partial-marker');
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers[0]).toHaveAttribute('data-partial', 'true');
    expect(markers[0]).toHaveTextContent(/incomplete/i);
  });

  it('does not emit partial edge bands in timeline annotations (chips only)', () => {
    const combined = timelineXAnnotations(timeline.buckets);
    // Only suppressed day is annotated; partial day (index 0) is not
    expect(combined).toHaveLength(1);
    expect(combined[0].x).toBe(new Date(timeline.buckets[1].date).getTime());
    expect(combined[0].hatch).toBe(true);
  });
});
