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
