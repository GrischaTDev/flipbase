import type { Page } from 'playwright';
import { flattenVintedSellingCatalogs } from '../../../supabase/functions/_shared/vinted-selling-tree.mjs';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';

/** Liest den vollständigen Verkaufsbaum in einer eigenen Seite; speichert kein Inserat. */
export async function readVintedSellingTree(
  page: Page,
  accountId: string,
  authorize: () => Promise<void>,
) {
  if (page.url() !== 'about:blank') throw new Error('Neue Kategorieseite fehlt.');
  try {
    await authorize();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().split('?')[0] === 'https://www.vinted.de/api/v2/item_upload/catalogs',
      { timeout: 15000 },
    );
    // Ablehnung bereits behandeln, falls die Navigation vor der Antwort scheitert.
    void responsePromise.catch(() => undefined);
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    const response = await responsePromise;
    await authorize();
    if (response.status() !== 200 || (await readVintedAccountIdentity(page))?.id !== accountId)
      throw new Error('Verkaufsbaum gehört nicht zum angemeldeten Konto.');
    const categories = flattenVintedSellingCatalogs(await response.json());
    await authorize();
    return categories;
  } finally {
    await page.close();
  }
}

/**
 * Liest den Verkaufsbaum direkt in der bereits geöffneten Vinted-Hauptseite ohne neuen Tab.
 * Schlägt der Direktabruf fehl, kann der Aufrufer auf eine eigene Kategorieseite ausweichen.
 */
export async function readVintedSellingTreeFromCurrentPage(
  page: Page,
  accountId: string,
  authorize: () => Promise<void>,
) {
  let origin: string;
  try {
    origin = new URL(page.url()).origin;
  } catch {
    throw new Error('Vinted-Hauptseite fehlt.');
  }
  if (origin !== 'https://www.vinted.de') throw new Error('Vinted-Hauptseite fehlt.');
  await authorize();
  if ((await readVintedAccountIdentity(page))?.id !== accountId)
    throw new Error('Verkaufsbaum gehört nicht zum angemeldeten Konto.');
  const payload: unknown = await page.evaluate(async () => {
    if (location.origin !== 'https://www.vinted.de') return null;
    const response = await fetch('/api/v2/item_upload/catalogs', {
      method: 'GET',
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || new URL(response.url).origin !== 'https://www.vinted.de') return null;
    return response.json();
  });
  await authorize();
  if (payload === null || (await readVintedAccountIdentity(page))?.id !== accountId)
    throw new Error('Verkaufsbaum gehört nicht zum angemeldeten Konto.');
  const categories = flattenVintedSellingCatalogs(payload);
  await authorize();
  return categories;
}
