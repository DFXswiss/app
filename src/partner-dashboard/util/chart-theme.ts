import { ApexOptions } from 'apexcharts';
import { PartnerTheme, readThemeCssVar, SERIES_COLORS_BY_THEME } from './theme';

/** Resolve chart chrome colours from the design-pod CSS variables for `theme`. */
export function chartChromeColors(theme: PartnerTheme): {
  grid: string;
  axis: string;
  legend: string;
  mode: 'light' | 'dark';
  series: [string, string, string];
} {
  const series = SERIES_COLORS_BY_THEME[theme];
  const grid =
    readThemeCssVar('--border', theme) ||
    (theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#dde5f0');
  const axis =
    readThemeCssVar('--text-tertiary', theme) ||
    readThemeCssVar('--text-secondary', theme) ||
    (theme === 'dark' ? '#8a99b7' : '#566174');
  const legend =
    readThemeCssVar('--text', theme) || (theme === 'dark' ? '#f9fafb' : '#0b1426');
  return {
    grid,
    axis,
    legend,
    mode: theme,
    series: [series.buy, series.sell, series.swap],
  };
}

/** Shared Apex base options that follow the partner theme. */
export function baseChartOptions(theme: PartnerTheme): Pick<
  ApexOptions,
  'chart' | 'theme' | 'grid' | 'xaxis' | 'legend' | 'tooltip' | 'colors' | 'stroke' | 'dataLabels' | 'markers' | 'fill'
> {
  const chrome = chartChromeColors(theme);
  return {
    chart: {
      type: 'area',
      stacked: true,
      toolbar: { show: false },
      background: '0',
      zoom: { enabled: false },
      animations: { enabled: false },
      fontFamily: readThemeCssVar('--font-sans', theme) || undefined,
    },
    theme: { mode: chrome.mode },
    stroke: { width: 1.5, curve: 'smooth' },
    colors: chrome.series,
    dataLabels: { enabled: false },
    fill: { type: 'solid', opacity: theme === 'dark' ? 0.55 : 0.4 },
    grid: { borderColor: chrome.grid, strokeDashArray: 3 },
    xaxis: {
      type: 'datetime',
      labels: { datetimeUTC: false, style: { colors: chrome.axis } },
      axisBorder: { color: chrome.grid },
      axisTicks: { color: chrome.grid },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: chrome.legend },
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: chrome.mode,
      x: { format: 'dd MMM yyyy' },
    },
    markers: { size: 0, hover: { size: 4 } },
  };
}
