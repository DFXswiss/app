import { fireEvent, render, screen } from '@testing-library/react';
import { BuyVolumeChart } from 'src/components/realunit/buy-volume-chart';
import { HolderCountChart } from 'src/components/realunit/holder-count-chart';
import { RegistrationFunnel } from 'src/components/realunit/registration-funnel';
import { Timeframe } from 'src/util/chart';

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('react-apexcharts', () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}));

const volume = [
  { timestamp: '2026-08-01T00:00:00.000Z', chf: 100, shares: 70, priceChf: 1.4 },
  { timestamp: '2026-08-02T00:00:00.000Z', chf: 0, shares: 0, priceChf: 1.41 },
];

describe('RealUnit monitoring charts', () => {
  it('toggles buy volume between CHF and shares and forwards timeframe clicks', () => {
    const onTimeframeChange = jest.fn();
    render(<BuyVolumeChart timeframe={Timeframe.ALL} series={volume} onTimeframeChange={onTimeframeChange} />);
    fireEvent.click(screen.getByText('Shares'));
    fireEvent.click(screen.getByText('1M'));
    expect(onTimeframeChange).toHaveBeenCalledWith(Timeframe.MONTH);
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('renders holder count and registration funnel including optional blocked/deleted tiles', () => {
    const onTimeframeChange = jest.fn();
    render(<HolderCountChart timeframe={Timeframe.WEEK} series={[]} onTimeframeChange={onTimeframeChange} />);
    render(
      <RegistrationFunnel
        timeframe={Timeframe.ALL}
        stats={{
          snapshot: {
            completed: 1,
            manualReview: 2,
            confirmed: 3,
            usersActive: 4,
            usersNa: 5,
            usersBlocked: 6,
            usersDeleted: 7,
          },
          series: [{ timestamp: '2026-08-01T00:00:00.000Z', registered: 1, confirmed: 1 }],
        }}
        onTimeframeChange={onTimeframeChange}
      />,
    );
    expect(screen.getByText('Blocked users')).toBeInTheDocument();
    expect(screen.getByText('Deleted users')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart').length).toBeGreaterThan(0);
  });
});
