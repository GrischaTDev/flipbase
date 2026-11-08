import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import {
  kpiSparkline,
  marginSeries,
  periodBreakdownRows,
  platformDistribution,
  stockOverview,
  sparklinePath,
  salesVolumes,
} from './dashboard-overview';

test('berechnet Plattformanteile nach Umsatz und erhält sonstige Plattformen', () => {
  const rows = [
    { platform: 'vinted', revenue: 80 },
    { platform: 'ebay', revenue: 10 },
    { platform: 'a', revenue: 4 },
    { platform: 'b', revenue: 3 },
    { platform: 'c', revenue: 3 },
  ];
  const result = platformDistribution(rows);
  assert.equal(result.total, 100);
  assert.equal(result.entries[0].share, 80);
  assert.equal(result.entries.at(-1)?.label, 'Sonstige');
  assert.equal(
    result.entries.reduce((sum, e) => sum + e.revenue, 0),
    100,
  );
});
test('zeichnet bei Nullumsatz oder negativen Anteilen keinen irreführenden Donut', () => {
  assert.equal(platformDistribution([]).drawable, false);
  assert.equal(
    platformDistribution([
      { platform: 'vinted', revenue: 10 },
      { platform: 'ebay', revenue: -2 },
    ]).drawable,
    false,
  );
});
test('zählt Bestandsmengen und trennt die Altersgruppen überschneidungsfrei', () => {
  const now = new Date(2026, 8, 29);
  const result = stockOverview(
    [
      { status: 'ready', purchase: { purchase_date: '2026-07-20' } },
      { status: 'sold', purchase: { purchase_date: '2026-06-01' } },
      { status: 'ready', created_at: '2026-06-01' },
    ],
    [
      { remaining_quantity: 3, received_at: '2026-06-01' },
      { remaining_quantity: 0, received_at: '2026-01-01' },
    ],
    now,
  );
  assert.deepEqual(result, { units: 5, young: 0, middle: 0, slow: 1, old: 4, unknownAge: 0 });
});
test('lässt fehlende, ungültige und zukünftige Lagerdaten unbekannt', () => {
  const result = stockOverview(
    [
      { status: 'ready' },
      { status: 'ready', created_at: '2026-02-31' },
      { status: 'ready', created_at: '2026-10-01' },
    ],
    [],
    new Date(2026, 8, 29),
  );
  assert.equal(result.unknownAge, 3);
  assert.equal(result.old, 0);
});
test('erhält unbekannte Lücken und verarbeitet negative, flache und einzelne Werte', () => {
  assert.equal(sparklinePath([]), '');
  assert.equal(sparklinePath([null, null]), '');
  assert.equal((sparklinePath([1, null, 2]).match(/M/g) || []).length, 2);
  assert.ok(!/NaN|Infinity/.test(sparklinePath([-3, 0, 8])));
  assert.ok(!/NaN|Infinity/.test(sparklinePath([0])));
});
test('zählt für die Verkaufskurve Buchungen statt Stückzahlen', () => {
  const sales = [
    { date: '2026-09-20', quantity: 12 },
    { date: '2026-09-23', quantity: 1 },
  ];
  assert.deepEqual(salesVolumes([{ date: '2026-09-01' }], sales, true), [2]);
});

test('nutzt für Mengenbestand das Einkaufsdatum und erhält die Grenzen 30/60/90', () => {
  const result = stockOverview(
    [],
    [
      {
        remaining_quantity: 2,
        received_at: '2026-10-18',
        purchase: { purchase_date: '2026-07-20' },
      },
      {
        remaining_quantity: 3,
        received_at: '2026-10-18',
        purchase: { purchase_date: '2026-08-19' },
      },
      { remaining_quantity: 4, received_at: '2026-09-18' },
    ],
    new Date(2026, 9, 18),
  );
  assert.deepEqual(result, { units: 9, young: 4, middle: 3, slow: 2, old: 0, unknownAge: 0 });
});

test('berechnet Widescreen-Verlaufskurven für einzelne und mehrfache Punkte sowie Margen- und Zeitraumtabellen', () => {
  const single = kpiSparkline([42.98]);
  assert.equal(single.linePath, 'M2.00,28.00 L98.00,28.00');
  assert.ok(single.areaPath.endsWith('Z'));
  assert.equal(single.max, 42.98);

  const multi = kpiSparkline([10, 30, 20]);
  assert.ok(multi.linePath.includes('L'));
  assert.ok(multi.areaPath.endsWith('Z'));
  assert.equal(multi.min, 10);
  assert.equal(multi.max, 30);

  const points = [
    {
      date: '2026-08-29',
      label: '29.08.',
      revenue: 0,
      costOfGoodsSold: 0,
      sellingCosts: 0,
      resultAfterDirectCosts: 0,
      expenses: 0,
      totalExpenses: 0,
      realizedProfit: 0,
    },
    {
      date: '2026-08-30',
      label: '30.08.',
      revenue: 50,
      costOfGoodsSold: 20,
      sellingCosts: 5,
      resultAfterDirectCosts: 25,
      expenses: 0,
      totalExpenses: 5,
      realizedProfit: 25,
    },
  ];
  const rows = [
    {
      saleId: 's1',
      date: '2026-08-30',
      articles: 'Sneaker',
      quantity: 2,
      platform: 'vinted',
      revenue: 50,
      costOfGoodsSold: 20,
      sellingCosts: 5,
      resultAfterDirectCosts: 25,
      marginPercent: 50,
      profit: 25,
    },
  ];
  assert.deepEqual(marginSeries(points, rows, false), [0, 50]);
  const breakdown = periodBreakdownRows(points, rows, false);
  assert.equal(breakdown.length, 2);
  assert.equal(breakdown[1]?.salesCount, 1);
  assert.equal(breakdown[1]?.marginPercent, 50);
});
