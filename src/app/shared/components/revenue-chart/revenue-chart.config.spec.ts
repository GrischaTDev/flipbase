import type { TooltipItem } from 'chart.js';
import { describe, expect, it } from 'vitest';
import { DashboardTimePoint } from '../../../core/models/flipbase.models';
import {
  createRevenueChartConfiguration,
  REVENUE_CHART_SERIES,
  revenueChartPalette,
} from './revenue-chart.config';

const points: readonly DashboardTimePoint[] = [
  {
    date: '2026-08-27',
    label: '27.08.',
    revenue: 19.98,
    costOfGoodsSold: 9.98,
    sellingCosts: 1,
    resultAfterDirectCosts: 9,
    expenses: 24.95,
    realizedProfit: 9,
  },
  {
    date: '2026-08-28',
    label: '28.08.',
    revenue: 0,
    costOfGoodsSold: 20,
    sellingCosts: 5,
    resultAfterDirectCosts: -25,
    expenses: 0,
    realizedProfit: -25,
  },
];

describe('Revenue-Chart-Konfiguration', () => {
  it('ordnet Beschriftungen und Werte unverändert den vier Fachreihen zu', () => {
    const configuration = createRevenueChartConfiguration(points, 'dark', false);

    expect(configuration.data.labels).toEqual(['27.08.', '28.08.']);
    expect(configuration.data.datasets.map(({ label, data }) => ({ label, data }))).toEqual([
      { label: 'Verkaufserlös', data: [19.98, 0] },
      { label: 'Wareneinsatz', data: [9.98, 20] },
      { label: 'Verkaufskosten', data: [1, 5] },
      { label: 'Ergebnis nach direkten Kosten', data: [9, -25] },
    ]);
  });

  it('macht alle Reihen auch ohne Farbwahrnehmung unterscheidbar und gut treffbar', () => {
    const configuration = createRevenueChartConfiguration(points, 'light', false);

    expect(REVENUE_CHART_SERIES).toEqual([
      { key: 'revenue', label: 'Verkaufserlös', pointStyle: 'circle', borderDash: [] },
      {
        key: 'costOfGoodsSold',
        label: 'Wareneinsatz',
        pointStyle: 'rectRot',
        borderDash: [8, 4],
      },
      {
        key: 'sellingCosts',
        label: 'Verkaufskosten',
        pointStyle: 'rect',
        borderDash: [5, 3],
      },
      {
        key: 'resultAfterDirectCosts',
        label: 'Ergebnis nach direkten Kosten',
        pointStyle: 'triangle',
        borderDash: [2, 3],
      },
    ]);
    expect(
      configuration.data.datasets.map(({ pointStyle, borderDash }) => ({
        pointStyle,
        borderDash,
      })),
    ).toEqual([
      { pointStyle: 'circle', borderDash: [] },
      { pointStyle: 'rectRot', borderDash: [8, 4] },
      { pointStyle: 'rect', borderDash: [5, 3] },
      { pointStyle: 'triangle', borderDash: [2, 3] },
    ]);
    for (const { pointHitRadius } of configuration.data.datasets) {
      expect(pointHitRadius).toBeTypeOf('number');
      if (typeof pointHitRadius === 'number') {
        expect(pointHitRadius).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('liefert Maus und Touch gemeinsam alle Werte am nächstgelegenen Datum', () => {
    const configuration = createRevenueChartConfiguration(points, 'dark', false);

    expect(configuration.options?.interaction).toEqual({
      mode: 'index',
      axis: 'x',
      intersect: false,
    });
    expect(configuration.options?.events).toEqual([
      'mousemove',
      'mouseout',
      'click',
      'touchstart',
      'touchmove',
    ]);
  });

  it('formatiert negative Tooltipwerte mit Reihenname als deutschen EUR-Betrag', () => {
    const configuration = createRevenueChartConfiguration(points, 'dark', false);
    const tooltipItem = {
      chart: {} as TooltipItem<'line'>['chart'],
      label: '28.08.',
      parsed: { x: 1, y: -25 },
      raw: -25,
      formattedValue: '-25',
      dataset: configuration.data.datasets[3],
      datasetIndex: 3,
      dataIndex: 1,
      element: {} as TooltipItem<'line'>['element'],
    } satisfies TooltipItem<'line'>;
    const label = configuration.options?.plugins?.tooltip?.callbacks?.label;

    expect(label).toBeTypeOf('function');
    expect(label?.call({} as never, tooltipItem)).toBe('Ergebnis nach direkten Kosten: -25,00 €');
  });

  it('liefert explizite und unterschiedliche Paletten für helles und dunkles Design', () => {
    expect(revenueChartPalette('light')).toEqual({
      revenue: '#1d4ed8',
      costOfGoodsSold: '#b45309',
      sellingCosts: '#7c3aed',
      resultAfterDirectCosts: '#047857',
      ticks: '#596273',
      grid: '#e2e6ec',
      zeroLine: '#596273',
      tooltipBackground: '#ffffff',
      tooltipText: '#171a21',
      tooltipBorder: '#cbd1da',
    });
    expect(revenueChartPalette('dark')).toEqual({
      revenue: '#c4c4c4',
      costOfGoodsSold: '#f89d13',
      sellingCosts: '#a78bfa',
      resultAfterDirectCosts: '#57c776',
      ticks: '#a8a8a8',
      grid: '#373737',
      zeroLine: '#a8a8a8',
      tooltipBackground: '#171717',
      tooltipText: '#f5f5f5',
      tooltipBorder: '#4a4a4a',
    });
  });

  it('schaltet Animationen bei reduzierter Bewegung vollständig ab', () => {
    expect(createRevenueChartConfiguration(points, 'light', true).options?.animation).toBe(false);
    expect(createRevenueChartConfiguration(points, 'light', false).options?.animation).toEqual({
      duration: 250,
    });
  });

  it.each([
    { name: 'keine', values: [] as const, labels: [], revenue: [] },
    {
      name: 'eine',
      values: [points[0]] as const,
      labels: ['27.08.'],
      revenue: [19.98],
    },
  ])(
    'erzeugt auch für $name Datenpunkte eine gültige Konfiguration',
    ({ values, labels, revenue }) => {
      const configuration = createRevenueChartConfiguration(values, 'light', false);

      expect(configuration.type).toBe('line');
      expect(configuration.data.labels).toEqual(labels);
      expect(configuration.data.datasets[0].data).toEqual(revenue);
    },
  );

  it('verändert die übergebenen Dashboardpunkte nicht', () => {
    const immutablePoints = Object.freeze(points.map((point) => Object.freeze({ ...point })));
    const snapshot = structuredClone(immutablePoints);

    createRevenueChartConfiguration(immutablePoints, 'dark', false);

    expect(immutablePoints).toEqual(snapshot);
  });
});
