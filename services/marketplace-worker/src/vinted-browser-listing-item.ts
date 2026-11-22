import type { Page } from 'playwright';
import type { VintedListingContent } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

/** Ein Foto des Inserats mit allen Adressen, unter denen Vinted es ausliefert. */
export interface VintedListingItemPhoto {
  id: number;
  urls: readonly string[];
}

/** Gespeicherter Stand eines eigenen Inserats, wie ihn Vinteds Bearbeitungsmaske selbst abruft. */
export interface VintedListingItem {
  title: string;
  description: string;
  priceCents: number;
  categoryId: number;
  brandId: number | null;
  sizeId: number | null;
  accessoryDepartmentId: number | null;
  conditionId: number | null;
  colorIds: readonly number[];
  materialIds: readonly number[];
  packageSizeId: number | null;
  photos: readonly VintedListingItemPhoto[];
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const optionalId = (value: unknown): number | null | undefined =>
  value === null || value === undefined || value === 0 ? null : positive(value) ? value : undefined;

function parsePhotos(input: unknown): VintedListingItemPhoto[] | null {
  if (!Array.isArray(input) || input.length > 40) return null;
  const photos: VintedListingItemPhoto[] = [];
  for (const entry of input as unknown[]) {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !positive(entry.id)) return null;
    const urls: string[] = [];
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.length <= 2000 && value.startsWith('https://'))
        urls.push(value);
    };
    if ('url' in entry) add(entry.url);
    if ('full_size_url' in entry) add(entry.full_size_url);
    if ('thumbnails' in entry && Array.isArray(entry.thumbnails))
      for (const thumbnail of (entry.thumbnails as unknown[]).slice(0, 40))
        if (thumbnail && typeof thumbnail === 'object' && 'url' in thumbnail) add(thumbnail.url);
    photos.push({ id: entry.id, urls });
  }
  return new Set(photos.map((photo) => photo.id)).size === photos.length ? photos : null;
}

function parsePriceCents(input: unknown): number | null {
  if (!input || typeof input !== 'object' || !('amount' in input)) return null;
  if ('currency_code' in input && input.currency_code !== 'EUR') return null;
  const amount = typeof input.amount === 'number' ? String(input.amount) : input.amount;
  const match =
    typeof amount === 'string' ? /^([0-9]{1,9})(?:\.([0-9]{1,2}))?$/.exec(amount) : null;
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return cents > 0 ? cents : null;
}

interface VintedListingItemWithExtras {
  item: VintedListingItem;
  ownerId: string | null;
  extraAttributes: Readonly<Record<string, string>>;
}

const sameNumbers = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** Rohdaten des eigenen Inserats aus Vinteds Bearbeitungsschnittstelle, ohne sie zu deuten. */
async function fetchVintedListingItemRecord(page: Page, externalId: string): Promise<unknown> {
  if (!/^[1-9][0-9]{0,31}$/.test(externalId)) return null;
  let origin: string;
  try {
    origin = new URL(page.url()).origin;
  } catch {
    return null;
  }
  if (origin !== 'https://www.vinted.de') return null;
  try {
    return await page.evaluate(async (itemId) => {
      const response = await fetch('/api/v2/item_upload/items/' + itemId, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok || new URL(response.url).origin !== 'https://www.vinted.de') return null;
      const body: unknown = await response.json();
      return body && typeof body === 'object' && 'item' in body ? body.item : null;
    }, externalId);
  } catch {
    return null;
  }
}

/**
 * Nur Kennung und Preis eines Inserats. Andere Felder dürfen fehlen oder unbekannt aufgebaut
 * sein: Eine Preisbestätigung darf nicht daran scheitern, dass Vinted Fotos oder Merkmale
 * anders liefert.
 */
export function parseVintedListingItemPriceCents(item: unknown, externalId: string): number | null {
  if (!item || typeof item !== 'object' || !('id' in item) || String(item.id) !== externalId)
    return null;
  return parsePriceCents('price' in item ? item.price : null);
}

/** Liest tolerant nur den gespeicherten Preis des eigenen Inserats; nichts wird geschrieben. */
export async function readVintedListingPriceCents(
  page: Page,
  externalId: string,
): Promise<number | null> {
  return parseVintedListingItemPriceCents(
    await fetchVintedListingItemRecord(page, externalId),
    externalId,
  );
}

/** Deutet ein Inserat aus Vinteds Antwort, etwa der Antwort auf den Speicherklick. */
export function parseVintedListingItem(
  item: unknown,
  externalId: string,
): VintedListingItem | null {
  return parseVintedListingItemRecord(item, externalId)?.item ?? null;
}

async function readVintedListingItemWithExtras(
  page: Page,
  externalId: string,
): Promise<VintedListingItemWithExtras | null> {
  return parseVintedListingItemRecord(
    await fetchVintedListingItemRecord(page, externalId),
    externalId,
  );
}

function parseVintedListingItemRecord(
  item: unknown,
  externalId: string,
): VintedListingItemWithExtras | null {
  if (!/^[1-9][0-9]{0,31}$/.test(externalId)) return null;
  if (!item || typeof item !== 'object' || !('id' in item) || String(item.id) !== externalId)
    return null;
  const rawUserId = 'user_id' in item ? item.user_id : null;
  const ownerId =
    rawUserId === null || rawUserId === undefined
      ? null
      : typeof rawUserId === 'number' || typeof rawUserId === 'string'
        ? String(rawUserId)
        : 'invalid';
  const title = 'title' in item ? item.title : null;
  const description = 'description' in item ? item.description : null;
  const priceCents = parsePriceCents('price' in item ? item.price : null);
  const categoryId = 'catalog_id' in item ? item.catalog_id : null;
  const brandId = optionalId('brand_id' in item ? item.brand_id : null);
  const packageSizeId = optionalId('package_size_id' in item ? item.package_size_id : null);
  const colors = [
    optionalId('color1_id' in item ? item.color1_id : null),
    optionalId('color2_id' in item ? item.color2_id : null),
  ];
  const photos = parsePhotos('photos' in item ? item.photos : null);
  const attributes = 'item_attributes' in item ? item.item_attributes : null;
  if (
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    priceCents === null ||
    !positive(categoryId) ||
    brandId === undefined ||
    packageSizeId === undefined ||
    colors.includes(undefined) ||
    !photos ||
    !Array.isArray(attributes)
  )
    return null;
  const ids: Record<'size' | 'condition' | 'material' | 'accessory_department', number[]> = {
    size: [],
    accessory_department: [],
    condition: [],
    material: [],
  };
  const extraAttributes: Record<string, string> = {};
  for (const entry of attributes as unknown[]) {
    if (!entry || typeof entry !== 'object' || !('code' in entry) || !('ids' in entry)) return null;
    const { code, ids: values } = entry;
    if (
      code !== 'size' &&
      code !== 'condition' &&
      code !== 'material' &&
      code !== 'accessory_department'
    ) {
      if (
        typeof code === 'string' &&
        /^[a-z][a-z0-9_]{0,39}$/.test(code) &&
        !code.endsWith('_label') &&
        Array.isArray(values) &&
        values.length >= 1 &&
        values.length <= 10 &&
        (values as unknown[]).every(positive)
      )
        extraAttributes[code] = [...new Set(values as number[])].join(',');
      continue;
    }
    if (!Array.isArray(values) || !(values as unknown[]).every(positive)) return null;
    ids[code].push(...(values as number[]));
  }
  if (ids.size.length > 1 || ids.condition.length > 1 || ids.accessory_department.length > 1)
    return null;
  return {
    ownerId,
    extraAttributes,
    item: {
      title,
      // Ein Textfeld der Maske kennt nur einfache Zeilenumbrüche; so bleiben beide Stände vergleichbar.
      description: description.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
      priceCents,
      categoryId,
      brandId,
      sizeId: ids.size[0] ?? null,
      accessoryDepartmentId: ids.accessory_department[0] ?? null,
      conditionId: ids.condition[0] ?? null,
      colorIds: colors.filter((id): id is number => typeof id === 'number'),
      materialIds: ids.material,
      packageSizeId,
      photos,
    },
  };
}

/**
 * Liest den gespeicherten Stand eines eigenen Inserats aus der Schnittstelle, die auch Vinteds
 * Bearbeitungsmaske bedient (am 12.10.2026 nur ihr Aufbau gemessen). Die Anfrage läuft in der
 * angemeldeten Seite; es wird nichts geschrieben. Alles Unerwartete – fremdes Inserat, anderer
 * Aufbau, andere Währung – ergibt `null`, damit der Aufrufer auf das Lesen der Maske ausweicht.
 */
export async function readVintedListingItem(
  page: Page,
  externalId: string,
): Promise<VintedListingItem | null> {
  return (await readVintedListingItemWithExtras(page, externalId))?.item ?? null;
}

/**
 * Prüft auf der bereits geöffneten Vinted-Hauptseite ohne neuen Tab, ob der gespeicherte
 * Artikelstand weiterhin vollständig mit Vinteds Inseratabfrage übereinstimmt.
 */
export async function isVintedListingContentUnchanged(
  page: Page,
  externalId: string,
  content: VintedListingContent,
  accountId?: string,
): Promise<boolean> {
  const current = await readVintedListingItemWithExtras(page, externalId);
  if (!current) return false;
  if (accountId !== undefined && current.ownerId !== null && current.ownerId !== accountId)
    return false;
  const { item, extraAttributes } = current;
  if (
    item.title !== content.title ||
    item.description !== content.description ||
    item.priceCents !== content.priceCents ||
    item.categoryId !== content.categoryId ||
    item.brandId !== content.brandId ||
    item.sizeId !== content.sizeId ||
    item.conditionId !== content.conditionId ||
    item.packageSizeId !== content.packageSizeId ||
    !sameNumbers(item.colorIds, content.colorIds) ||
    !sameNumbers(item.materialIds, content.materialIds)
  )
    return false;
  if (item.accessoryDepartmentId === null) {
    if (
      'accessory_department' in content.attributes ||
      'accessory_department_label' in content.attributes
    )
      return false;
  } else if (
    content.attributes['accessory_department'] !== String(item.accessoryDepartmentId) ||
    !content.attributes['accessory_department_label']
  ) {
    return false;
  }
  const storedExtraKeys = Object.keys(content.attributes).filter(
    (key) => key !== 'accessory_department' && key !== 'accessory_department_label',
  );
  const currentExtraKeys = Object.keys(extraAttributes);
  return (
    storedExtraKeys.length === currentExtraKeys.length &&
    storedExtraKeys.every((key) => extraAttributes[key] === content.attributes[key])
  );
}

const withoutQuery = (address: string): string => {
  try {
    const url = new URL(address);
    return url.origin + url.pathname;
  } catch {
    return '';
  }
};

/**
 * Ordnet jedem Foto im Raster der Maske die Kennung aus der Schnittstelle zu. Zugeordnet wird nur,
 * wenn Anzahl und Reihenfolge übereinstimmen und jede Rasteradresse zu einer Adresse desselben
 * Fotos passt; sonst `null`, und der Aufrufer bestätigt Fotos weiter über die Maske.
 */
export function mapVintedListingPhotoIds(
  gridUrls: readonly string[],
  photos: readonly VintedListingItemPhoto[],
): ReadonlyMap<string, number> | null {
  if (gridUrls.length !== photos.length || new Set(gridUrls).size !== gridUrls.length) return null;
  const ids = new Map<string, number>();
  for (const [index, url] of gridUrls.entries()) {
    const photo = photos[index]!;
    const wanted = withoutQuery(url);
    if (!wanted || !photo.urls.some((candidate) => withoutQuery(candidate) === wanted)) return null;
    ids.set(url, photo.id);
  }
  return ids;
}
