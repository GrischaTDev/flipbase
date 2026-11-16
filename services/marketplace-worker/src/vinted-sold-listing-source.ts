import type { Page } from 'playwright';
import type { VintedTransferSource } from '../../../supabase/functions/_shared/kleinanzeigen-listing-contracts.ts';
import { parseVintedTransferSource } from '../../../supabase/functions/_shared/kleinanzeigen-listing-validation.mts';
import {
  readVintedAccountIdentity,
  VintedInteractionRequiredError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';
import type { VintedListingReadStep } from './vinted-listing-read-error.ts';
import { VintedListingReadError } from './vinted-listing-read-error.ts';

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => {
  throw new VintedListingReadError('values');
};

/** Liest nur JSON und Text aus Nexts Dokument; Seitencode wird niemals ausgeführt. */
export function parseVintedSoldListingDocument(
  scripts: readonly string[],
  accountId: string,
  itemId: string,
): VintedTransferSource {
  if (scripts.reduce((size, script) => size + script.length, 0) > 16 * 1024 * 1024)
    return invalid();
  const chunks: string[] = [];
  for (const script of scripts) {
    const match = /^self\.__next_f\.push\((.*)\)\s*;?$/s.exec(script.trim());
    if (!match) continue;
    let tuple: unknown;
    try {
      tuple = JSON.parse(match[1]!);
    } catch {
      return invalid();
    }
    if (Array.isArray(tuple) && tuple[0] === 1 && typeof tuple[1] === 'string')
      chunks.push(tuple[1]);
  }
  const bytes = Buffer.from(chunks.join(''), 'utf8');
  const records = new Map<string, unknown>();
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    if (colon < 0) return invalid();
    const id = bytes.toString('utf8', offset, colon);
    if (!/^[a-f0-9]+$/i.test(id) || records.has(id)) return invalid();
    offset = colon + 1;
    if (bytes[offset] === 84) {
      const comma = bytes.indexOf(44, offset);
      const length = bytes.toString('ascii', offset + 1, comma);
      if (comma < 0 || !/^[a-f0-9]+$/i.test(length)) return invalid();
      const end = comma + 1 + Number.parseInt(length, 16);
      if (end > bytes.length) return invalid();
      records.set(id, bytes.toString('utf8', comma + 1, end));
      offset = bytes[end] === 10 ? end + 1 : end;
    } else {
      const newline = bytes.indexOf(10, offset);
      if (newline < 0) return invalid();
      const line = bytes.toString('utf8', offset, newline);
      if (
        line.length &&
        ('[{"0123456789-'.includes(line[0]!) || ['null', 'true', 'false'].includes(line))
      ) {
        try {
          records.set(id, JSON.parse(line) as unknown);
        } catch {
          return invalid();
        }
      }
      offset = newline + 1;
    }
  }
  const resolve = (input: unknown, depth = 0): unknown => {
    if (depth > 40) return invalid();
    if (typeof input !== 'string' || !/^\$[a-f0-9]+(?::|$)/i.test(input)) return input;
    const [id, ...path] = input.slice(1).split(':');
    if (!records.has(id!)) return invalid();
    let value = resolve(records.get(id!), depth + 1);
    for (const key of path) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return invalid();
      if (key === 'props' && Array.isArray(value) && value[0] === '$') value = value[3];
      else if (object(value) && Object.hasOwn(value, key)) value = value[key];
      else return invalid();
      value = resolve(value, depth + 1);
    }
    return value;
  };
  const candidates: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 80) return invalid();
    if (Array.isArray(value)) for (const child of value) visit(child, depth + 1);
    else if (object(value)) {
      if (
        String(value['id']) === itemId &&
        Number.isSafeInteger(value['catalog_id']) &&
        'plugins' in value &&
        'photos' in value
      )
        candidates.push(value);
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
  };
  for (const value of records.values()) visit(value);
  const item = candidates.find((value) => String(value['seller_id']) === accountId);
  if (!item || candidates.some((value) => String(value['seller_id']) !== accountId))
    return invalid();
  const plugins = resolve(item['plugins']);
  const photos = resolve(item['photos']);
  if (!Array.isArray(plugins) || !Array.isArray(photos) || !photos.length || photos.length > 20)
    return invalid();
  const pluginData = (name: string) => {
    const plugin = plugins
      .map((value) => resolve(value))
      .find((value) => object(value) && (value['type'] === name || value['name'] === name));
    const data = object(plugin) ? resolve(plugin['data']) : null;
    if (!object(data) || String(data['item_id']) !== itemId) return invalid();
    return data;
  };
  const description = resolve(pluginData('description')['description']);
  const attributes = pluginData('attributes')['attributes'];
  if (!Array.isArray(attributes)) return invalid();
  const hints: Record<string, string> = { category_id: String(item['catalog_id']) };
  for (const attribute of attributes) {
    if (!object(attribute) || !object(attribute['data'])) continue;
    const code = attribute['code'];
    if (
      typeof code !== 'string' ||
      !['brand', 'size', 'status', 'color', 'material'].includes(code)
    )
      continue;
    const data = attribute['data'];
    if (typeof data['value'] === 'string') hints[code] = data['value'];
    // Bei FAQ-Merkmalen bezeichnet `id` den Hilfeartikel, nicht Größe oder Zustand.
    if (attribute['type'] !== 'faq' && Number.isSafeInteger(data['id']) && Number(data['id']) > 0)
      hints[code + '_id'] = String(data['id']);
  }
  // Die letzte Kategorie kann in den Brotkrumen zusätzlich eine Markenverknüpfung tragen.
  for (const value of records.values()) {
    const findBreadcrumbs = (node: unknown, depth = 0) => {
      if (depth > 80) return invalid();
      if (Array.isArray(node)) for (const child of node) findBreadcrumbs(child, depth + 1);
      else if (object(node)) {
        if (String(node['item_id']) === itemId && Array.isArray(node['breadcrumbs'])) {
          for (const crumb of node['breadcrumbs'])
            if (
              object(crumb) &&
              typeof crumb['url'] === 'string' &&
              new RegExp('/catalog/' + hints['category_id'] + '(?:-|$|\\?)').test(crumb['url']) &&
              typeof crumb['title'] === 'string' &&
              !hints['category']
            )
              hints['category'] = crumb['title'];
        }
        for (const child of Object.values(node)) findBreadcrumbs(child, depth + 1);
      }
    };
    findBreadcrumbs(value);
  }
  const price = resolve(item['price']);
  const amount = object(price) ? price['amount'] : null;
  if (typeof amount !== 'string' || !/^\d{1,6}(?:\.\d{1,2})?$/.test(amount)) return invalid();
  const photoReferences = photos.map((photo) => {
    const value = resolve(photo);
    if (!object(value) || value['is_hidden'] === true || !Number.isSafeInteger(value['id']))
      return invalid();
    return value['full_size_url'] ?? value['url'];
  });
  const source = parseVintedTransferSource(
    {
      externalAccountId: accountId,
      externalId: itemId,
      title: item['title'],
      description,
      priceCents: Math.round(Number(amount) * 100),
      currency: object(price) ? price['currency_code'] : null,
      photoReferences,
      attributeHints: hints,
    },
    accountId,
    itemId,
  );
  if (!source || !source.description.trim() || source.currency !== 'EUR' || !hints['category'])
    return invalid();
  return source;
}

export async function readVintedSoldListingSource(
  page: Page,
  accountId: string,
  itemId: string,
  authorize: () => Promise<void>,
): Promise<VintedTransferSource> {
  if (
    !/^[1-9][0-9]{0,31}$/.test(itemId) ||
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    page.url() !== 'about:blank'
  )
    throw new VintedListingReadError('reserve');
  let step: VintedListingReadStep = 'navigate';
  const authorized = async () => {
    try {
      await authorize();
    } catch {
      throw new VintedListingReadError('authorize');
    }
  };
  try {
    await authorized();
    await page.goto('https://www.vinted.de/items/' + itemId, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    step = 'form';
    await page
      .locator('[data-testid="item-page-summary-plugin"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      await authorized();
      step = 'identity';
      const url = new URL(page.url());
      if (
        url.origin !== 'https://www.vinted.de' ||
        !new RegExp('^/items/' + itemId + '(?:-|$)').test(url.pathname) ||
        (await readVintedAccountIdentity(page))?.id !== accountId
      )
        throw new VintedListingReadError('identity');
    };
    await check();
    step = 'values';
    const scripts = await page.locator('script:not([src])').allTextContents();
    const source = parseVintedSoldListingDocument(scripts, accountId, itemId);
    await check();
    return source;
  } catch (error) {
    if (
      error instanceof VintedListingReadError ||
      error instanceof VintedInteractionRequiredError ||
      error instanceof VintedVerificationRequiredError
    )
      throw error;
    throw new VintedListingReadError(step);
  } finally {
    await page.close();
  }
}
