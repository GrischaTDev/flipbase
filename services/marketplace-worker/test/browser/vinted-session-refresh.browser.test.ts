import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type Page } from 'playwright';
import {
  readVintedAccountImport,
  VintedImportReadError,
  VintedImportRequestError,
} from '../../src/vinted-account-import.ts';
import { waitForOpenVintedSessionRenewals } from '../../src/vinted-session-renewal.ts';

/**
 * Bildet Vinteds eigene Erneuerung nach: Mit abgelaufener Anmeldung steht der Browser auf
 * /session-refresh. Die Seite erneuert die Anmeldung erst nach einer Weile und leitet zurück.
 * Wird sie vorher verlassen, ist die gespeicherte Erneuerung verbraucht und die Anmeldung verloren.
 * Der Test öffnet die Seite direkt, weil abgefangene Weiterleitungen sonst das echte Netz erreichen.
 */
const renewalUrl = 'https://www.vinted.de/session-refresh?ref_url=%2F';
async function fixture(page: Page, options: { refreshAfterMs: number; never?: boolean }) {
  let expired = true,
    refreshStarted = false,
    interrupted = false,
    refreshes = 0,
    homeNavigations = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      homeNavigations++;
      if (refreshStarted && expired) interrupted = true;
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<body>Start</body>' });
    }
    if (url.pathname === '/session-refresh') {
      refreshStarted = true;
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<div role="progressbar">Anmeldung wird erneuert</div><script>
          ${options.never ? '' : `setTimeout(async () => { await fetch('/fixture/refresh', { method: 'POST' }); location.href = '/'; }, ${options.refreshAfterMs});`}
        </script>`,
      });
    }
    if (url.pathname === '/fixture/refresh') {
      refreshes++;
      // Eine unterbrochene Erneuerung lässt sich nicht wiederholen.
      if (!interrupted) expired = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/v2/users/current')
      return route.fulfill(
        expired ? { status: 401, json: {} } : { json: { user: { id: 123, login: 'synthetic' } } },
      );
    return route.fulfill({
      json: { items: [], conversations: [], user_feedbacks: [], pagination: { total_pages: 1 } },
    });
  });
  return {
    interrupted: () => interrupted,
    refreshes: () => refreshes,
    homeNavigations: () => homeNavigations,
  };
}

test('waits for the provider session renewal instead of reloading into it', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page, { refreshAfterMs: 4000 });
    await page.goto(renewalUrl, { waitUntil: 'domcontentloaded' });
    const snapshot = await readVintedAccountImport(page, async () => undefined);
    assert.equal(snapshot.identity.id, '123');
    assert.equal(f.interrupted(), false);
    assert.equal(f.refreshes(), 1);
    // Nur Vinteds eigene Rückleitung; der Abruf lädt nicht dazwischen neu.
    assert.equal(f.homeNavigations(), 1);
  } finally {
    await browser.close();
  }
});

test('reports a rejected login only after the renewal page stayed unfinished', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const f = await fixture(page, { refreshAfterMs: 0, never: true });
    await page.goto(renewalUrl, { waitUntil: 'domcontentloaded' });
    const startedAt = Date.now();
    await assert.rejects(
      readVintedAccountImport(page, async () => undefined, undefined, [], undefined, {
        sessionRenewalWaitMs: 3000,
      }),
      (error) =>
        error instanceof VintedImportReadError &&
        error.cause instanceof VintedImportRequestError &&
        error.cause.reason === 'unauthorized',
    );
    assert.ok(Date.now() - startedAt >= 2500);
    assert.equal(f.interrupted(), false);
    assert.equal(f.homeNavigations(), 0);
  } finally {
    await browser.close();
  }
});

test('an action on a second page starts only after the renewal on the first page ended', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const f = await fixture(page, { refreshAfterMs: 1500 });
    await page.goto(renewalUrl, { waitUntil: 'domcontentloaded' });
    const startedAt = Date.now();
    await waitForOpenVintedSessionRenewals(() => context.pages());
    assert.ok(Date.now() - startedAt >= 1000);
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(f.interrupted(), false);
    assert.equal(f.refreshes(), 1);
  } finally {
    await browser.close();
  }
});
