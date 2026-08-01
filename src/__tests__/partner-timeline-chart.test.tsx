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
    series?: Array<{ name: string; data: Array<[number, number | null]> }>;
    options?: {
      annotations?: {
        xaxis?: Array<{
          x?: number;
          x2?: number;
          label?: { text?: string };
          fillColor?: string;
        }>;
      };
    };
  }) {
    const xAnns = props.options?.annotations?.xaxis ?? [];
    return (
      <div data-testid="mock-apex-chart">
        {(props.series ?? []).map((s) => (
          <div key={s.name} data-testid={`series-${s.name}`}>
            {s.data.map((point, i) => (
              <span
                key={i}
                data-testid={`point-${s.name}-${i}`}
                data-value={point[1] === null ? 'null' : String(point[1])}
              />
            ))}
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
    render(<VolumeTimeChart timeline={timeline} />);
    expect(screen.getByTestId('volume-time-chart')).toBeInTheDocument();
    // Geometry: continuous value, not null hole
    expect(screen.getByTestId('point-Buy-1')).not.toHaveAttribute('data-value', 'null');
    expect(screen.getByTestId('point-Buy-2')).toHaveAttribute('data-value', '0');

    const anns = screen.getAllByTestId('xaxis-annotation');
    // Suppressed band has no text label; identify by x range covering the suppressed day
    const suppressedT = new Date(timeline.buckets[1].date).getTime();
    const suppressedAnn = anns.find((el) => el.getAttribute('data-x') === String(suppressedT));
    expect(suppressedAnn).toBeTruthy();
    expect(suppressedAnn).toHaveAttribute('data-label', '');
  });

  it('table still shows the absent placeholder for suppressed, not the geometry value', () => {
    render(<VolumeTimeChart timeline={timeline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    // Three directions for the suppressed day — never the interpolated geometry number
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('50')).not.toBeInTheDocument();
  });

  it('renders transactions chart as its own chart (not a second Y-axis)', () => {
    render(<TransactionsTimeChart timeline={timeline} />);
    expect(screen.getByTestId('transactions-time-chart')).toBeInTheDocument();
    expect(screen.getByText('Count over time')).toBeInTheDocument();
    expect(screen.getByTestId('point-Buy-1')).not.toHaveAttribute('data-value', 'null');
    const anns = screen.getAllByTestId('xaxis-annotation');
    const suppressedT = new Date(timeline.buckets[1].date).getTime();
    expect(anns.some((el) => el.getAttribute('data-x') === String(suppressedT))).toBe(true);
  });

  it('exposes partial-bucket legend when any bucket is partial', () => {
    render(<PartialLegendNote hasPartial={true} />);
    expect(screen.getByTestId('partial-legend')).toHaveTextContent(/incomplete/i);
  });

  it('renders visible partial markers for edge buckets (not only a legend note)', () => {
    render(<VolumeTimeChart timeline={timeline} />);
    expect(screen.getByTestId('partial-markers')).toBeInTheDocument();
    const markers = screen.getAllByTestId('partial-marker');
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(markers[0]).toHaveAttribute('data-partial', 'true');
    expect(markers[0]).toHaveTextContent(/incomplete/i);
  });
});
