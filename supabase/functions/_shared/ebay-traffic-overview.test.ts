import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEbayTrafficDays, readEbayTrafficOverview } from './ebay-traffic-overview.ts';
import type { EbayConfig } from './ebay-api.ts';

const metricKeys = [
  'SALES_CONVERSION_RATE',
  'TOTAL_IMPRESSION_TOTAL',
  'CLICK_THROUGH_RATE',
  'LISTING_VIEWS_TOTAL',
  'TRANSACTION',
  'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
  'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
  'LISTING_VIEWS_SOURCE_OFF_EBAY',
];
const row = {
  dimensionValues: [{ value: '2026-09-01T00:00:00Z', applicable: true }],
  metricValues: [0.1, 100, 0.05, 10, 1, 80, 4, 2].map((value) => ({ value, applicable: true })),
};
const report = {
  header: { dimensionKeys: [{ key: 'day' }], metrics: metricKeys.map((key) => ({ key })) },
  records: [row],
};

test('Traffic-Tagesbericht ordnet Metriken nach Header zu und erhält Lücken', () => {
  const days = parseEbayTrafficDays(report, '2026-09-01', '2026-09-02');
  assert.deepEqual(days[0], {
    date: '2026-09-01',
    impressions: 100,
    views: 10,
    externalViews: 2,
    transactions: 1,
    searchImpressions: 80,
    searchViews: 4,
    clickThroughRate: 0.05,
    conversionRate: 0.1,
  });
  assert.equal(days[1].impressions, null);
  assert.equal(days[1].views, null);
  assert.equal(days[1].externalViews, null);
  assert.equal(days[1].conversionRate, null);
});
test('Trafficbericht akzeptiert eBay-Datumsformate und nicht anwendbare Quoten', () => {
  for (const date of ['20260901', 'Tue Sep 01 00:00:00 GMT+00:00 2026']) {
    const response = {
      ...report,
      records: [
        {
          ...row,
          dimensionValues: [{ value: date, applicable: true }],
          metricValues: row.metricValues.map((metric, index) =>
            index === 0 ? { value: 0, applicable: false } : metric,
          ),
        },
      ],
    };
    const days = parseEbayTrafficDays(response, '2026-09-01', '2026-09-01');
    assert.equal(days[0].date, '2026-09-01');
    assert.equal(days[0].conversionRate, null);
  }
});
test('Trafficbericht weist fremde Tage, doppelte Tage und ungültige Metriken zurück', () => {
  const invalid = [
    { ...report, records: [row, row] },
    {
      ...report,
      records: [{ ...row, dimensionValues: [{ value: '2026-09-03', applicable: true }] }],
    },
    { ...report, header: { ...report.header, metrics: [] } },
    { ...report, header: { ...report.header, dimensionKeys: [{ key: '' }] } },
    {
      ...report,
      records: [{ ...row, dimensionValues: [{ value: '2026-08-32', applicable: true }] }],
    },
    {
      ...report,
      records: [
        { ...row, metricValues: [{ value: -1, applicable: true }, ...row.metricValues.slice(1)] },
      ],
    },
  ];
  for (const response of invalid)
    assert.throws(() => parseEbayTrafficDays(response, '2026-09-01', '2026-09-02'), {
      code: 'invalid_response',
    });
});
test('Konto-Traffic fordert alle Metriken ohne Beschränkung auf aktive Inserate an', async () => {
  const config = { environment: 'production' } as EbayConfig;
  const result = await readEbayTrafficOverview(config, 'fixture-token', 7, async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('dimension'), 'DAY');
    assert.match(
      url.searchParams.get('filter') ?? '',
      /marketplace_ids:\{EBAY_DE\},date_range:.*\+00:00/,
    );
    assert.doesNotMatch(url.searchParams.get('filter') ?? '', /listing_ids/);
    for (const key of metricKeys)
      assert.ok(url.searchParams.get('metric')?.split(',').includes(key));
    return Response.json({ ...report, records: [] });
  });
  assert.equal(result.days.length, 7);
  assert.equal((Date.parse(result.endDate) - Date.parse(result.startDate)) / 86400000, 6);
  assert.equal(result.previousPeriod?.days.length, 7);
  assert.equal(
    Date.parse(result.startDate) - Date.parse(result.previousPeriod?.endDate ?? ''),
    86400000,
  );
  await assert.rejects(readEbayTrafficOverview(config, 'fixture-token', 365 as 30), {
    code: 'invalid_request',
  });
});

test('Vorzeitraum bleibt separat begrenzt und ein fehlgeschlagener Vergleich löscht keine aktuellen Daten', async () => {
  const config = { environment: 'production' } as EbayConfig;
  for (const days of [7, 30, 90] as const) {
    const periods: string[] = [];
    const result = await readEbayTrafficOverview(config, 'fixture-token', days, async (input) => {
      const filter = new URL(String(input)).searchParams.get('filter') ?? '';
      periods.push(filter);
      if (periods.length === 2) return new Response(null, { status: 503 });
      return Response.json({ ...report, records: [] });
    });
    assert.equal(periods.length, 2);
    assert.notEqual(periods[0], periods[1]);
    assert.equal(result.days.length, days);
    assert.equal(result.previousPeriod, null);
  }
});

test('Widerruf im Vorzeitraum wird nicht als fehlender Vergleich verschluckt', async () => {
  let calls = 0;
  await assert.rejects(
    readEbayTrafficOverview(
      { environment: 'production' } as EbayConfig,
      'fixture-token',
      7,
      async () => {
        if (++calls === 2) return new Response(null, { status: 401 });
        return Response.json({ ...report, records: [] });
      },
    ),
    { code: 'needs_login' },
  );
});

test('Transportfehler des Vergleichs erhalten aktuelle Daten', async () => {
  for (const failure of [
    new TypeError('fetch failed'),
    new DOMException('timeout', 'TimeoutError'),
  ]) {
    let calls = 0;
    const result = await readEbayTrafficOverview(
      { environment: 'production' } as EbayConfig,
      'fixture-token',
      7,
      async () => {
        if (++calls === 2) throw failure;
        return Response.json({ ...report, records: [] });
      },
    );
    assert.equal(result.days.length, 7);
    assert.equal(result.previousPeriod, null);
  }
});
