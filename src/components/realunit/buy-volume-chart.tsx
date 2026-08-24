import { ApexOptions } from 'apexcharts';
import { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitBuyVolumePoint } from 'src/dto/realunit.dto';
import { Timeframe } from 'src/util/chart';
import { ButtonGroup } from '../safe/button-group';

const SUPPORTED_TIMEFRAMES: Timeframe[] = [
  Timeframe.WEEK,
  Timeframe.MONTH,
  Timeframe.QUARTER,
  Timeframe.YEAR,
  Timeframe.ALL,
];

type VolumeMetric = 'chf' | 'shares';

interface BuyVolumeChartProps {
  timeframe: Timeframe;
  series: RealUnitBuyVolumePoint[];
  onTimeframeChange: (timeframe: Timeframe) => void;
}

export const BuyVolumeChart = ({ timeframe, series, onTimeframeChange }: BuyVolumeChartProps) => {
  const { translate } = useSettingsContext();
  const [metric, setMetric] = useState<VolumeMetric>('chf');

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
      stroke: { width: metric === 'chf' ? [0, 3] : 0 },
      dataLabels: { enabled: false },
      grid: { show: false },
      xaxis: {
        type: 'datetime',
        labels: { show: false, datetimeUTC: false, format: 'dd MMM' },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis:
        metric === 'chf'
          ? [
              { show: false, min: 0 },
              { show: false, opposite: true, min: 0 },
            ]
          : { show: false, min: 0 },
      tooltip: { x: { format: 'dd MMM yyyy' } },
    };
  }, [metric]);

  const chartSeries = useMemo(() => {
    const volume = {
      name: metric === 'chf' ? 'CHF' : translate('screens/realunit', 'Shares'),
      type: 'column' as const,
      data: series.map((point) => [new Date(point.timestamp).getTime(), metric === 'chf' ? point.chf : point.shares]),
    };
    if (metric !== 'chf') return [volume];
    return [
      volume,
      {
        name: translate('screens/realunit', 'Price'),
        type: 'line' as const,
        data: series.map((point) => [new Date(point.timestamp).getTime(), Number(point.priceChf.toFixed(4))]),
      },
    ];
  }, [series, metric, translate]);

  return (
    <div className="justify-center text-dfxBlue-500">
      <div className="flex justify-center gap-2">
        <ButtonGroup<VolumeMetric>
          items={['chf', 'shares']}
          selected={metric}
          onClick={setMetric}
          buttonLabel={(item) => (item === 'chf' ? 'CHF' : translate('screens/realunit', 'Shares'))}
        />
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
