import { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitRegistrationStats } from 'src/dto/realunit.dto';
import { Timeframe } from 'src/util/chart';
import { ButtonGroup } from '../safe/button-group';

const SUPPORTED_TIMEFRAMES: Timeframe[] = [
  Timeframe.WEEK,
  Timeframe.MONTH,
  Timeframe.QUARTER,
  Timeframe.YEAR,
  Timeframe.ALL,
];

interface RegistrationFunnelProps {
  timeframe: Timeframe;
  stats: RealUnitRegistrationStats;
  onTimeframeChange: (timeframe: Timeframe) => void;
}

export const RegistrationFunnel = ({ timeframe, stats, onTimeframeChange }: RegistrationFunnelProps) => {
  const { translate } = useSettingsContext();
  const snapshot = stats.snapshot;

  const tiles = [
    { label: translate('screens/realunit', 'Completed'), value: snapshot.completed },
    { label: translate('screens/realunit', 'Manual review'), value: snapshot.manualReview },
    { label: translate('screens/realunit', 'Confirmed'), value: snapshot.confirmed },
    { label: translate('screens/realunit', 'Active users'), value: snapshot.usersActive },
    { label: translate('screens/realunit', 'NA users'), value: snapshot.usersNa },
  ];
  if (snapshot.usersBlocked > 0) {
    tiles.push({ label: translate('screens/realunit', 'Blocked users'), value: snapshot.usersBlocked });
  }
  if (snapshot.usersDeleted > 0) {
    tiles.push({ label: translate('screens/realunit', 'Deleted users'), value: snapshot.usersDeleted });
  }

  const chartOptions = useMemo((): ApexOptions => {
    return {
      theme: { monochrome: { color: '#092f62', enabled: true } },
      chart: {
        type: 'line',
        dropShadow: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
        background: '0',
      },
      stroke: { width: 3 },
      dataLabels: { enabled: false },
      grid: { show: false },
      xaxis: {
        type: 'datetime',
        labels: { show: false, datetimeUTC: false, format: 'dd MMM' },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { show: false, min: 0 },
      tooltip: { x: { format: 'dd MMM yyyy' } },
    };
  }, []);

  const chartSeries = useMemo(() => {
    const points = stats.series;
    return [
      {
        name: translate('screens/realunit', 'Registered'),
        data: points.map((point) => [new Date(point.timestamp).getTime(), point.registered]),
      },
      {
        name: translate('screens/realunit', 'Confirmed'),
        data: points.map((point) => [new Date(point.timestamp).getTime(), point.confirmed]),
      },
    ];
  }, [stats, translate]);

  return (
    <div className="justify-center text-dfxBlue-500">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-white rounded-lg shadow-sm p-3 text-center">
            <div className="text-xs text-dfxGray-700">{tile.label}</div>
            <div className="text-lg font-semibold text-dfxBlue-800">{tile.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <Chart type="line" height={280} options={chartOptions} series={chartSeries} />
      <div className="mt-4 flex justify-center">
        <ButtonGroup<Timeframe>
          items={SUPPORTED_TIMEFRAMES}
          selected={timeframe}
          onClick={onTimeframeChange}
          buttonLabel={(tf) => tf}
        />
      </div>
    </div>
  );
};
