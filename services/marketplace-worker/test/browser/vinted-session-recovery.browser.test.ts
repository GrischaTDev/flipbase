import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import {
  readVintedAccountImport,
  VintedImportReadError,
  VintedImportRequestError,
} from '../../src/vinted-account-import.ts';

test('an aborted session reload retains its fixed diagnosis in an actual Chromium browser', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let navigations = 0;
    let profileReads = 0;
    await page.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') {
        navigations++;
        if (navigations > 1) return route.abort('aborted');
        return route.fulfill({ contentType: 'text/html', body: '<body>Fixture</body>' });
      }
      if (path === '/api/v2/users/current') {
        profileReads++;
        return route.fulfill({ status: 401, json: {} });
      }
      return route.abort();
    });
    await page.goto('https://www.vinted.de/');
    await assert.rejects(
      readVintedAccountImport(page, async () => undefined),
      (error: unknown) =>
        error instanceof VintedImportReadError &&
        error.stage === 'profile' &&
        error.cause instanceof VintedImportRequestError &&
        error.cause.reason === 'browser_context' &&
        error.cause.browserReadFailure === 'navigation_aborted' &&
        error.cause.cause === undefined,
    );
    assert.equal(navigations, 2);
    assert.equal(profileReads, 1);
  } finally {
    await browser.close();
  }
});

for (const interruptedPath of ['/api/v2/users/current', '/api/v2/inbox']) {
  test(`a document reload during ${interruptedPath} preserves the read in the same browser`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      let interruptedReads = 0;
      await page.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/')
          return route.fulfill({ contentType: 'text/html', body: '<body>Fixture</body>' });
        if (path === interruptedPath && ++interruptedReads === 1) {
          // Die laufende Browser-Leseanfrage verliert ihren Dokumentkontext.
          await page.goto('https://www.vinted.de/').catch(() => undefined);
          return;
        }
        return route.fulfill({
          json:
            path === '/api/v2/users/current'
              ? { user: { id: 123, login: 'synthetic' } }
              : {
                  items: [],
                  conversations: [],
                  user_feedbacks: [],
                  pagination: { total_pages: 1 },
                },
        });
      });
      await page.goto('https://www.vinted.de/');
      const snapshot = await readVintedAccountImport(page, async () => undefined);
      assert.equal(snapshot.identity.id, '123');
      assert.equal(snapshot.areas.profile.status, 'complete');
      assert.equal(
        snapshot.areas.conversations.status,
        'complete',
        JSON.stringify({
          areas: snapshot.areas,
          failures: snapshot.browserReadFailures,
          interruptedReads,
        }),
      );
      assert.equal(interruptedReads, 2);
      assert.equal(snapshot.sourceRequestCount, 5);
    } finally {
      await browser.close();
    }
  });
}

test('verzögerte vorhandene Anmeldung wird ohne Zugangsdaten im selben Browser wiederhergestellt', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let navigations = 0;
    let profileReads = 0;
    await page.route('**/*', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') {
        navigations++;
        return route.fulfill({
          contentType: 'text/html',
          body: '<body><script>setTimeout(() => sessionStorage.setItem("ready", "yes"), 1200)</script></body>',
        });
      }
      if (path === '/api/v2/users/current') {
        profileReads++;
        const ready = await page.evaluate(() => sessionStorage.getItem('ready') === 'yes');
        return route.fulfill({
          status: ready ? 200 : 401,
          json: ready ? { user: { id: 123, login: 'synthetic' } } : {},
        });
      }
      return route.fulfill({
        json: { items: [], conversations: [], user_feedbacks: [], pagination: { total_pages: 1 } },
      });
    });
    await page.goto('https://www.vinted.de/', { waitUntil: 'domcontentloaded' });
    const snapshot = await readVintedAccountImport(page, async () => undefined);
    assert.equal(snapshot.identity.id, '123');
    assert.equal(navigations, 2);
    assert.equal(profileReads, 4);
  } finally {
    await browser.close();
  }
});

test('bleibende 401 wird nach genau einem Neuladen und begrenzten Prüfungen beendet', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let navigations = 0;
    let profileReads = 0;
    let otherReads = 0;
    await page.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') {
        navigations++;
        return route.fulfill({ contentType: 'text/html', body: '<body>Test</body>' });
      }
      if (path === '/api/v2/users/current') {
        profileReads++;
        return route.fulfill({ status: 401, json: {} });
      }
      otherReads++;
      return route.abort();
    });
    await page.goto('https://www.vinted.de/');
    await assert.rejects(
      readVintedAccountImport(page, async () => undefined),
      (error) =>
        error instanceof VintedImportReadError &&
        error.cause instanceof VintedImportRequestError &&
        error.cause.reason === 'unauthorized',
    );
    assert.equal(navigations, 2);
    assert.equal(profileReads, 4);
    assert.equal(otherReads, 0);
  } finally {
    await browser.close();
  }
});

test('eine sichtbare Zweitfaktorprüfung startet kein Neuladen und keinen weiteren Identitätsabruf', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let sourceReads = 0;
    let navigations = 0;
    await page.route('**/*', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/member/login/2fa') {
        navigations++;
        return route.fulfill({ contentType: 'text/html', body: '<body>Bestätigungscode</body>' });
      }
      sourceReads++;
      return route.fulfill({ status: 401, json: {} });
    });
    await page.goto('https://www.vinted.de/member/login/2fa');
    await assert.rejects(
      readVintedAccountImport(page, async () => undefined),
      VintedImportReadError,
    );
    assert.equal(navigations, 1);
    assert.equal(sourceReads, 1);
  } finally {
    await browser.close();
  }
});
