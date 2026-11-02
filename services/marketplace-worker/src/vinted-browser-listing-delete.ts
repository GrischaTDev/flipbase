import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';

/** Löscht genau einmal über die native Oberfläche; nur ein danach gelesener 404 bestätigt die Entfernung. */
export async function deleteVintedListing(
  page: Page,
  itemId: string,
  accountId: string,
  authorize: () => Promise<void>,
  timeoutMs = 15_000,
): Promise<{ status: 'confirmed' | 'failed' | 'outcome_unknown'; step: string }> {
  if (page.url() !== 'about:blank') throw new Error('Die Artikelseite ist nicht neu reserviert.');
  let attempted = false;
  let step = 'authorize';
  try {
    if (![itemId, accountId].every((id) => /^[1-9][0-9]{0,31}$/.test(id)))
      return { status: 'failed', step };
    await authorize();
    await page.goto('https://www.vinted.de/items/' + itemId, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    const check = async (allowProfile = false) => {
      await authorize();
      const url = new URL(page.url());
      const itemPath = '/items/' + itemId;
      if (
        url.origin !== 'https://www.vinted.de' ||
        (url.pathname !== itemPath &&
          !url.pathname.startsWith(itemPath + '-') &&
          !(allowProfile && url.pathname === '/member/' + accountId)) ||
        (await readVintedAccountIdentity(page))?.id !== accountId
      )
        throw new Error('Die Kontozuordnung hat sich geändert.');
    };
    await check();
    step = 'source';
    const source = await page.evaluate(async (itemId) => {
      const response = await fetch('/api/v2/item_upload/items/' + itemId, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok || new URL(response.url).origin !== location.origin) return false;
      const body = await response.json();
      const item = body?.item;
      return String(item?.id) === itemId && item?.is_draft === false;
    }, itemId);
    // Die echte Bearbeitungsantwort enthält keine Besitz-/Reservierungsfelder.
    // Nur das eigene aktive Inserat zeigt diese drei Verkäuferaktionen und den passenden Profillink.
    const root = page.locator('#content');
    if (!source) return { status: 'failed', step };
    await root.getByTestId('item-delete-button').waitFor({ state: 'visible', timeout: 5_000 });
    const edit = root.getByTestId('item-edit-button');
    const close = root.getByRole('link', { name: 'Als verkauft markieren', exact: true });
    const reserve = root.getByRole('link', { name: 'Als reserviert markieren', exact: true });
    if (
      (await root.locator('a[href="/member/' + accountId + '"]').count()) === 0 ||
      (await edit.count()) !== 1 ||
      !(await edit.isVisible()) ||
      (await close.count()) !== 1 ||
      !(await close.isVisible()) ||
      (await reserve.count()) !== 1 ||
      !(await reserve.isVisible())
    )
      return { status: 'failed', step };
    step = 'open';
    const open = root.getByTestId('item-delete-button');
    if ((await open.count()) !== 1 || !(await open.isVisible())) return { status: 'failed', step };
    await check();
    // Schon der erste Löschknopf kann bei verändertem Anbieteraufbau eine Wirkung haben.
    attempted = true;
    await open.click({ timeout: 5_000 });
    step = 'confirm';
    const confirm = page
      .getByTestId('item-delete-modal')
      .getByTestId('item-delete-confirmation-button');
    await confirm.waitFor({ state: 'visible', timeout: 5_000 });
    if ((await confirm.count()) !== 1 || !(await confirm.isEnabled()))
      return { status: 'outcome_unknown', step };
    await check();
    attempted = true;
    await confirm.click({ timeout: 5_000 });
    step = 'verify';
    const deadline = Date.now() + timeoutMs;
    do {
      try {
        await check(true);
        const removed = await page.evaluate(async (id) => {
          const response = await fetch('/api/v2/item_upload/items/' + id, {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8_000),
          });
          const url = new URL(response.url);
          return (
            response.status === 404 &&
            url.origin === 'https://www.vinted.de' &&
            url.pathname === '/api/v2/item_upload/items/' + id
          );
        }, itemId);
        if (removed) return { status: 'confirmed', step };
      } catch {
        // Vinted wechselt nach der Löschung ins eigene Profil. Währenddessen ist noch kein Beleg lesbar.
      }
      await wait(300);
    } while (Date.now() < deadline);
    return { status: 'outcome_unknown', step };
  } catch {
    return { status: attempted ? 'outcome_unknown' : 'failed', step };
  } finally {
    await page.close();
  }
}
