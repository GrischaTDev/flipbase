import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EbayConfig } from './ebay-api.ts';
import { ebayTrafficMetrics } from './ebay-traffic-overview.ts';
import {
  parseEbayListingPerformance,
  readEbayListingMetrics,
  readEbayListingPerformance,
} from './ebay-listing-performance.ts';

const row = {
  dimensionValues: [{ value: '123', applicable: true }],
  metricValues: [100, 10, 1, 80, 4, 0.05, 0.1].map((value) => ({ value, applicable: true })),
};
const report = {
  header: {
    dimensionKeys: [{ key: 'listing' }],
    metrics: Object.values(ebayTrafficMetrics).map((key) => ({ key })),
  },
  records: [row],
};

test('Artikelauswertung erhält Nullwerte und ordnet die sieben Metriken zu', () => {
  const items = parseEbayListingPerformance(report);
  assert.equal(items[0].listingId, '123');
  assert.equal(items[0].impressions, 100);
  assert.equal(items[0].views, 10);
  assert.equal(items[0].searchViews, 4);
  assert.equal(
    parseEbayListingPerformance({
      ...report,
      records: [{ ...row, metricValues: row.metricValues.map(() => ({ applicable: false })) }],
    })[0].views,
    null,
  );
});
test('Artikelauswertung weist doppelte oder ungültige Kennungen und übergroße Listen zurück', () => {
  for (const records of [
    [row, row],
    [{ ...row, dimensionValues: [{ value: 'https://evil.test', applicable: true }] }],
    Array.from({ length: 201 }, () => row),
  ]) {
    assert.throws(() => parseEbayListingPerformance({ ...report, records }), {
      code: 'invalid_response',
    });
  }
});
test('Artikelauswertung fordert bis zu 200 Angebote nach Gesamtimpressionen ohne Aktivfilter an', async () => {
  const result = await readEbayListingMetrics(
    { environment: 'production' } as EbayConfig,
    'fixture-token',
    7,
    async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('dimension'), 'LISTING');
      assert.equal(url.searchParams.get('sort'), '-TOTAL_IMPRESSION_TOTAL');
      assert.doesNotMatch(url.searchParams.get('filter') ?? '', /listing_ids|traffic_source/);
      return Response.json(report);
    },
  );
  assert.equal(result.limit, 200);
  assert.equal(result.items[0].views, 10);
});
test('Artikelauswertung ergänzt eigene aktive Artikeltitel und erfindet keine Metadaten für weitere Angebote', async () => {
  const result = await readEbayListingPerformance(
    { environment: 'production' } as EbayConfig,
    'fixture-token',
    7,
    async (input) => {
      if (String(input).endsWith('api.dll'))
        return new Response(
          '<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><ItemArray><Item><ItemID>123</ItemID><Title>Jacke</Title><SellingStatus><CurrentPrice currencyID="EUR">10</CurrentPrice></SellingStatus><QuantityAvailable>1</QuantityAvailable><WatchCount>3</WatchCount></Item></ItemArray><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>',
        );
      return Response.json({
        ...report,
        records: [row, { ...row, dimensionValues: [{ value: '124', applicable: true }] }],
      });
    },
  );
  assert.equal(result.items[0].title, 'Jacke');
  assert.equal(result.items[0].watchCount, 3);
  assert.equal(result.items[1].title, 'Angebot bei eBay');
  assert.equal(result.items[1].imageUrl, null);
  assert.equal(result.items[1].watchCount, null);
});
