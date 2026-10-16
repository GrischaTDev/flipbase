import { createKleinanzeigenBrowserFixture } from './support/kleinanzeigen-browser-fixture.mjs';

// Echter MV3-Neustart in einem ausschließlich synthetischen, isolierten Browserprofil.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
const directory = await mkdtemp(join(tmpdir(), 'flipbase-ka-mv3-'));
const extension = resolve('tools/flipbase-extension');
const workspaceId = '51000000-0000-4000-8000-000000000011';
const draftId = '51000000-0000-4000-8000-000000000041';
const imageId = '51000000-0000-4000-8000-000000000071';
const account = {
  user: { userId: 88, accountType: 'PRIVATE' },
  userProfile: { userId: 88, commercialUser: false, contactName: 'Privat' },
};
const astro =
  '<script id="astroSharedData" type="application/json">' + JSON.stringify(account) + '</script>';
const target = 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2';
const calls = [];
let context;
let serverState = 'writing';
let phase = 'worker';
const binding = {
  workspaceId,
  connectionId: '9',
  externalAccountId: '88',
  displayName: 'Privat',
  accountType: 'private',
  status: 'connected',
  generation: 2,
  canPublish: true,
  expiresAt: new Date(Date.now() + 600000).toISOString(),
};
const installation = {
  phase: 'connected',
  appOrigin: 'https://app.flipbase.de',
  apiUrl: 'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
  secret: 'a'.repeat(64),
  binding,
};
function job() {
  const at = new Date().toISOString();
  return {
    id: '12',
    workspaceId,
    connectionId: '9',
    draftId,
    draftRevision: 4,
    grantGeneration: 2,
    requestedBy: '51000000-0000-4000-8000-000000000001',
    immutableSnapshot: {
      workspaceId,
      connectionId: '9',
      draftId,
      draftRevision: 4,
      grantGeneration: 2,
      externalAccountId: '88',
      content: {
        title: 'Jacke',
        description: 'Ganz',
        priceCents: 1200,
        currency: 'EUR',
        priceType: 'FIXED',
        postalCode: '10115',
        shippingType: 'pickup',
        shippingPriceCents: null,
        categoryId: '153/160/shirts',
        categoryFields: { 'kleidung_herren.condition': 'ok' },
        schemaRevision: 'c'.repeat(64),
      },
      images: [
        {
          imageId,
          storagePath:
            'kleinanzeigen-jobs/' +
            workspaceId +
            '/51000000-0000-4000-8000-000000000061/51000000-0000-4000-8000-000000000062/' +
            imageId +
            '.jpg',
          fileName: 'Bild.jpg',
          mimeType: 'image/jpeg',
          byteSize: 4,
          sha256: 'b'.repeat(64),
        },
      ],
    },
    state: serverState,
    version: 3,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    errorCode: null,
    createdAt: at,
    updatedAt: at,
  };
}
const fixture = await createKleinanzeigenBrowserFixture(directory, async (route) => {
  const url = new URL(route.request().url());
  calls.push({ phase, url: url.href, method: route.request().method() });
  if (url.origin === 'https://app.flipbase.de')
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Isolierter MV3-Test</title></head><body>Nur synthetische Testdaten</body></html>',
    });
  if (
    url.origin === 'https://api.flipbase.de' &&
    url.pathname === '/functions/v1/kleinanzeigen-local-extension'
  ) {
    const body = route.request().postDataJSON();
    calls.at(-1).action = body.action;
    if (body.action === 'job_claim')
      return route.fulfill({
        json: {
          ...job(),
          claimToken: 'b'.repeat(64),
          leaseUntil: null,
          absoluteExpiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      });
    if (body.action === 'job_finish') {
      assert.equal(body.result.outcome, 'confirmed');
      assert.equal(body.result.externalId, '999');
      serverState = 'confirmed';
      return route.fulfill({
        json: {
          ...job(),
          externalId: '999',
          providerState: 'active',
          verifiedAt: body.result.verifiedAt,
        },
      });
    }
    throw Error('Unerwartete Schreibaktion im Wiederaufnahmetest: ' + body.action);
  }
  if (url.origin === 'https://www.kleinanzeigen.de' && url.pathname === '/m-einstellungen.html')
    return route.fulfill({
      contentType: 'text/html',
      body: astro + '<main>Du hast in den letzten 30 Tagen 99 Anzeigen aufgegeben.</main>',
    });
  if (url.origin === 'https://www.kleinanzeigen.de' && url.pathname === '/m-meine-anzeigen.html')
    return route.fulfill({
      contentType: 'text/html',
      body:
        astro +
        '<main>Mein Profil und meine Anzeigen<div id="my-manageitems-adlist"><article data-testid="ad-card" data-adid="999"><h3><a href="' +
        target +
        '">Jacke</a></h3><button>Reservieren</button></article></div><nav aria-label="Seiten-Navigation"><span aria-current="page">Seite 1</span><button disabled>Nächste</button></nav></main>',
    });
  if (
    url.pathname === '/favicon.ico' ||
    !['app.flipbase.de', 'api.flipbase.de', 'www.kleinanzeigen.de'].includes(url.hostname)
  )
    return route.fulfill({ status: 204, body: '' });
  await route.abort();
  throw Error('Unerwarteter Netzwerkzugriff im isolierten Test: ' + url.origin + url.pathname);
});
async function launch() {
  const ctx = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    proxy: { server: fixture.url },
    ignoreHTTPSErrors: true,
    args: [
      '--ignore-certificate-errors',
      '--disable-extensions-except=' + extension,
      '--load-extension=' + extension,
    ],
  });
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  return { ctx, worker };
}
async function checkpoint(worker) {
  const value = {
    workspaceId,
    connectionId: '9',
    generation: 2,
    jobId: '12',
    appOrigin: installation.appOrigin,
    claimToken: 'b'.repeat(64),
    attemptId: '51000000-0000-4000-8000-000000000081',
    phase: 'writing',
    installation,
    baseline: ['77'],
    minimumDocumentTime: Date.now() - 1000,
    receipt: {
      url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt3.html',
      candidates: [target],
    },
  };
  await worker.evaluate(
    async ({ installation, value, key }) => {
      await chrome.storage.local.set({
        kleinanzeigen_local_installation: installation,
        kleinanzeigen_publication_attempts: { [key]: value },
      });
    },
    { installation, value, key: workspaceId + ':9:12' },
  );
}
async function resume(ctx) {
  const page = await ctx.newPage();
  await page.goto('https://app.flipbase.de/marketplaces/overview');
  const response = await page.evaluate(
    async ({ workspaceId }) =>
      await new Promise((resolve, reject) => {
        const requestId = 'mv3-reconcile-' + crypto.randomUUID();
        const timer = setTimeout(
          () => reject(Error('Keine Antwort des echten Extensionhintergrunds')),
          30000,
        );
        window.addEventListener('message', function receive(event) {
          if (
            event.source !== window ||
            event.data?.type !== 'FLIPBASE_KLEINANZEIGEN_RESULT' ||
            event.data.requestId !== requestId
          )
            return;
          clearTimeout(timer);
          window.removeEventListener('message', receive);
          resolve(event.data);
        });
        window.postMessage(
          {
            type: 'FLIPBASE_KLEINANZEIGEN_PUBLISH_JOB',
            requestId,
            workspaceId,
            connectionId: '9',
            generation: 2,
            jobId: '12',
            mode: 'reconcile',
          },
          location.origin,
        );
      }),
    { workspaceId },
  );
  assert.equal(response.success, true, JSON.stringify(response));
  assert.equal(response.result.handled, true);
  assert.equal(serverState, 'confirmed', JSON.stringify({ calls, errors: fixture.errors }));
  assert.equal(
    calls.some((call) => call.action === 'job_begin' || call.url.includes('/p-anzeige-aufgeben')),
    false,
  );
  return page;
}
try {
  let started = await launch();
  context = started.ctx;
  await checkpoint(started.worker);
  const page = await context.newPage();
  await page.goto('https://app.flipbase.de/marketplaces/overview');
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await resume(context);
  console.log('Echter MV3-Worker-Neustart: nur Ergebnisabgleich, kein Formularaufruf oder Submit.');
  serverState = 'outcome_unknown';
  await checkpoint(started.worker);
  await context.close();
  context = null;
  phase = 'browser';
  started = await launch();
  context = started.ctx;
  await resume(context);
  console.log(
    'Echter Browserneustart mit demselben Profil: gleicher Versuch, Ziel 999 bestätigt, kein zweiter Submit.',
  );
  assert.deepEqual(fixture.errors, []);
  console.log(
    'Playwright Chromium ' +
      context.browser()?.version() +
      ', ' +
      calls.length +
      ' ausschließlich abgefangene Testanfragen.',
  );
} finally {
  await context?.close();
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
}
