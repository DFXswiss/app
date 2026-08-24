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

  it('renders holder count and a registration funnel with stage counts and conversion', () => {
    const onTimeframeChange = jest.fn();
    const { unmount } = render(
      <HolderCountChart timeframe={Timeframe.WEEK} series={[]} onTimeframeChange={onTimeframeChange} />,
    );
    unmount();
    const holders = render(
      <HolderCountChart
        timeframe={Timeframe.WEEK}
        series={[{ timestamp: '2026-08-01T00:00:00.000Z', holders: 4 }]}
        onTimeframeChange={onTimeframeChange}
      />,
    );
    expect(holders.getByTestId('chart')).toBeInTheDocument();
    holders.unmount();

    const funnel = render(
      <RegistrationFunnel
        stats={{
          snapshot: {
            completed: 80,
            manualReview: 20,
            confirmed: 50,
            usersActive: 4,
            usersNa: 5,
            usersBlocked: 0,
            usersDeleted: 0,
          },
          series: [],
        }}
      />,
    );
    expect(funnel.getByText('Registered')).toBeInTheDocument();
    expect(funnel.getByText('Completed')).toBeInTheDocument();
    expect(funnel.getByText('100')).toBeInTheDocument();
    expect(funnel.getByText('80')).toBeInTheDocument();
    expect(funnel.getByText('−20 (−20%)')).toBeInTheDocument();
    expect(funnel.getByText('Manual review')).toBeInTheDocument();
    expect(funnel.getByText('Confirmed')).toBeInTheDocument();
    expect(funnel.getByText('50')).toBeInTheDocument();
    expect(funnel.queryByText('Blocked users')).not.toBeInTheDocument();
    expect(funnel.queryByText('Active users')).not.toBeInTheDocument();
    expect(funnel.queryByTestId('chart')).not.toBeInTheDocument();
    funnel.unmount();

    const noDrop = render(
      <RegistrationFunnel
        stats={{
          snapshot: {
            completed: 10,
            manualReview: 0,
            confirmed: 4,
            usersActive: 0,
            usersNa: 0,
            usersBlocked: 0,
            usersDeleted: 0,
          },
          series: [],
        }}
      />,
    );
    expect(noDrop.getAllByText('10')).toHaveLength(2);
    expect(noDrop.getAllByText('100%')).toHaveLength(2);
    expect(noDrop.queryByText('Manual review')).not.toBeInTheDocument();
  });
});
