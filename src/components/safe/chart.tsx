import { CustodyHistoryEntry } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { ApexOptions } from 'apexcharts';
import { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { useSettingsContext } from 'src/contexts/settings.context';
import { FiatCurrency } from 'src/dto/safe.dto';
import { getFromDateByTimeframe, Timeframe } from 'src/util/chart';
import { ButtonGroup } from './button-group';

interface PriceChartProps {
  history: CustodyHistoryEntry[];
  currency: FiatCurrency;
  isLoading: boolean;
}

export const PriceChart = ({ isLoading, history, currency }: PriceChartProps) => {
  const { translate, locale } = useSettingsContext();

  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.ALL);

  const timeframedHistory = useMemo(() => {
    const fromDate = getFromDateByTimeframe(timeframe);
    const filtered = history.filter((entry) => new Date(entry.date).getTime() > fromDate);
    if (filtered.length === 1 && history.length > 1) filtered.unshift(history[history.length - 2]);
    return filtered;
  }, [history, timeframe]);

  const maxPrice = useMemo(
    () => Math.max(...timeframedHistory.map((e) => e.value[currency]), 0),
    [timeframedHistory, currency],
  );

  const chartOptions = useMemo((): ApexOptions => {
    const translatedMonths = Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleString(locale, { month: 'short' }),
    );

    return {
      theme: {
        monochrome: {
          color: '#092f62',
          enabled: true,
        },
      },
      chart: {
        type: 'area' as const,
        dropShadow: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
        background: '0',
        locales: [
          {
            name: locale,
            options: {
              months: translatedMonths,
              shortMonths: translatedMonths,
            },
          },
        ],
        defaultLocale: locale,
      },
      stroke: { width: 3 },
      dataLabels: { enabled: false },
      grid: { show: false },
      xaxis: {
        type: 'datetime',
        labels: {
          show: false,
          datetimeUTC: false,
          format: 'dd MMM',
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        show: false,
        min: 0,
        max: maxPrice * 1.5,
      },
      fill: {
        colors: ['#5A81BB'],
        type: 'gradient',
        gradient: {
          type: 'vertical',
          opacityFrom: 1,
          opacityTo: 0.0,
        },
      },
      tooltip: {
        x: { format: 'dd MMM yyyy' },
      },
    };
  }, [maxPrice, locale]);

  const chartSeries = useMemo(() => {
    return [
      {
        name: translate('screens/safe', 'Portfolio value'),
        data: timeframedHistory.map((entry: CustodyHistoryEntry) => {
          return [new Date(entry.date).getTime(), entry.value[currency]];
        }),
      },
    ];
  }, [timeframedHistory, currency, translate]);

  return isLoading ? (
    <div className="flex justify-center items-center w-full h-full">
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    </div>
  ) : (
    <div id="chart-timeline" className="text-dfxBlue-500">
      <Chart type="area" height={300} options={chartOptions} series={chartSeries} />
      <div className="mt-1 w-full flex justify-center py-2">
        <ButtonGroup<Timeframe>
          items={Object.values(Timeframe)}
          selected={timeframe}
          onClick={(t) => setTimeframe(t)}
          buttonLabel={(t) => t}
        />
      </div>
    </div>
  );
};
