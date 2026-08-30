import type { ChartConfiguration, TooltipModel } from 'chart.js';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';
import type { AppTheme } from '../../../core/services/theme.service';

export interface RevenueChartPalette {
  readonly revenue: string;
  readonly expenses: string;
  readonly realizedProfit: string;
  readonly ticks: string;
  readonly grid: string;
  readonly zeroLine: string;
  readonly tooltipBackground: string;
  readonly tooltipText: string;
  readonly tooltipBorder: string;
}

export const REVENUE_CHART_SERIES: readonly {
  readonly key: 'revenue' | 'expenses' | 'realizedProfit';
  readonly label: 'Umsatz' | 'Ausgaben' | 'Realisierter Gewinn';
  readonly pointStyle: 'circle' | 'rectRot' | 'triangle';
  readonly borderDash: readonly number[];
}[] = [
  { key: 'revenue', label: 'Umsatz', pointStyle: 'circle', borderDash: [] },
  { key: 'expenses', label: 'Ausgaben', pointStyle: 'rectRot', borderDash: [8, 4] },
  {
    key: 'realizedProfit',
    label: 'Realisierter Gewinn',
    pointStyle: 'triangle',
    borderDash: [2, 3],
  },
];

const palettes: Record<AppTheme, RevenueChartPalette> = {
  light: {
    revenue: '#1d4ed8',
    expenses: '#b45309',
    realizedProfit: '#047857',
    ticks: '#596273',
    grid: '#e2e6ec',
    zeroLine: '#596273',
    tooltipBackground: '#ffffff',
    tooltipText: '#171a21',
    tooltipBorder: '#cbd1da',
  },
  dark: {
    revenue: '#c4c4c4',
    expenses: '#f89d13',
    realizedProfit: '#57c776',
    ticks: '#a8a8a8',
    grid: '#373737',
    zeroLine: '#a8a8a8',
    tooltipBackground: '#171717',
    tooltipText: '#f5f5f5',
    tooltipBorder: '#4a4a4a',
  },
};

const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

export function revenueChartPalette(theme: AppTheme): RevenueChartPalette {
  return palettes[theme];
}

export function createRevenueChartConfiguration(
  points: readonly DashboardTimePoint[],
  theme: AppTheme,
  reducedMotion: boolean,
  showExternalTooltip?: (tooltip: TooltipModel<'line'>) => void,
): ChartConfiguration<'line', number[], string> {
  const palette = revenueChartPalette(theme);

  return {
    type: 'line',
    data: {
      labels: points.map(({ label }) => label),
      datasets: REVENUE_CHART_SERIES.map((series) => ({
        label: series.label,
        data: points.map((point) => point[series.key]),
        borderColor: palette[series.key],
        backgroundColor: palette[series.key],
        borderDash: [...series.borderDash],
        pointStyle: series.pointStyle,
        pointHitRadius: 12,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion ? false : { duration: 250 },
      interaction: {
        mode: 'index',
        axis: 'x',
        intersect: false,
      },
      events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: !showExternalTooltip,
          external: showExternalTooltip ? ({ tooltip }) => showExternalTooltip(tooltip) : undefined,
          backgroundColor: palette.tooltipBackground,
          bodyColor: palette.tooltipText,
          borderColor: palette.tooltipBorder,
          borderWidth: 1,
          titleColor: palette.tooltipText,
          callbacks: {
            label: (tooltipItem) =>
              `${tooltipItem.dataset.label}: ${euroFormatter.format(tooltipItem.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: {
          border: {
            color: palette.zeroLine,
          },
          grid: {
            color: palette.grid,
          },
          ticks: {
            color: palette.ticks,
          },
        },
        y: {
          beginAtZero: true,
          border: {
            color: palette.zeroLine,
          },
          grid: {
            color: (context) => (context.tick.value === 0 ? palette.zeroLine : palette.grid),
          },
          ticks: {
            color: palette.ticks,
          },
        },
      },
    },
  };
}
