import { beforeVintedWrite } from './vinted-write-authorization.ts';
import { setTimeout as wait } from 'node:timers/promises';
import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { readVintedCsrfToken } from './vinted-browser-messages.ts';
import {
  parseVintedWriteRequestShapes,
  recordVintedWriteRequests,
  type VintedWriteRequestShape,
} from './vinted-write-request-shape.ts';

export async function readVintedListingPresence(
  page: Page,
  accountId: string,
  externalId: string,
  authorize: () => Promise<void>,
): Promise<'present' | 'absent' | 'unknown'> {
  await authorize();
  if (
    !/^[1-9][0-9]{0,31}$/.test(externalId) ||
    (await readVintedAccountIdentity(page))?.id !== accountId
  )
    return 'unknown';
  return page.evaluate(async (id) => {
    if (location.origin !== 'https://www.vinted.de') return 'unknown';
    const response = await fetch('/api/v2/item_upload/items/' + id, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const url = new URL(response.url);
    if (
      url.origin !== 'https://www.vinted.de' ||
      url.pathname !== '/api/v2/item_upload/items/' + id
    )
      return 'unknown';
    if (response.status === 404) return 'absent';
    if (response.status !== 200) return 'unknown';
    const body: unknown = await response.json();
    return body &&
      typeof body === 'object' &&
      'item' in body &&
      body.item &&
      typeof body.item === 'object' &&
      'id' in body.item &&
      String(body.item.id) === id
      ? 'present'
      : 'unknown';
  }, externalId);
}

export interface VintedListingDeleteResult {
  status: 'confirmed' | 'failed' | 'outcome_unknown';
  step: 'authorize' | 'source' | 'open' | 'confirm' | 'verify';
  /** Aufbau der Löschanfragen, die Vinteds Seite gesendet hat; ohne Werte. */
  requestShapes?: VintedWriteRequestShape[];
  /** Ob direkt über die Schnittstelle oder über die Knöpfe der Seite gelöscht wurde. */
  via?: 'direct' | 'form';
}
export function parseVintedListingDeleteResult(input: unknown): VintedListingDeleteResult {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['status', 'step', 'requestShapes', 'via'].includes(key)) ||
    !('status' in input) ||
    !('step' in input) ||
    typeof input.status !== 'string' ||
    !['confirmed', 'failed', 'outcome_unknown'].includes(input.status) ||
    typeof input.step !== 'string' ||
    !['authorize', 'source', 'open', 'confirm', 'verify'].includes(input.step) ||
    (input.status === 'confirmed' && input.step !== 'verify')
  )
    throw new Error('Ungültige Löschbestätigung');
  const result: VintedListingDeleteResult = {
    status: input.status as VintedListingDeleteResult['status'],
    step: input.step as VintedListingDeleteResult['step'],
  };
  if ('requestShapes' in input) {
    if (input.status === 'failed' && input.step !== 'verify')
      throw new Error('Ungültige Löschbestätigung');
    result.requestShapes = parseVintedWriteRequestShapes(input.requestShapes);
  }
  if ('via' in input) {
    if ((input.via !== 'direct' && input.via !== 'form') || input.status === 'failed')
      throw new Error('Ungültige Löschbestätigung');
    result.via = input.via;
  }
  return result;
}

/** Löscht genau einmal über die native Oberfläche; nur ein danach gelesener 404 bestätigt die Entfernung. */
export async function deleteVintedListing(
  page: Page,
  itemId: string,
  accountId: string,
  authorize: () => Promise<void>,
  timeoutMs = 15_000,
): Promise<VintedListingDeleteResult> {
  if (page.url() !== 'about:blank') throw new Error('Die Artikelseite ist nicht neu reserviert.');
  let attempted = false;
  let step: VintedListingDeleteResult['step'] = 'authorize';
  let recorder: Awaited<ReturnType<typeof recordVintedWriteRequests>> | null = null;
  let via: VintedListingDeleteResult['via'];
  const measured = (result: VintedListingDeleteResult): VintedListingDeleteResult => {
    const requestShapes = recorder?.shapes() ?? [];
    return {
      ...result,
      ...(requestShapes.length ? { requestShapes } : {}),
      ...(via && result.status !== 'failed' ? { via } : {}),
    };
  };
  try {
    if (![itemId, accountId].every((id) => /^[1-9][0-9]{0,31}$/.test(id)))
      return { status: 'failed', step };
    await authorize();
    await page.goto('https://www.vinted.de/items/' + itemId, {
      // Das sichtbare SSR-Markup reagiert vor dem vollständigen Laden noch nicht auf Löschen.
      waitUntil: 'load',
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
    // Die Messung bleibt aktiv, damit eine spätere Änderung an Vinteds Aufruf sichtbar wird.
    recorder = await recordVintedWriteRequests(page).catch(() => null);
    const token = await readVintedCsrfToken(page).catch(() => null);
    let direct: 'deleted' | 'rejected' | 'unclear' | null = null;
    if (token) {
      // Derselbe Aufruf wie Vinteds eigener Löschdialog (am 23.11.2026 gemessen:
      // POST /api/v2/items/<id>/delete ohne Inhalt, Antwort 200).
      await beforeVintedWrite(authorize);
      attempted = true;
      via = 'direct';
      const status = await page
        .evaluate(
          async ({ id, csrf }) => {
            try {
              const response = await fetch('/api/v2/items/' + id + '/delete', {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
                signal: AbortSignal.timeout(15_000),
              });
              const url = new URL(response.url);
              return url.origin === 'https://www.vinted.de' &&
                url.pathname === '/api/v2/items/' + id + '/delete'
                ? response.status
                : 0;
            } catch {
              return 0;
            }
          },
          { id: itemId, csrf: token },
        )
        .catch(() => 0);
      direct =
        status >= 200 && status < 300
          ? 'deleted'
          : status >= 400 && status < 500
            ? 'rejected'
            : 'unclear';
    }
    // Nur eine eindeutige Ablehnung erlaubt den Weg über die Knöpfe: Dann wurde nichts gelöscht.
    // Bei unklarem Ausgang entscheidet allein das Nachlesen, ohne zweiten Löschversuch.
    if (direct === null || direct === 'rejected') {
      via = 'form';
      await check();
      // Schon der erste Löschknopf kann bei verändertem Anbieteraufbau eine Wirkung haben.
      await beforeVintedWrite(authorize);
      attempted = true;
      await open.click({ timeout: 5_000 });
      step = 'confirm';
      const confirm = page
        .getByTestId('item-delete-modal')
        .getByTestId('item-delete-confirmation-button');
      await confirm.waitFor({ state: 'visible', timeout: 5_000 });
      if ((await confirm.count()) !== 1 || !(await confirm.isEnabled()))
        return measured({ status: 'outcome_unknown', step });
      await check();
      await beforeVintedWrite(authorize);
      await confirm.click({ timeout: 5_000 });
    }
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
        if (removed) return measured({ status: 'confirmed', step });
      } catch {
        // Vinted wechselt nach der Löschung ins eigene Profil. Währenddessen ist noch kein Beleg lesbar.
      }
      await wait(300);
    } while (Date.now() < deadline);
    return measured({ status: 'outcome_unknown', step });
  } catch {
    return attempted ? measured({ status: 'outcome_unknown', step }) : { status: 'failed', step };
  } finally {
    await recorder?.close();
    await page.close();
  }
}
