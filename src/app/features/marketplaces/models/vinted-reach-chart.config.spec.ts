import { describe, expect, it } from 'vitest';
import {
  VINTED_REACH_CHART_HEIGHT,
  createVintedReachChartConfiguration,
} from './vinted-reach-chart.config';

const points = [
  { key: 'a', label: '07.10.', description: 'Mittwoch, 07.10.', value: 20 },
  { key: 'b', label: '08.10.', description: 'Donnerstag, 08.10.', value: 50 },
];

describe('createVintedReachChartConfiguration', () => {
  it('zeigt Säulen in Markengelb mit einer Reihe und 320 px Höhe', () => {
    const configuration = createVintedReachChartConfiguration(points, 'Aufrufe', 'light', false);
    expect(configuration.chart?.type).toBe('bar');
    expect(configuration.chart?.height).toBe(VINTED_REACH_CHART_HEIGHT);
    expect(VINTED_REACH_CHART_HEIGHT).toBe(320);
    expect(configuration.colors).toEqual(['#fcc601']);
    expect(configuration.series).toEqual([{ name: 'Aufrufe', data: [20, 50] }]);
    expect(configuration.xaxis?.categories).toEqual(['07.10.', '08.10.']);
  });
  it('zeigt nur ganze Zahlen auf der Achse und beginnt bei null', () => {
    const { yaxis } = createVintedReachChartConfiguration(points, 'Aufrufe', 'dark', false);
    const axis = Array.isArray(yaxis) ? yaxis[0] : yaxis;
    expect(axis?.min).toBe(0);
    expect(axis?.forceNiceScale).toBe(true);
    expect(axis?.labels?.formatter?.(1234)).toBe('1.234');
  });
  it('schaltet Bewegung bei reduzierter Bewegung ab', () => {
    const configuration = createVintedReachChartConfiguration(points, 'Aufrufe', 'light', true);
    expect(configuration.chart?.animations?.enabled).toBe(false);
  });
  it('bleibt ohne Datenpunkte gültig', () => {
    const configuration = createVintedReachChartConfiguration([], 'Favoriten', 'light', false);
    expect(configuration.series).toEqual([{ name: 'Favoriten', data: [] }]);
  });
});
