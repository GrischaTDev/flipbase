import type { Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { readVintedCsrfToken } from './vinted-browser-messages.ts';
import {
  parseVintedListingCatalogTree,
  parseVintedListingCategoryAttributes,
  parseVintedListingColors,
  parseVintedListingPackageField,
  type VintedListingCatalogCategoryFields,
  type VintedListingCatalogRead,
} from './vinted-listing-catalog.ts';

export interface VintedListingCatalogReadOptions {
  /** Endkategorien, deren Felder gelesen werden sollen. */
  readonly categoryIds: readonly number[];
  /** Verkaufsbaum und Farben mitlesen. */
  readonly includeTree: boolean;
  /** Pause zwischen zwei Abrufen; schont Vinted und das Konto. */
  readonly delayMs?: number;
  /** Höchstdauer; danach wird mit dem bis dahin Gelesenen beendet. */
  readonly budgetMs?: number;
}

class CatalogRequestStopped extends Error {}

/** Versandschätzung von Vinted; das Formular fragt Paketgrößen dort ab. */
const shippingEstimation = 'https://api.vinted.de/shipping-estimation/external/';

/**
 * Liest Teile des Vinted-Katalogs in einer eigenen, leeren Verkaufsseite. Speichert und
 * veröffentlicht nichts. Lehnt Vinted Abrufe ab (429/403), endet der Lauf mit dem bis dahin
 * Gelesenen; der nächste Abgleich setzt fort.
 */
export async function readVintedListingCatalog(
  page: Page,
  accountId: string,
  options: VintedListingCatalogReadOptions,
  authorize: () => Promise<void>,
): Promise<VintedListingCatalogRead> {
  if (page.url() !== 'about:blank') throw new Error('Neue Katalogseite fehlt.');
  const delayMs = options.delayMs ?? 400;
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  try {
    await authorize();
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId)
      throw new Error('Katalogseite gehört nicht zum angemeldeten Konto.');
    const token = await readVintedCsrfToken(page);
    if (!token || /[\r\n]/.test(token)) throw new Error('Sitzungskennung des Formulars fehlt.');
    const request = async (path: string, body?: unknown): Promise<unknown> => {
      await authorize();
      const response = await page.evaluate(
        async ({ path, body, token }) => {
          if (location.origin !== 'https://www.vinted.de') return { status: 401, payload: null };
          // Nur eigene Pfade oder die Versandschätzung; sie liefert deutsche Texte nur mit Locale.
          const shipping = path.startsWith('https://api.vinted.de/shipping-estimation/external/');
          if (!shipping && !path.startsWith('/api/v2/')) return { status: 400, payload: null };
          const result = await fetch(path, {
            method: body === undefined ? 'GET' : 'POST',
            credentials: 'include',
            redirect: 'error',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              'X-CSRF-Token': token,
              ...(shipping ? { Locale: 'de-DE' } : {}),
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(12000),
          });
          const json = result.headers.get('content-type')?.includes('application/json') ?? false;
          return { status: result.status, payload: json ? await result.json() : null };
        },
        { path, body, token },
      );
      if (response.status === 429 || response.status === 403) throw new CatalogRequestStopped();
      if (response.status !== 200 || response.payload === null)
        throw new Error('Vinted-Katalogabruf fehlgeschlagen.');
      return response.payload;
    };

    const observedAt = new Date().toISOString();
    const tree = options.includeTree
      ? parseVintedListingCatalogTree(await request('/api/v2/item_upload/catalogs'))
      : undefined;
    const colors = options.includeTree
      ? parseVintedListingColors(await request('/api/v2/item_upload/colors'))
      : undefined;
    const categories: VintedListingCatalogCategoryFields[] = [];
    // Der Vorschlag verlangt eine Formularsitzung; eine zufällige Kennung genügt.
    const uploadSessionId = randomUUID();
    const packageField = async (categoryId: number, position: number) => {
      try {
        const sizes = await request(`${shippingEstimation}catalogs/${categoryId}/package_sizes`);
        await wait(delayMs);
        const suggestion = await request(`${shippingEstimation}package_sizes/suggestion`, {
          catalog_id: categoryId,
          upload_session_id: uploadSessionId,
          brand_id: null,
          title: '',
          description: '',
          price: null,
          color_ids: [],
          item_attributes: [],
        });
        return parseVintedListingPackageField(sizes, suggestion, position);
      } catch (error) {
        if (error instanceof CatalogRequestStopped) throw error;
        // Ohne Paketgrößen bleiben die übrigen Felder gültig; die Masken nutzen dann 1–3.
        process.stderr.write(`Paketgrößen der Vinted-Kategorie ${categoryId} fehlen!\n`);
        return null;
      }
    };
    for (const categoryId of options.categoryIds) {
      if (Date.now() >= deadline) break;
      await wait(delayMs);
      try {
        const fields = parseVintedListingCategoryAttributes(
          await request('/api/v2/item_upload/attributes', {
            attributes: [{ code: 'category', value: [categoryId] }],
          }),
        );
        if (fields.some((field) => field.code === 'package')) {
          categories.push({ categoryId, fields });
          continue;
        }
        await wait(delayMs);
        const parcel = await packageField(categoryId, fields.length);
        categories.push({ categoryId, fields: parcel ? [...fields, parcel] : fields });
      } catch (error) {
        if (error instanceof CatalogRequestStopped) break;
        // Eine einzelne fehlerhafte Kategorie verhindert nicht den Rest des Laufs.
        process.stderr.write(`Vinted-Kategorie ${categoryId} konnte nicht gelesen werden!\n`);
      }
    }
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId)
      throw new Error('Katalogseite gehört nicht mehr zum angemeldeten Konto.');
    return {
      observedAt,
      ...(tree ? { tree } : {}),
      ...(colors ? { colors } : {}),
      categories,
    };
  } finally {
    await page.close();
  }
}
