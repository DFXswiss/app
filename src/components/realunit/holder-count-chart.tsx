import { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitHolderCountPoint } from 'src/dto/realunit.dto';
import { Timeframe } from 'src/util/chart';
import { ButtonGroup } from '../safe/button-group';

const SUPPORTED_TIMEFRAMES: Timeframe[] = [
  Timeframe.WEEK,
  Timeframe.MONTH,
  Timeframe.QUARTER,
  Timeframe.YEAR,
  Timeframe.ALL,
];

interface HolderCountChartProps {
  timeframe: Timeframe;
  series: RealUnitHolderCountPoint[];
  onTimeframeChange: (timeframe: Timeframe) => void;
}

export const HolderCountChart = ({ timeframe, series, onTimeframeChange }: HolderCountChartProps) => {
  const { translate } = useSettingsContext();

  const maxHolders = useMemo(() => Math.max(...series.map((point) => point.holders), 0), [series]);

  const chartOptions = useMemo((): ApexOptions => {
    return {
      theme: { monochrome: { color: '#092f62', enabled: true } },
      chart: {
        type: 'area',
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
      yaxis: { show: false, min: 0, max: maxHolders * 1.5 || 1 },
      fill: {
        colors: ['#5A81BB'],
        type: 'gradient',
        gradient: { type: 'vertical', opacityFrom: 1, opacityTo: 0.0 },
      },
      tooltip: { x: { format: 'dd MMM yyyy' } },
    };
  }, [maxHolders]);

  const chartSeries = useMemo(
    () => [
      {
        name: translate('screens/realunit', 'Holders'),
        data: series.map((point) => [new Date(point.timestamp).getTime(), point.holders]),
      },
    ],
    [series, translate],
  );

  return (
    <div className="justify-center text-dfxBlue-500">
      <Chart type="area" height={280} options={chartOptions} series={chartSeries} />
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
