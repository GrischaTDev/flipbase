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

test('a conversation removed between inbox and detail GET does not fail other messages or sales', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const status of [404, 410, 200]) {
      const page = await browser.newPage();
      let inboxReads = 0;
      await page.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/')
          return route.fulfill({ contentType: 'text/html', body: '<body>Fixture</body>' });
        if (path === '/api/v2/conversations/700')
          return route.fulfill({ status, json: { code: 100 } });
        if (path === '/api/v2/conversations/701')
          return route.fulfill({ json: { conversation: { id: 701, messages: [] } } });
        const json =
          path === '/api/v2/users/current'
            ? { user: { id: 123, login: 'fixture' } }
            : {
                items: [],
                conversations:
                  path === '/api/v2/inbox'
                    ? (++inboxReads === 1 ? [700, 701] : [701]).map((id) => ({ id, unread: false }))
                    : [],
                user_feedbacks: [],
                pagination: { total_pages: 1 },
              };
        return route.fulfill({ json });
      });
      await page.goto('https://www.vinted.de/');
      const snapshot = await readVintedAccountImport(page, async () => undefined);
      assert.equal(inboxReads, 2);
      assert.deepEqual(
        snapshot.entries
          .filter((entry) => entry.kind === 'conversation')
          .map((entry) => entry.externalId),
        ['701'],
      );
      assert.deepEqual(snapshot.areas.conversations, { status: 'complete' });
      assert.equal(snapshot.areas.messages.failure, undefined);
      assert.equal(snapshot.areas.sales.failure, undefined);
      assert.equal(snapshot.sourceReadFailures, undefined);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('distinguishes HTTP, content type, JSON and conversation shape failures without storing provider content', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [issue, status, contentType, body] of [
      ['http_status', 404, 'application/json', '{"private":"provider-content"}'],
      ['content_type', 200, 'text/html', '<p>private-provider-content</p>'],
      ['invalid_json', 200, 'application/json', 'private-invalid-json'],
      [
        'conversation_shape',
        200,
        'application/json',
        '{"conversation":{"id":700,"private":"provider-content"}}',
      ],
    ] as const) {
      const page = await browser.newPage();
      await page.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/')
          return route.fulfill({ contentType: 'text/html', body: '<body>Fixture</body>' });
        if (path === '/api/v2/conversations/700')
          return route.fulfill({ status, contentType, body });
        const json =
          path === '/api/v2/users/current'
            ? { user: { id: 123, login: 'fixture' } }
            : {
                items: [],
                conversations: path === '/api/v2/inbox' ? [{ id: 700, unread: false }] : [],
                user_feedbacks: [],
                pagination: { total_pages: 1 },
              };
        return route.fulfill({ json });
      });
      await page.goto('https://www.vinted.de/');
      const snapshot = await readVintedAccountImport(page, async () => undefined);
      assert.equal(snapshot.areas.messages.failure, 'invalid_response');
      assert.equal(snapshot.areas.sales.failure, 'invalid_response');
      assert.deepEqual(snapshot.sourceReadFailures, [
        { area: 'messages', issue, ...(issue === 'conversation_shape' ? {} : { status }) },
      ]);
      assert.equal(JSON.stringify(snapshot.sourceReadFailures).includes('private'), false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

async function fixture(page: Page, options: { refreshAfterMs: number; never?: boolean }) {
  let rejectedReads = 0,
    expired = true,
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
    if (url.pathname === '/api/v2/users/current') {
      if (expired) rejectedReads++;
      return route.fulfill(
        expired ? { status: 401, json: {} } : { json: { user: { id: 123, login: 'synthetic' } } },
      );
    }
    return route.fulfill({
      json: { items: [], conversations: [], user_feedbacks: [], pagination: { total_pages: 1 } },
    });
  });
  return {
    rejectedReads: () => rejectedReads,
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
    // Während der Erneuerung fragt der Abruf nichts ab.
    assert.equal(f.rejectedReads(), 0);
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
