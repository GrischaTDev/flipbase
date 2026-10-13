import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EbayConfig } from './ebay-api.ts';
import { EBAY_SCOPES } from './ebay-api.ts';
import { ebayTrafficMetrics, getEbayTrafficPeriod } from './ebay-traffic-overview.ts';
import {
  matchesEbayAdvertisingTask,
  parseEbayAdvertisingTsv,
  readEbayAdvertisingReport,
} from './ebay-advertising-report.ts';

const request = {
  reportType: 'LISTING_PERFORMANCE_REPORT' as const,
  fundingModels: ['COST_PER_SALE' as const],
  dimensions: [{ dimensionKey: 'campaign_id' }, { dimensionKey: 'listing_id' }],
  metricKeys: ['impressions', 'clicks'],
  dateFrom: '2026-09-01T00:00:00.000Z',
  dateTo: '2026-09-07T23:59:59.000Z',
  marketplaceId: 'EBAY_DE' as const,
  reportFormat: 'TSV_GZIP' as const,
  listingIds: ['123'],
};
test('Werbebericht summiert Kampagnen je Artikel und verarbeitet TSV-Anführungen', () => {
  const rows = parseEbayAdvertisingTsv(
    'Campaign ID\tListing ID\tImpressions\tClicks\n"first"\t123\t100\t4\nsecond\t123\t50\t2\n',
    request,
  );
  assert.deepEqual(rows.get('123'), { impressions: 150, clicks: 6 });
});
test('Werbebericht weist Fremdartikel, Duplikate, negative Zahlen und fehlende Spalten zurück', () => {
  for (const text of [
    'Campaign ID\tListing ID\tImpressions\tClicks\na\t124\t1\t1',
    'Campaign ID\tListing ID\tImpressions\tClicks\na\t123\t1\t1\na\t123\t1\t1',
    'Campaign ID\tListing ID\tImpressions\tClicks\na\t123\t-1\t1',
    'Listing ID\tClicks\n123\t1',
  ]) {
    assert.throws(() => parseEbayAdvertisingTsv(text, request), { code: 'invalid_response' });
  }
});
test('Werbebericht weist ungültige oder fremde Tage und Zählerüberläufe zurück', () => {
  const daily = { ...request, listingIds: undefined, dimensions: [{ dimensionKey: 'day' }] };
  for (const date of ['2026-09-31', '2026-08-31'])
    assert.throws(() => parseEbayAdvertisingTsv(`Day\tImpressions\tClicks\n${date}\t1\t1`, daily), {
      code: 'invalid_response',
    });
  assert.throws(
    () =>
      parseEbayAdvertisingTsv(
        'Campaign ID\tListing ID\tImpressions\tClicks\na\t123\t9007199254740991\t1\nb\t123\t1\t1',
        request,
      ),
    { code: 'invalid_response' },
  );
});
test('Berichtwiederverwendung trennt Zeitraum, Marktplatz, Strategie, Kanal und Artikel', () => {
  const task = { ...request, reportTaskCreationDate: new Date().toISOString() };
  assert.equal(matchesEbayAdvertisingTask(task, request), true);
  assert.equal(matchesEbayAdvertisingTask({ ...task, channels: ['ON_SITE'] }, request), true);
  for (const changes of [
    { marketplaceId: 'EBAY_US' },
    { fundingModels: ['COST_PER_CLICK'] },
    { listingIds: ['124'] },
    { channels: ['OFF_SITE'] },
    { campaignIds: ['a'] },
    { dateFrom: '2026-09-02T00:00:00Z' },
    { reportTaskCreationDate: '2020-01-01T00:00:00Z' },
  ])
    assert.equal(matchesEbayAdvertisingTask({ ...task, ...changes }, request), false);
  assert.ok(EBAY_SCOPES.includes('https://api.ebay.com/oauth/api_scope/sell.marketing'));
});

function fixture() {
  const tasks: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const calls: string[] = [];
  let corrupt = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    assert.equal(url.origin, 'https://api.ebay.com');
    if (url.pathname.endsWith('traffic_report'))
      return Response.json({
        header: {
          dimensionKeys: [{ key: 'listing' }],
          metrics: Object.values(ebayTrafficMetrics).map((key) => ({ key })),
        },
        records: [
          {
            dimensionValues: [{ value: '123', applicable: true }],
            metricValues: Object.values(ebayTrafficMetrics).map(() => ({
              value: 0,
              applicable: true,
            })),
          },
        ],
      });
    if (url.pathname.endsWith('ad_report_task') && init?.method !== 'POST')
      return Response.json({ reportTasks: tasks });
    if (url.pathname.endsWith('ad_report_task')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      created.push(body);
      tasks.push({
        ...body,
        reportId: String(tasks.length),
        reportHref: 'https://evil.test/steal',
        reportTaskStatus: 'PENDING',
        reportTaskCreationDate: new Date().toISOString(),
        reportTaskCompletionDate: new Date().toISOString(),
      });
      return new Response(null, {
        status: 202,
        headers: { location: `${url.href}/${tasks.length}` },
      });
    }
    const task = tasks.find((entry) => url.pathname.endsWith(`/ad_report/${entry.reportId}`));
    if (!task) throw new Error('Unexpected report URL');
    const dimensions = task.dimensions as { dimensionKey: string }[];
    const keys = task.metricKeys as string[];
    const fields = dimensions.map(({ dimensionKey }) =>
      dimensionKey === 'day'
        ? getEbayTrafficPeriod(7).startDate
        : dimensionKey === 'listing_id'
          ? '123'
          : '1',
    );
    const text = corrupt
      ? 'Wrong\n1'
      : `${[...dimensions.map(({ dimensionKey }) => dimensionKey), ...keys].join('\t')}\n${[...fields, '100', '4'].join('\t')}\n`;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(stream);
  };
  return { fetcher, tasks, created, calls, corrupt: () => (corrupt = true) };
}
const config = { environment: 'production' } as EbayConfig;
test('Werbebericht startet nur Berichtaufträge und verwendet laufende Aufträge ohne doppelte Erstellung', async () => {
  const source = fixture();
  const pending = await readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher);
  assert.equal(pending.status, 'pending');
  assert.deepEqual(pending.days, []);
  assert.deepEqual(pending.items, []);
  assert.equal(source.created.length, 4);
  assert.equal(
    (await readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher)).status,
    'pending',
  );
  assert.equal(source.created.length, 4);
  assert.ok(
    source.calls.every((call) => !call.startsWith('POST') || call.endsWith('/ad_report_task')),
  );
});
test('Fertige Werbeberichte lesen ausschließlich die vertrauenswürdige API und summieren CPS und CPC', async () => {
  const source = fixture();
  await readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher);
  source.tasks.forEach((task) => (task.reportTaskStatus = 'SUCCESS'));
  const result = await readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher);
  assert.equal(result.status, 'ready');
  assert.equal(result.days.length, 7);
  assert.deepEqual(result.items, [{ listingId: '123', impressions: 200, clicks: 8 }]);
  assert.equal(result.days[0].impressions, 200);
  assert.equal(result.days[1].impressions, 0);
});
test('Fehlgeschlagene oder beschädigte Werbeberichte werden nicht als Nullwerte ausgegeben', async () => {
  const source = fixture();
  await readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher);
  source.tasks.forEach((task) => (task.reportTaskStatus = 'FAILED'));
  await assert.rejects(readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher), {
    code: 'provider_unavailable',
  });
  source.tasks.forEach((task) => (task.reportTaskStatus = 'SUCCESS'));
  source.corrupt();
  await assert.rejects(readEbayAdvertisingReport(config, 'fixture-token', 7, source.fetcher), {
    code: 'invalid_response',
  });
});
test('Fehlende Marketing-Freigabe erzeugt keine Aufträge', async () => {
  await assert.rejects(
    readEbayAdvertisingReport(
      config,
      'fixture-token',
      7,
      async () => new Response(null, { status: 403 }),
    ),
    { code: 'scope_missing' },
  );
});
