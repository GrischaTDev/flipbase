import { z } from 'zod';
import { VintedItemSchema, type VintedItem } from './schema.js';

const MoneySchema = z.object({
  amount: z.union([z.string(), z.number()]),
  currencyCode: z.string(),
});

const CatalogProductSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    url: z.string(),
    price: MoneySchema.nullish(),
    totalItemPrice: MoneySchema,
    thumbnailUrls: z.array(z.string()).nullish(),
    photos: z
      .array(
        z.object({
          url: z.string().nullish(),
          isMain: z.boolean().nullish(),
        }),
      )
      .nullish(),
    user: z
      .object({
        thumbnailUrl: z.string().nullish(),
      })
      .nullish(),
    itemBox: z
      .object({
        firstLine: z.string().nullish(),
        secondLine: z.string().nullish(),
      })
      .nullish(),
  })
  .passthrough();

const CatalogItemsStateSchema = z.object({
  items: z.array(
    z.object({
      productItem: z.unknown(),
    }),
  ),
});

const FLIGHT_PUSH_MARKER = 'self.__next_f.push([1,';
const ITEMS_MARKER = '"items":{"items":';

/**
 * Liest die von Next.js in Script-Tags eingebetteten RSC-Daten aus.
 * Der Katalog wird serverseitig gerendert; die alte JSON-API gibt es nicht
 * mehr. Die Daten werden hier gezielt aus dem Flight-Zustand gelesen, ohne
 * JavaScript der fremden Seite auszuführen.
 */
function decodeFlightPayload(page: string): string {
  const parts: string[] = [];
  let cursor = 0;

  while (true) {
    const markerStart = page.indexOf(FLIGHT_PUSH_MARKER, cursor);
    if (markerStart < 0) break;

    const valueStart = markerStart + FLIGHT_PUSH_MARKER.length;
    const value = readJsonString(page, valueStart);
    if (value !== null) parts.push(value);

    cursor = valueStart + 1;
  }

  return parts.length > 0 ? parts.join('\n') : page;
}

function readJsonString(source: string, start: number): string | null {
  if (source[start] !== '"') return null;

  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      const parsed: unknown = JSON.parse(source.slice(start, index + 1));
      return typeof parsed === 'string' ? parsed : null;
    }
  }

  return null;
}

function extractJsonObject(source: string, start: number): string {
  if (source[start] !== '{') throw new Error('Vinted catalog item data is malformed');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error('Vinted catalog item data is malformed');
}

function splitItemDetails(value: string | null | undefined): {
  size: string | null;
  condition: string | null;
} {
  if (!value) return { size: null, condition: null };

  const separator = value.indexOf(' · ');
  if (separator < 0) return { size: value, condition: null };

  return {
    size: value.slice(0, separator) || null,
    condition: value.slice(separator + 3) || null,
  };
}

function toLegacyItem(product: z.infer<typeof CatalogProductSchema>, baseUrl: string): VintedItem {
  const details = splitItemDetails(product.itemBox?.secondLine);
  const photos = (product.photos ?? [])
    .filter((photo) => photo.url)
    .map((photo) => ({ url: photo.url, is_main: photo.isMain }));
  const fallbackPhotos = (product.thumbnailUrls ?? []).map((url) => ({
    url,
    is_main: undefined,
  }));
  const userPhoto = product.user?.thumbnailUrl;

  return VintedItemSchema.parse({
    id: product.id,
    title: product.title,
    url: new URL(product.url, baseUrl).toString(),
    total_item_price: {
      amount: product.totalItemPrice.amount,
      currency_code: product.totalItemPrice.currencyCode,
    },
    price: product.price
      ? { amount: product.price.amount, currency_code: product.price.currencyCode }
      : undefined,
    brand_title: product.itemBox?.firstLine ?? null,
    size_title: details.size,
    status: details.condition,
    is_visible: true,
    user: { login: null, photo: userPhoto ? { url: userPhoto } : null },
    photos: photos.length > 0 ? photos : fallbackPhotos,
  });
}

export function parseVintedCatalogPage(page: string, baseUrl: string): VintedItem[] {
  const flightPayload = decodeFlightPayload(page);
  const markerStart = flightPayload.indexOf(ITEMS_MARKER);
  if (markerStart < 0) throw new Error('Vinted catalog page has no catalog item data');

  const stateStart = markerStart + '"items":'.length;
  const state = CatalogItemsStateSchema.parse(
    JSON.parse(extractJsonObject(flightPayload, stateStart)) as unknown,
  );

  return state.items.map((entry) => {
    return toLegacyItem(CatalogProductSchema.parse(entry.productItem), baseUrl);
  });
}
