import { describe, expect, it } from 'vitest';
import type { DashboardTimePoint } from '../../../core/models/flipbase.models';
import {
  buildRevenueSeries,
  createRevenueChartConfiguration,
  formatChartAmount,
} from './revenue-chart.config';

const points: readonly DashboardTimePoint[] = [
  {
    date: '2026-08-27',
    label: '27.08.',
    revenue: 19.98,
    costOfGoodsSold: 35,
    sellingCosts: 1,
    resultAfterDirectCosts: -16.02,
    expenses: 24.95,
    realizedProfit: -16.02,
  },
  {
    date: '2026-08-28',
    label: '28.08.',
    revenue: 0,
    costOfGoodsSold: null,
    sellingCosts: 5,
    resultAfterDirectCosts: null,
    expenses: 0,
    realizedProfit: null,
  },
];

describe('Revenue-Chart-Konfiguration', () => {
  it('übergibt alle vier Reihen ohne Sortieren, Verrechnen oder Ersetzen offener Werte', () => {
    expect(buildRevenueSeries(points)).toEqual([
      { name: 'Verkaufserlös', data: [19.98, 0] },
      { name: 'Wareneinsatz', data: [35, null] },
      { name: 'Verkaufskosten', data: [1, 5] },
      { name: 'Ergebnis nach direkten Kosten', data: [-16.02, null] },
    ]);
    expect(createRevenueChartConfiguration(points, 'light', false).xaxis.categories).toEqual([
      '27.08.',
      '28.08.',
    ]);
  });
  it('verändert die Eingabeliste nicht und behält ihre Reihenfolge', () => {
    const immutable = Object.freeze(
      [...points].reverse().map((point) => Object.freeze({ ...point })),
    );
    const before = structuredClone(immutable);
    expect(buildRevenueSeries(immutable)[0].data).toEqual([0, 19.98]);
    expect(immutable).toEqual(before);
  });
  it('zeigt Linien ohne Glättung, Labels oder eine falsche Null-Linie für unbekannte Werte', () => {
    const options = createRevenueChartConfiguration(points, 'light', false);
    expect(options.chart.type).toBe('line');
    expect(options.stroke.curve).toBe('straight');
    expect(options.stroke.dashArray).toEqual([0, 8, 5, 2]);
    expect(options.dataLabels.enabled).toBe(false);
    expect(options.series[1].data).toEqual([35, null]);
    expect(options.tooltip.enabled).toBe(false);
    expect(options.yaxis.labels?.formatter?.(-25)).toBe('-25,00 €');
  });
  it('deaktiviert Animationen bei reduzierter Bewegung und passt das Theme an', () => {
    const options = createRevenueChartConfiguration(points, 'dark', true);
    expect(options.chart.animations?.enabled).toBe(false);
    expect(options.theme.mode).toBe('dark');
    expect(createRevenueChartConfiguration(points, 'light', false).chart.animations?.enabled).toBe(
      true,
    );
  });

  it('begrenzt Datumsbeschriftungen auf schmalen Flächen ohne Punkte zu verwerfen', () => {
    const many = Array.from({ length: 31 }, (_, index) => ({
      ...points[0],
      label: `${index + 1}.08.`,
    }));
    const options = createRevenueChartConfiguration(many, 'light', true);
    expect(options.xaxis.tickAmount).toBe(6);
    expect(options.responsive[0]?.options?.xaxis?.tickAmount).toBe(2);
    expect(options.series[0].data).toHaveLength(31);
    expect(options.xaxis.categories).toHaveLength(31);
  });
  it.each([{ values: [] }, { values: [points[0]] }])(
    'verarbeitet leere oder einzelne Datenpunkte',
    ({ values }) => {
      const options = createRevenueChartConfiguration(values, 'light', true);
      expect(options.series[0].data).toEqual(values.length ? [19.98] : []);
      expect(options.markers.size).toBe(values.length === 1 ? 4 : 0);
    },
  );
  it('formatiert unbekannte und negative Werte fachlich unverändert', () => {
    expect(formatChartAmount(null)).toBe('unbekannt');
    expect(formatChartAmount(-25)).toBe('-25,00 €');
  });
});
