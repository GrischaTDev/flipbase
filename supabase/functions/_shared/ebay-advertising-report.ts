import { EbayError, ebayJson, getEbayHosts, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import type { EbayAdvertisingCounts, EbayTrafficDays } from './ebay-contracts.ts';
import { readEbayListingMetrics } from './ebay-listing-performance.ts';
import { getEbayTrafficPeriod } from './ebay-traffic-overview.ts';

type FundingModel = 'COST_PER_SALE' | 'COST_PER_CLICK';
interface AdvertisingRequest {
  readonly reportType: 'ACCOUNT_PERFORMANCE_REPORT' | 'LISTING_PERFORMANCE_REPORT';
  readonly fundingModels: readonly FundingModel[];
  readonly dimensions: readonly { readonly dimensionKey: string }[];
  readonly metricKeys: readonly string[];
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly marketplaceId: 'EBAY_DE';
  readonly reportFormat: 'TSV_GZIP';
  readonly channels?: readonly ['ON_SITE'];
  readonly listingIds?: readonly string[];
}

function reportRequest(
  model: FundingModel,
  listingIds: readonly string[] | null,
  startDate: string,
  endDate: string,
): AdvertisingRequest {
  const isCpc = model === 'COST_PER_CLICK';
  return {
    reportType: listingIds ? 'LISTING_PERFORMANCE_REPORT' : 'ACCOUNT_PERFORMANCE_REPORT',
    fundingModels: [model],
    dimensions: (listingIds
      ? ['campaign_id', 'listing_id', ...(isCpc ? ['ad_group_id'] : [])]
      : ['day']
    ).map((dimensionKey) => ({ dimensionKey })),
    metricKeys: isCpc ? ['cpc_impressions', 'cpc_clicks'] : ['impressions', 'clicks'],
    dateFrom: `${startDate}T00:00:00.000Z`,
    dateTo: `${endDate}T23:59:59.000Z`,
    marketplaceId: 'EBAY_DE',
    reportFormat: 'TSV_GZIP',
    ...(isCpc ? { channels: ['ON_SITE'] as const } : {}),
    ...(listingIds ? { listingIds } : {}),
  };
}

function equalStrings(left: unknown, right: readonly string[]): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((entry) => typeof entry === 'string') &&
    [...left].sort().join('|') === [...right].sort().join('|')
  );
}

export function matchesEbayAdvertisingTask(
  task: Record<string, unknown>,
  request: AdvertisingRequest,
): boolean {
  const dimensions = Array.isArray(task.dimensions)
    ? task.dimensions.map((entry) => readRecord(entry).dimensionKey)
    : [];
  return (
    task.reportType === request.reportType &&
    task.marketplaceId === request.marketplaceId &&
    task.reportFormat === request.reportFormat &&
    Date.parse(String(task.dateFrom)) === Date.parse(request.dateFrom) &&
    Date.parse(String(task.dateTo)) === Date.parse(request.dateTo) &&
    equalStrings(task.fundingModels ?? ['COST_PER_SALE'], request.fundingModels) &&
    equalStrings(
      dimensions,
      request.dimensions.map((dimension) => dimension.dimensionKey),
    ) &&
    equalStrings(task.metricKeys, request.metricKeys) &&
    equalStrings(task.listingIds ?? [], request.listingIds ?? []) &&
    (task.campaignIds === undefined || equalStrings(task.campaignIds, [])) &&
    (task.inventoryReferences === undefined || equalStrings(task.inventoryReferences, [])) &&
    (equalStrings(task.channels ?? ['ON_SITE'], ['ON_SITE']) ||
      (!request.channels && equalStrings(task.channels, []))) &&
    Date.parse(String(task.reportTaskCreationDate)) >= Date.now() - 86400000 &&
    (!task.reportExpirationDate || Date.parse(String(task.reportExpirationDate)) > Date.now())
  );
}

function requireAdvertisingResponse(response: Response): void {
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (!response.ok) throw new EbayError('provider_unavailable');
}

async function readTasks(base: string, token: string, fetcher: typeof fetch) {
  const tasks: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 1000; offset += 500) {
    const page = await ebayJson(
      `${base}/ad_report_task?limit=500&offset=${offset}`,
      token,
      fetcher,
    );
    if (!Array.isArray(page.reportTasks) || page.reportTasks.length > 500)
      throw new EbayError('invalid_response');
    tasks.push(...page.reportTasks.map(readRecord));
    if (!page.next) return tasks;
  }
  // Ohne vollständige Suche keine doppelten Berichte erzeugen.
  throw new EbayError('provider_unavailable');
}

async function createTask(
  base: string,
  token: string,
  request: AdvertisingRequest,
  fetcher: typeof fetch,
) {
  const response = await fetcher(`${base}/ad_report_task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'en-GB',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  requireAdvertisingResponse(response);
  const location = response.headers.get('location');
  if (response.status !== 202 || !location) throw new EbayError('invalid_response');
  const url = new URL(location, base);
  if (
    url.origin !== new URL(base).origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/sell\/marketing\/v1\/ad_report_task\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname)
  )
    throw new EbayError('invalid_response');
}

async function readLimitedBytes(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > maximum) throw new EbayError('invalid_response');
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function parseTsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [],
    field = '',
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (character === '\t' || character === '\n')) {
      fields.push(field.replace(/\r$/, ''));
      field = '';
      if (character === '\n') {
        if (fields.some((entry) => entry !== '')) rows.push(fields);
        fields = [];
      }
    } else field += character;
  }
  if (quoted) throw new EbayError('invalid_response');
  if (field || fields.length) {
    fields.push(field.replace(/\r$/, ''));
    rows.push(fields);
  }
  return rows;
}

export function parseEbayAdvertisingTsv(
  text: string,
  request: AdvertisingRequest,
): Map<string, EbayAdvertisingCounts> {
  const rows = parseTsvRows(text.replace(/^\uFEFF/, ''));
  const header = (rows.shift() ?? []).map((entry) => entry.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const column = (key: string) => {
    const normalized = key.replace(/_/g, '');
    const aliases =
      key === 'day'
        ? ['day', 'date']
        : key === 'listing_id'
          ? ['listingid', 'ebaylistingid']
          : key.startsWith('cpc_')
            ? [normalized, normalized.slice(3)]
            : [normalized];
    const positions = header.flatMap((entry, index) => (aliases.includes(entry) ? [index] : []));
    if (positions.length !== 1) throw new EbayError('invalid_response');
    return positions[0];
  };
  const dimensionColumns = request.dimensions.map((dimension) => column(dimension.dimensionKey));
  const countColumns = request.metricKeys.map(column);
  const keyColumn = column(request.listingIds ? 'listing_id' : 'day');
  const results = new Map<string, EbayAdvertisingCounts>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.length !== header.length) throw new EbayError('invalid_response');
    const identity = JSON.stringify(dimensionColumns.map((index) => row[index]));
    if (seen.has(identity)) throw new EbayError('invalid_response');
    seen.add(identity);
    let key = row[keyColumn];
    if (request.listingIds) {
      if (!request.listingIds.includes(key)) throw new EbayError('invalid_response');
    } else {
      if (/^\d{8}$/.test(key)) key = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
      const timestamp = Date.parse(key);
      if (!Number.isFinite(timestamp)) throw new EbayError('invalid_response');
      const canonicalDate = new Date(timestamp).toISOString().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && canonicalDate !== key)
        throw new EbayError('invalid_response');
      key = canonicalDate;
      if (key < request.dateFrom.slice(0, 10) || key > request.dateTo.slice(0, 10))
        throw new EbayError('invalid_response');
    }
    const counts = countColumns.map((index) => {
      if (!/^\d+$/.test(row[index])) throw new EbayError('invalid_response');
      const count = Number(row[index]);
      if (!Number.isSafeInteger(count)) throw new EbayError('invalid_response');
      return count;
    });
    const previous = results.get(key) ?? { impressions: 0, clicks: 0 };
    const combined = {
      impressions: previous.impressions + counts[0],
      clicks: previous.clicks + counts[1],
    };
    if (!Number.isSafeInteger(combined.impressions) || !Number.isSafeInteger(combined.clicks))
      throw new EbayError('invalid_response');
    results.set(key, combined);
  }
  return results;
}

async function downloadReport(
  base: string,
  token: string,
  task: Record<string, unknown>,
  request: AdvertisingRequest,
  fetcher: typeof fetch,
) {
  if (typeof task.reportId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(task.reportId))
    throw new EbayError('invalid_response');
  // Die fremde reportHref wird nie mit unserem Bearer-Token aufgerufen.
  const response = await fetcher(`${base}/ad_report/${task.reportId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'en-GB' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  requireAdvertisingResponse(response);
  if (!response.body) throw new EbayError('invalid_response');
  try {
    const compressed = await readLimitedBytes(response.body, 8 * 1024 * 1024);
    // HTTP-Transportkompression kann bereits durch fetch entfernt worden sein.
    const bytes =
      compressed[0] === 0x1f && compressed[1] === 0x8b
        ? await readLimitedBytes(
            new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
            20 * 1024 * 1024,
          )
        : compressed;
    return parseEbayAdvertisingTsv(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      request,
    );
  } catch (error) {
    if (error instanceof EbayError) throw error;
    throw new EbayError('invalid_response');
  }
}

export async function readEbayAdvertisingReport(
  config: EbayConfig,
  token: string,
  days: EbayTrafficDays,
  fetcher = fetch,
) {
  const period = getEbayTrafficPeriod(days);
  const base = `${getEbayHosts(config.environment).api}/sell/marketing/v1`;
  const tasks = await readTasks(base, token, fetcher);
  const listings = await readEbayListingMetrics(config, token, days, fetcher);
  const listingIds = listings.items.map((item) => item.listingId);
  const requests = (['COST_PER_SALE', 'COST_PER_CLICK'] as const).flatMap((model) => [
    reportRequest(model, null, period.startDate, period.endDate),
    ...(listingIds.length
      ? [reportRequest(model, listingIds, period.startDate, period.endDate)]
      : []),
  ]);
  let isPending = false;
  const ready: { request: AdvertisingRequest; task: Record<string, unknown> }[] = [];
  for (const request of requests) {
    const task = tasks
      .filter((entry) => matchesEbayAdvertisingTask(entry, request))
      .sort(
        (left, right) =>
          Date.parse(String(right.reportTaskCreationDate)) -
          Date.parse(String(left.reportTaskCreationDate)),
      )[0];
    if (!task) {
      await createTask(base, token, request, fetcher);
      isPending = true;
    } else if (task.reportTaskStatus === 'SUCCESS') ready.push({ request, task });
    else if (task.reportTaskStatus === 'FAILED') throw new EbayError('provider_unavailable');
    else if (task.reportTaskStatus === 'PENDING' || task.reportTaskStatus === 'IN_PROGRESS')
      isPending = true;
    else throw new EbayError('invalid_response');
  }
  if (isPending)
    return { ...period, status: 'pending' as const, generatedAt: null, days: [], items: [] };
  const daily = new Map<string, EbayAdvertisingCounts>();
  const items = new Map<string, EbayAdvertisingCounts>();
  for (const { task, request } of ready) {
    const rows = await downloadReport(base, token, task, request, fetcher);
    const target = request.listingIds ? items : daily;
    for (const [key, counts] of rows) {
      const previous = target.get(key) ?? { impressions: 0, clicks: 0 };
      const combined = {
        impressions: previous.impressions + counts.impressions,
        clicks: previous.clicks + counts.clicks,
      };
      if (!Number.isSafeInteger(combined.impressions) || !Number.isSafeInteger(combined.clicks))
        throw new EbayError('invalid_response');
      target.set(key, combined);
    }
  }
  const completedDates = ready
    .map(({ task }) => task.reportTaskCompletionDate)
    .filter(
      (entry): entry is string => typeof entry === 'string' && Number.isFinite(Date.parse(entry)),
    )
    .sort();
  return {
    ...period,
    status: 'ready' as const,
    generatedAt: completedDates[0] ?? null,
    days: Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.parse(period.startDate) + index * 86400000)
        .toISOString()
        .slice(0, 10);
      return { date, ...(daily.get(date) ?? { impressions: 0, clicks: 0 }) };
    }),
    items: listingIds.map((listingId) => ({
      listingId,
      ...(items.get(listingId) ?? { impressions: 0, clicks: 0 }),
    })),
  };
}
