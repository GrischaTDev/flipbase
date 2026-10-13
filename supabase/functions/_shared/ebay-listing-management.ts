import type {
  EbayListingDetails,
  EbayListingUpdate,
  EbayListingTraffic,
} from './ebay-contracts.ts';
import {
  EbayError,
  ebayJson,
  getEbayHosts,
  readRecord,
  readNonNegativeNumber,
} from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import { parseEbayXml, findXmlChild, readXmlText } from './ebay-xml.ts';
import type { EbayXmlNode } from './ebay-xml.ts';
import { hashState } from './ebay-token-encryption.ts';

export function escapeEbayXml(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ??
      character,
  );
}
export function requireEbayListingId(listingId: unknown): string {
  if (typeof listingId !== 'string' || !/^\d{1,20}$/.test(listingId))
    throw new EbayError('invalid_request');
  return listingId;
}
export function requireEbayImageUrl(imageUrl: unknown): string {
  const result = requireHttpsImageUrl(imageUrl);
  if (!new URL(result).hostname.endsWith('.ebayimg.com')) throw new EbayError('invalid_request');
  return result;
}
function requireHttpsImageUrl(imageUrl: unknown): string {
  if (typeof imageUrl !== 'string' || imageUrl.length > 2048)
    throw new EbayError('invalid_request');
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname)
      throw new Error();
    return imageUrl;
  } catch {
    throw new EbayError('invalid_request');
  }
}
export function validateEbayUpdate(input: unknown): EbayListingUpdate {
  const update = readRecord(input);
  if (
    typeof update.expectedRevision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(update.expectedRevision)
  )
    throw new EbayError('invalid_request');
  const allowed = ['expectedRevision', 'title', 'price', 'description', 'imageUrls'];
  if (Object.keys(update).some((key) => !allowed.includes(key)) || Object.keys(update).length < 2)
    throw new EbayError('invalid_request');
  if (
    update.title !== undefined &&
    (typeof update.title !== 'string' ||
      !update.title.trim() ||
      update.title.length > 80 ||
      /[\x00-\x1f]/.test(update.title))
  )
    throw new EbayError('invalid_request');
  if (
    update.price !== undefined &&
    (typeof update.price !== 'number' ||
      !Number.isFinite(update.price) ||
      update.price <= 0 ||
      update.price > 1000000 ||
      Math.abs(update.price * 100 - Math.round(update.price * 100)) > 0.00001)
  )
    throw new EbayError('invalid_request');
  if (
    update.description !== undefined &&
    (typeof update.description !== 'string' ||
      !update.description.trim() ||
      update.description.length > 20000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(update.description))
  )
    throw new EbayError('invalid_request');
  if (update.imageUrls !== undefined) {
    if (
      !Array.isArray(update.imageUrls) ||
      update.imageUrls.length < 1 ||
      update.imageUrls.length > 24 ||
      new Set(update.imageUrls).size !== update.imageUrls.length
    )
      throw new EbayError('invalid_request');
    update.imageUrls.forEach(requireHttpsImageUrl);
  }
  return update as unknown as EbayListingUpdate;
}
async function trading(
  config: EbayConfig,
  token: string,
  call: string,
  payload: string,
  fetcher: typeof fetch,
): Promise<EbayXmlNode> {
  let response: Response;
  try {
    response = await fetcher(`${getEbayHosts(config.environment).api}/ws/api.dll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'X-EBAY-API-CALL-NAME': call,
        'X-EBAY-API-SITEID': '77',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1477',
        'X-EBAY-API-IAF-TOKEN': token,
      },
      body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${payload}</${call}Request>`,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EbayError(call.startsWith('Revise') ? 'save_unconfirmed' : 'provider_unavailable');
  }
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (!response.ok)
    throw new EbayError(call.startsWith('Revise') ? 'save_unconfirmed' : 'provider_unavailable');
  let root: EbayXmlNode;
  try {
    root = parseEbayXml(await response.text());
  } catch {
    throw new EbayError(call.startsWith('Revise') ? 'save_unconfirmed' : 'invalid_response');
  }
  const ack = readXmlText(root, 'Ack');
  if (ack !== 'Success' && ack !== 'Warning') {
    const codes = root.children
      .filter((node) => node.name === 'Errors')
      .map((node) => readXmlText(node, 'ErrorCode'));
    if (codes.some((code) => ['931', '932', '16110', '21917053'].includes(code ?? '')))
      throw new EbayError('needs_login');
    throw new EbayError(call.startsWith('Revise') ? 'revision_rejected' : 'provider_unavailable');
  }
  return root;
}
export async function readEbayListingDetails(
  config: EbayConfig,
  token: string,
  listingId: string,
  username: string | null,
  fetcher = fetch,
): Promise<EbayListingDetails> {
  requireEbayListingId(listingId);
  const root = await trading(
    config,
    token,
    'GetItem',
    `<ItemID>${listingId}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeWatchCount>true</IncludeWatchCount>`,
    fetcher,
  );
  const item = findXmlChild(root, 'Item');
  if (!item || readXmlText(item, 'ItemID') !== listingId) throw new EbayError('invalid_response');
  const seller = readXmlText(findXmlChild(item, 'Seller'), 'UserID');
  if (!username || !seller || seller.toLowerCase() !== username.toLowerCase())
    throw new EbayError('listing_not_owned');
  const status = findXmlChild(item, 'SellingStatus');
  if (readXmlText(status, 'ListingStatus') !== 'Active')
    throw new EbayError('listing_not_editable');
  const price = findXmlChild(status, 'CurrentPrice');
  const pictureDetails = findXmlChild(item, 'PictureDetails');
  const imageUrls = (pictureDetails?.children ?? [])
    .filter((node) => node.name === 'PictureURL')
    .map((node) => node.text.trim());
  const title = readXmlText(item, 'Title');
  if (!title) throw new EbayError('invalid_response');
  const description = findXmlChild(item, 'Description')?.text ?? '';
  const listing = {
    id: listingId,
    title,
    description,
    imageUrls,
    price: readNonNegativeNumber(price?.text),
    currency: price?.attributes.currencyID ?? null,
    quantity: readNonNegativeNumber(readXmlText(item, 'Quantity')),
    listingType: readXmlText(item, 'ListingType'),
    url: `${config.environment === 'sandbox' ? 'https://sandbox.ebay.com' : 'https://www.ebay.de'}/itm/${listingId}`,
    imageUrl: imageUrls[0] ?? null,
    watchCount: readNonNegativeNumber(readXmlText(item, 'WatchCount')),
    hasVariations: findXmlChild(item, 'Variations') !== undefined,
  };
  return {
    ...listing,
    revision: await hashState(JSON.stringify([title, description, listing.price, imageUrls])),
  };
}
export async function reviseEbayListing(
  config: EbayConfig,
  token: string,
  listing: EbayListingDetails,
  update: EbayListingUpdate,
  fetcher = fetch,
) {
  if (listing.revision !== update.expectedRevision) throw new EbayError('listing_changed');
  for (const url of update.imageUrls ?? []) {
    if (!listing.imageUrls.includes(url)) requireEbayImageUrl(url);
  }
  if (
    !['FixedPriceItem', 'Chinese'].includes(listing.listingType ?? '') ||
    (listing.hasVariations && update.price !== undefined)
  )
    throw new EbayError('listing_not_editable');
  const payload =
    `<Item><ItemID>${listing.id}</ItemID>` +
    (update.title === undefined ? '' : `<Title>${escapeEbayXml(update.title)}</Title>`) +
    (update.price === undefined
      ? ''
      : `<StartPrice currencyID="${escapeEbayXml(listing.currency ?? 'EUR')}">${update.price.toFixed(2)}</StartPrice>`) +
    (update.description === undefined
      ? ''
      : `<Description>${escapeEbayXml(update.description)}</Description><DescriptionReviseMode>Replace</DescriptionReviseMode>`) +
    (update.imageUrls === undefined
      ? ''
      : `<PictureDetails>${update.imageUrls.map((url) => `<PictureURL>${escapeEbayXml(url)}</PictureURL>`).join('')}</PictureDetails>`) +
    '</Item>';
  const root = await trading(
    config,
    token,
    listing.listingType === 'FixedPriceItem' ? 'ReviseFixedPriceItem' : 'ReviseItem',
    payload,
    fetcher,
  );
  if (readXmlText(root, 'ItemID') !== listing.id) throw new EbayError('save_unconfirmed');
  return {
    ok: true,
    warning:
      readXmlText(root, 'Ack') === 'Warning'
        ? 'eBay hat die Änderung mit Hinweisen bestätigt. Prüfe das Angebot bei eBay.'
        : null,
  };
}
export async function uploadEbayImage(
  config: EbayConfig,
  token: string,
  image: File,
  fetcher = fetch,
): Promise<string> {
  if (
    image.size < 1 ||
    image.size > 12 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(image.type)
  )
    throw new EbayError('invalid_request');
  const form = new FormData();
  form.set('image', image, image.name);
  const host =
    config.environment === 'sandbox' ? 'https://apim.sandbox.ebay.com' : 'https://apim.ebay.com';
  const base = `${host}/commerce/media/v1_beta/image`;
  const response = await fetcher(`${base}/create_image_from_file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (response.status === 400) throw new EbayError('image_rejected');
  if (response.status !== 201) throw new EbayError('provider_unavailable');
  const body = readRecord(await response.json());
  if (typeof body.imageUrl === 'string') return requireEbayImageUrl(body.imageUrl);
  // Niemals einen beliebigen Location-Host mit dem Nutzertoken aufrufen.
  const location = new URL(response.headers.get('location') ?? '');
  if (
    location.origin !== host ||
    !/^\/commerce\/media\/v1_beta\/image\/[^/]+$/.test(location.pathname) ||
    location.search ||
    location.hash ||
    location.username ||
    location.password
  )
    throw new EbayError('invalid_response');
  const result = await ebayJson(location.href, token, fetcher);
  return requireEbayImageUrl(result.imageUrl);
}
export function parseEbayTraffic(
  body: Record<string, unknown>,
  listingIds: readonly string[],
): readonly EbayListingTraffic[] {
  const header = readRecord(body.header);
  if (
    !Array.isArray(header.metrics) ||
    !Array.isArray(header.dimensionKeys) ||
    !Array.isArray(body.records)
  )
    throw new EbayError('invalid_response');
  const keys = header.metrics.map((metric) => readRecord(metric).key);
  if (
    header.dimensionKeys.length !== 1 ||
    typeof readRecord(header.dimensionKeys[0]).key !== 'string' ||
    !readRecord(header.dimensionKeys[0]).key ||
    !['LISTING_VIEWS_TOTAL', 'TRANSACTION', 'SALES_CONVERSION_RATE'].every((key) =>
      keys.includes(key),
    )
  )
    throw new EbayError('invalid_response');
  const results = new Map<string, EbayListingTraffic>();
  for (const record of body.records) {
    const row = readRecord(record);
    if (!Array.isArray(row.dimensionValues) || !Array.isArray(row.metricValues))
      throw new EbayError('invalid_response');
    // Der LISTING-Bericht hat genau eine Dimension; ihre Bezeichnung ist kein Enum.
    // Die Angebots-ID wird unabhängig davon gegen die angefragten IDs geprüft.
    if (row.dimensionValues.length !== 1) throw new EbayError('invalid_response');
    const dimension = readRecord(row.dimensionValues[0]);
    const listingId = String(dimension.value ?? '');
    if (!listingIds.includes(listingId) || results.has(listingId))
      throw new EbayError('invalid_response');
    const metric = (key: string) => {
      const values = row.metricValues as unknown[];
      const entry = readRecord(values[keys.indexOf(key)]);
      return entry.applicable === true ? readNonNegativeNumber(entry.value) : null;
    };
    results.set(listingId, {
      listingId,
      views: metric('LISTING_VIEWS_TOTAL'),
      transactions: metric('TRANSACTION'),
      conversionRate: metric('SALES_CONVERSION_RATE'),
    });
  }
  return listingIds.map(
    (listingId) =>
      results.get(listingId) ?? {
        listingId,
        views: null,
        transactions: null,
        conversionRate: null,
      },
  );
}
export async function readEbayTraffic(
  config: EbayConfig,
  token: string,
  listingIds: readonly string[],
  fetcher = fetch,
) {
  if (
    listingIds.length < 1 ||
    listingIds.length > 50 ||
    new Set(listingIds).size !== listingIds.length
  )
    throw new EbayError('invalid_request');
  listingIds.forEach(requireEbayListingId);
  // Abgeschlossene UTC-Tage vermeiden eine scheinbar vollständige Statistik für heute.
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10),
    endDate = end.toISOString().slice(0, 10);
  const url = new URL(`${getEbayHosts(config.environment).api}/sell/analytics/v1/traffic_report`);
  url.search = new URLSearchParams({
    dimension: 'LISTING',
    filter: `listing_ids:{${listingIds.join('|')}},marketplace_ids:{EBAY_DE},date_range:[${startDate}T00:00:00.000+00:00..${endDate}T23:59:59.000+00:00]`,
    metric: 'LISTING_VIEWS_TOTAL,TRANSACTION,SALES_CONVERSION_RATE',
  }).toString();
  const body = await ebayJson(url.href, token, fetcher);
  let items: readonly EbayListingTraffic[];
  try {
    items = parseEbayTraffic(body, listingIds);
  } catch (error) {
    if (error instanceof EbayError && error.code === 'invalid_response') {
      const header = readRecord(body.header);
      const keys = (entries: unknown) =>
        Array.isArray(entries)
          ? entries
              .map((entry) => readRecord(entry).key)
              .filter((key) => typeof key === 'string' && /^[a-zA-Z_]{1,64}$/.test(key))
          : [];
      console.warn('eBay-Statistikantwort kann nicht ausgewertet werden!', {
        DimensionKeys: keys(header.dimensionKeys),
        MetricKeys: keys(header.metrics),
        HasRecords: Array.isArray(body.records),
      });
    }
    throw error;
  }
  return {
    startDate,
    endDate,
    lastUpdatedDate: typeof body.lastUpdatedDate === 'string' ? body.lastUpdatedDate : null,
    items,
  };
}
