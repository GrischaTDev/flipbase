import {
  parseVintedPublicationDate,
  type PublicationInterval,
} from '../domain/publication-window.js';
import {
  comparisonEuroPrice,
  comparisonRecord,
  comparisonText,
} from './comparison-catalog-page.js';
import { VintedParserError } from './errors.js';
import { assertPageSize, parseBoundedPageJson } from './response-body.js';

export type VintedComparisonStatus = 'active' | 'sold' | 'unavailable' | 'unknown';

export interface VintedComparisonItem {
  externalId: string;
  title: string | null;
  price: number | null;
  currency: 'EUR' | null;
  brand: string | null;
  categoryId: string | null;
  categoryPath: string[];
  size: string | null;
  condition: string | null;
  color: string | null;
  material: string | null;
  model: string | null;
  status: VintedComparisonStatus;
  publication: PublicationInterval;
}

/** Reine Daten lesen; fremde Seitenscripts werden niemals ausgeführt. */
function visitItemRecords(html: string, visitor: (entry: Record<string, unknown>) => void): void {
  assertPageSize(html);
  const parts: string[] = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const push = script[1]!.trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!push) continue;
    try {
      const chunk = parseBoundedPageJson(push[1]!);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === 'string')
        parts.push(chunk[1]);
    } catch (error) {
      if (error instanceof VintedParserError) throw error;
    }
  }
  const stream = parts.join('');
  assertPageSize(stream);
  const visit = (value: unknown, depth: number): void => {
    if (depth > 60 || value === null || typeof value !== 'object') return;
    const entry = comparisonRecord(value);
    if (entry) visitor(entry);
    for (const child of Object.values(value)) visit(child, depth + 1);
  };
  for (const line of stream.split('\n')) {
    const payload = /^[0-9a-f]+:/i.test(line) ? line.slice(line.indexOf(':') + 1) : line;
    if (!payload.startsWith('[') && !payload.startsWith('{')) continue;
    try {
      visit(parseBoundedPageJson(payload), 0);
    } catch (error) {
      if (error instanceof VintedParserError) throw error;
    }
  }
}

function one<T>(values: Set<T>): T | null {
  return values.size === 1 ? [...values][0]! : null;
}

function attributeValue(value: unknown): string | null {
  const values = Array.isArray(value) ? value : [value];
  if (
    !values.length ||
    values.length > 20 ||
    !values.every(
      (item) => typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)),
    )
  )
    return null;
  return comparisonText(values.map(String).join(', '), 500);
}

/** Nur Datensätze der angefragten Kennung dürfen Preis, Alter oder Verkaufsstatus belegen. */
export function parseVintedComparisonItemPage(
  html: string,
  itemId: string,
  observedAt: Date,
): VintedComparisonItem {
  if (!/^[1-9]\d{0,19}$/.test(itemId) || !Number.isFinite(observedAt.getTime()))
    throw new VintedParserError('Ungültige Artikelprüfung.');
  const titles = new Set<string>();
  const prices = new Set<number>();
  const categoryIds = new Set<string>();
  const categoryPaths = new Map<string, string[]>();
  const attributes = new Map<string, Set<string>>();
  const flags = new Map<string, Set<boolean>>();
  let matched = false;
  let soldBanner = false;
  const addAttribute = (code: string, value: unknown): void => {
    const text = attributeValue(value);
    if (!text) return;
    const values = attributes.get(code) ?? new Set<string>();
    values.add(text);
    attributes.set(code, values);
  };
  visitItemRecords(html, (entry) => {
    if (String(entry['item_id'] ?? entry['itemId'] ?? entry['id']) !== itemId) return;
    matched = true;
    for (const key of [
      'can_buy',
      'instant_buy',
      'is_hidden',
      'is_reserved',
      'is_closed',
      'is_sold',
    ]) {
      if (typeof entry[key] !== 'boolean') continue;
      const values = flags.get(key) ?? new Set<boolean>();
      values.add(entry[key]);
      flags.set(key, values);
    }
    // Auch Abschnittsüberschriften tragen die Artikel-ID, sind aber kein Produkttitel.
    if (Array.isArray(entry['photos']) && Object.hasOwn(entry, 'price')) {
      const title = comparisonText(entry['title'], 500);
      if (title) titles.add(title);
      const price = comparisonEuroPrice(entry['price']);
      if (price !== null) prices.add(price);
    }
    if (
      comparisonText(entry['theme'])?.toUpperCase() === 'SUCCESS' &&
      /^(?:verkauft|sold)$/i.test(comparisonText(entry['title']) ?? '')
    )
      soldBanner = true;
    const categoryId = String(entry['catalog_id']);
    if (/^[1-9]\d{0,19}$/.test(categoryId)) categoryIds.add(categoryId);
    if (Array.isArray(entry['breadcrumbs'])) {
      const path = entry['breadcrumbs'].slice(0, 20).flatMap((value) => {
        const crumb = comparisonRecord(value);
        const title = comparisonText(crumb?.['title']);
        return title &&
          typeof crumb?.['url'] === 'string' &&
          /^\/catalog\/\d+(?:-[^/?#]+)?$/.test(crumb['url'])
          ? [title]
          : [];
      });
      if (path.length) categoryPaths.set(JSON.stringify(path), path);
    }
    if (Array.isArray(entry['attributes'])) {
      for (const raw of entry['attributes'].slice(0, 64)) {
        const attribute = comparisonRecord(raw);
        const data = comparisonRecord(attribute?.['data']);
        const code = comparisonText(attribute?.['code'], 100);
        if (
          code &&
          [
            'brand',
            'size',
            'status',
            'condition',
            'color',
            'colour',
            'colors',
            'material',
            'composition',
            'model',
            'model_name',
            'upload_date',
          ].includes(code)
        )
          addAttribute(code, data?.['value']);
      }
    }
  });
  if (!matched) throw new VintedParserError('Die Vinted-Seite enthält keinen passenden Artikel.');
  const flag = (key: string): boolean | null => one(flags.get(key) ?? new Set<boolean>());
  const contradictory = [...flags.values()].some((values) => values.size > 1);
  const buyable = flag('can_buy');
  const closed = flag('is_closed');
  const reserved = flag('is_reserved');
  const hidden = flag('is_hidden');
  const explicitlySold = soldBanner || flag('is_sold') === true;
  let status: VintedComparisonStatus = 'unknown';
  if (
    !contradictory &&
    !(explicitlySold && (buyable === true || flag('instant_buy') === true)) &&
    !(soldBanner && flag('is_sold') === false)
  ) {
    if (explicitlySold) status = 'sold';
    else if (buyable === true && hidden !== true && reserved !== true && closed !== true)
      status = 'active';
    // Reservierung oder Verstecken kann später in einen Verkauf übergehen.
    // Deshalb weiterhin prüfen; nur ein tatsächliches Fehlen beendet die Beobachtung.
    // Allein fehlende Kaufbarkeit kann Prüfung, Sitzung oder andere Ursachen haben.
  }
  const attribute = (...codes: string[]): string | null => {
    const values = new Set(codes.flatMap((code) => [...(attributes.get(code) ?? [])]));
    return one(values);
  };
  const price = one(prices);
  return {
    externalId: itemId,
    title: one(titles),
    price,
    currency: price === null ? null : 'EUR',
    brand: attribute('brand'),
    categoryId: one(categoryIds),
    categoryPath: categoryPaths.size === 1 ? [...categoryPaths.values()][0]! : [],
    size: attribute('size'),
    condition: attribute('status', 'condition'),
    color: attribute('color', 'colour', 'colors'),
    material: attribute('material', 'composition'),
    model: attribute('model', 'model_name'),
    status,
    publication: parseVintedPublicationDate(attribute('upload_date'), observedAt),
  };
}
