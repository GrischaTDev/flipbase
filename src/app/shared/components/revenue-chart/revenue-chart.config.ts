import type {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexPlotOptions,
  ApexResponsive,
  ApexStroke,
  ApexTheme,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';
import type { AppTheme } from '../../../core/services/theme.service';

export const REVENUE_CHART_SERIES = [
  { key: 'revenue', label: 'Umsatz' },
  { key: 'totalExpenses', label: 'Ausgaben gesamt' },
  { key: 'cashflow', label: 'Cashflow' },
] as const;

const palettes = {
  light: {
    revenue: '#1d4ed8',
    totalExpenses: '#b45309',
    cashflow: '#047857',
    ticks: '#596273',
    grid: '#e2e6ec',
  },
  dark: {
    revenue: '#c4c4c4',
    totalExpenses: '#f89d13',
    cashflow: '#57c776',
    ticks: '#a8a8a8',
    grid: '#373737',
  },
};

const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatChartAmount(value: number | null): string {
  return value === null ? 'unbekannt' : euroFormatter.format(value);
}

export function revenueChartPalette(theme: AppTheme) {
  return palettes[theme];
}

export function buildRevenueSeries(points: readonly DashboardTimePoint[]): ApexAxisChartSeries {
  return REVENUE_CHART_SERIES.map((series) => ({
    name: series.label,
    data: points.map((point) => point[series.key]),
  }));
}

export interface RevenueChartConfiguration {
  chart: ApexChart;
  series: ApexAxisChartSeries;
  colors: string[];
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  markers: ApexMarkers;
  plotOptions: ApexPlotOptions;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  theme: ApexTheme;
  responsive: ApexResponsive[];
}

export function createRevenueChartConfiguration(
  points: readonly DashboardTimePoint[],
  theme: AppTheme,
  reducedMotion: boolean,
): RevenueChartConfiguration {
  const palette = revenueChartPalette(theme);
  return {
    chart: {
      type: 'bar',
      height: 260,
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
    series: buildRevenueSeries(points),
    colors: REVENUE_CHART_SERIES.map((series) => palette[series.key]),
    stroke: {
      width: 0,
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '64%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
      },
    },
    markers: { size: points.length === 1 ? 4 : 0, hover: { size: 5 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { enabled: false },
    xaxis: {
      type: 'category',
      categories: points.map((point) => point.label),
      tickPlacement: 'on',
      tickAmount: points.length > 1 ? Math.min(points.length - 1, 6) : undefined,
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
      labels: {
        formatter: (value) => formatChartAmount(value),
        style: { fontSize: '12px', colors: [palette.ticks] },
      },
    },
    grid: {
      borderColor: palette.grid,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 8, right: 12, top: 8, bottom: 0 },
    },
    theme: { mode: theme },
    responsive: [
      {
        breakpoint: 640,
        options: {
          xaxis: { tickAmount: points.length > 1 ? Math.min(points.length - 1, 2) : undefined },
        },
      },
    ],
  };
}
