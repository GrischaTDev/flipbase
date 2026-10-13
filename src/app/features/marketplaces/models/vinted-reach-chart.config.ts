import type { ApexOptions } from 'apexcharts';
import type { AppTheme } from '../../../core/services/theme.service';

export interface VintedReachChartPoint {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly value: number;
}

export const VINTED_REACH_CHART_HEIGHT = 320;

// Achsen- und Gitterfarben wie im Ergebnisdiagramm des Dashboards.
const palettes = {
  light: { bar: '#fcc601', ticks: '#596273', grid: '#e2e6ec' },
  dark: { bar: '#fcc601', ticks: '#a8a8a8', grid: '#373737' },
};
const countFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export function createVintedReachChartConfiguration(
  points: readonly VintedReachChartPoint[],
  seriesName: string,
  theme: AppTheme,
  reducedMotion: boolean,
): ApexOptions {
  const palette = palettes[theme];
  return {
    chart: {
      type: 'bar',
      height: VINTED_REACH_CHART_HEIGHT,
      width: '100%',
      fontFamily: 'Inter, system-ui, sans-serif',
      foreColor: palette.ticks,
      background: 'transparent',
      parentHeightOffset: 0,
      animations: {
        enabled: !reducedMotion,
        speed: 250,
        animateGradually: { enabled: false },
        dynamicAnimation: { enabled: !reducedMotion, speed: 250 },
      },
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    series: [{ name: seriesName, data: points.map((point) => point.value) }],
    colors: [palette.bar],
    stroke: { width: 0 },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '64%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { enabled: false },
    xaxis: {
      type: 'category',
      categories: points.map((point) => point.label),
      tickPlacement: 'on',
      tickAmount: points.length > 1 ? Math.min(points.length - 1, 7) : undefined,
      labels: {
        rotate: 0,
        hideOverlappingLabels: true,
        style: { fontSize: '12px', colors: palette.ticks },
      },
      axisBorder: { color: palette.grid },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        formatter: (value) => countFormat.format(value),
        style: { fontSize: '12px', colors: [palette.ticks] },
      },
    },
    grid: {
      borderColor: palette.grid,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 8, right: 12, top: 16, bottom: 0 },
    },
    theme: { mode: theme },
    responsive: [
      {
        breakpoint: 640,
        options: {
          xaxis: { tickAmount: points.length > 1 ? Math.min(points.length - 1, 3) : undefined },
        },
      },
    ],
  };
}
