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
    totalExpenses: 25.95,
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
    totalExpenses: null,
    realizedProfit: null,
  },
];

describe('Revenue-Chart-Konfiguration', () => {
  it('zeigt Umsatz, Gesamtausgaben und verkaufsbezogenen Gewinn ohne unbekannte Werte als null zu tarnen', () => {
    expect(buildRevenueSeries(points)).toEqual([
      { name: 'Umsatz', data: [19.98, 0] },
      { name: 'Ausgaben gesamt', data: [25.95, null] },
      { name: 'Gewinn', data: [-16.02, null] },
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
  it('zeigt keine Zahlen an den Säulen und erhält negative sowie unbekannte Werte', () => {
    const options = createRevenueChartConfiguration(points, 'light', false);
    expect(options.chart.type).toBe('bar');
    expect(options.plotOptions.bar).toMatchObject({
      borderRadius: 4,
      borderRadiusApplication: 'end',
      columnWidth: '64%',
      horizontal: false,
    });
    expect(options.stroke).toMatchObject({
      width: 1,
      colors: ['#8a6d00', '#dc2626', '#16a34a'],
    });
    expect(options.dataLabels.enabled).toBe(false);
    expect(options.dataLabels.formatter).toBeUndefined();
    expect(options.series[1].data).toEqual([25.95, null]);
    expect(options.series[2].data).toEqual([-16.02, null]);
    expect(options.tooltip.enabled).toBe(false);
    expect(options.yaxis.labels?.formatter?.(-25)).toBe('-25,00 €');
  });
  it.each(['light', 'dark'] as const)(
    'verwendet im %s-Theme Markengelb, klares Rot und Grün für die drei Reihen',
    (theme) => {
      const options = createRevenueChartConfiguration(points, theme, false);
      expect(options.colors).toEqual(['#fcc601', '#dc2626', '#16a34a']);
    },
  );
  it('deaktiviert Animationen bei reduzierter Bewegung und passt das Theme an', () => {
    const options = createRevenueChartConfiguration(points, 'dark', true);
    expect(options.chart.animations?.enabled).toBe(false);
    expect(options.theme.mode).toBe('dark');
    expect(options.stroke.width).toBe(0);
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
