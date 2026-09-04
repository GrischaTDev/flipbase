import { InjectionToken } from '@angular/core';
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartConfiguration } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

export type RevenueLineChart = Chart<'line', (number | null)[], string>;

export type RevenueChartFactory = (
  canvas: HTMLCanvasElement,
  configuration: ChartConfiguration<'line', (number | null)[], string>,
) => RevenueLineChart;

const createRevenueLineChart: RevenueChartFactory = (canvas, configuration) =>
  new Chart(canvas, configuration);

export const REVENUE_CHART_FACTORY = new InjectionToken<RevenueChartFactory>(
  'REVENUE_CHART_FACTORY',
  {
    providedIn: 'root',
    factory: () => createRevenueLineChart,
  },
);
