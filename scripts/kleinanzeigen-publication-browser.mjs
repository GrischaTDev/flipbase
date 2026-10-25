// Reale Erweiterung, echter Browser, synthetischer Anbieter und vollständig lokaler Testproxy.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { createKleinanzeigenBrowserFixture } from './support/kleinanzeigen-browser-fixture.mjs';
import {
  createKleinanzeigenPublicationFixture,
  publicationWorkspaceId,
} from './support/kleinanzeigen-publication-fixture.mjs';
const directory = await mkdtemp(join(tmpdir(), 'flipbase-ka-publish-mv3-'));
const provider = createKleinanzeigenPublicationFixture();
const fixture = await createKleinanzeigenBrowserFixture(directory, provider.route);
let context;
try {
  const extension = resolve('tools/flipbase-extension');
  context = await chromium.launchPersistentContext(join(directory, 'profile'), {
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
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  for (const sample of [
    {
      name: 'Abweichende native Art beim Formularöffnen',
      used: 99,
      initialWrongCategory: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 0,
    },
    {
      name: 'Geänderte native Art nach der Bildübertragung',
      used: 99,
      categoryAfterUpload: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 1,
    },
    {
      name: 'Unbekannter Gebührenzustand',
      used: 99,
      unknownFee: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 1,
    },
    {
      name: 'Veränderte private Bilddatei',
      used: 99,
      corruptImage: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 0,
    },
    { name: '99 kostenlos', used: 99, state: 'confirmed', submits: 1, begins: 1, uploads: 1 },
    {
      name: '100 erschöpft',
      used: 100,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 0,
    },
    {
      name: '101 erschöpft',
      used: 101,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 0,
    },
    {
      name: 'Gebühren trotz Restkontingent',
      used: 99,
      paid: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 1,
    },
    {
      name: 'Externes Inserat vor dem letzten Guard',
      used: 99,
      externalAfterUpload: true,
      state: 'needs_user_action',
      submits: 0,
      begins: 0,
      uploads: 1,
    },
  ]) {
    for (const page of context.pages()) await page.close();
    provider.reset(sample);
    await provider.prepare(worker);
    const page = await context.newPage();
    await page.goto('https://app.flipbase.de/marketplaces/overview');
    const answer = await page.evaluate(
      async (workspaceId) =>
        await new Promise((resolve, reject) => {
          const requestId = 'publish-' + crypto.randomUUID();
          const timer = setTimeout(
            () => reject(Error('Extension-Testauftrag wurde nicht beendet.')),
            120000,
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
              mode: 'publish',
            },
            location.origin,
          );
        }),
      publicationWorkspaceId,
    );
    assert.equal(answer.success, true, JSON.stringify(answer));
    assert.equal(answer.result.handled, true);
    assert.deepEqual(fixture.errors, []);
    assert.equal(
      provider.state,
      sample.state,
      JSON.stringify({ sample: sample.name, finishes: provider.finishes, calls: provider.calls }),
    );
    assert.equal(provider.submits, sample.submits);
    assert.equal(provider.begins, sample.begins);
    assert.equal(provider.uploads, sample.uploads);
    if (sample.submits) {
      assert.equal(provider.finishes.at(-1)?.externalId, '1001');
      assert.equal(provider.finishes.at(-1)?.providerState, 'active');
    }
    const pending = await worker.evaluate(
      async () =>
        (await chrome.storage.local.get('pending_kleinanzeigen_listing'))
          .pending_kleinanzeigen_listing,
    );
    assert.equal(pending.title, 'Darf nicht übernommen werden');
    console.log(
      sample.name +
        ': ' +
        provider.submits +
        ' Submit, ' +
        provider.begins +
        ' Beginn, ' +
        provider.uploads +
        ' geprüftes Bild, Status ' +
        provider.state +
        '.',
    );
  }
  // Auch der manuelle Weg läuft durch den echten MV3-Hintergrund und die echten Content Scripts.
  for (const page of context.pages()) await page.close();
  provider.reset({ used: 8 });
  await provider.prepare(worker);
  const app = await context.newPage();
  await app.goto('https://app.flipbase.de/marketplaces/overview');
  const handoffId = crypto.randomUUID();
  const payload = {
    itemId: 'manual-draft',
    title: 'Manuelle Jacke',
    description: 'Originaltext',
    price: 12,
    priceType: 'NEGOTIABLE',
    shippingType: 'both',
    categoryPath: null,
    images: [],
  };
  const sendHandoff = async (currentPayload = payload) =>
    await app.evaluate(
      async ({ workspaceId, handoffId, payload }) => {
        const requestId = 'handoff-' + crypto.randomUUID();
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Formularübergabe ohne Antwort')), 120000);
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
              type: 'FLIPBASE_KLEINANZEIGEN_OPEN_LISTING',
              requestId,
              workspaceId,
              connectionId: '9',
              generation: 2,
              handoffId,
              payload,
            },
            location.origin,
          );
        });
      },
      { workspaceId: publicationWorkspaceId, handoffId, payload: currentPayload },
    );
  const opened = await sendHandoff();
  assert.equal(opened.success, true, JSON.stringify(opened));
  const assisted = context.pages().find((page) => page.url().includes('#flipbase-assisted'));
  await assisted.locator('#ad-title').waitFor();
  await assisted.waitForFunction(
    () => document.getElementById('ad-title')?.value === 'Manuelle Jacke',
  );
  assert.equal(await assisted.locator('#ad-description').inputValue(), 'Originaltext');
  await assisted.waitForFunction(() =>
    document
      .querySelector('#flipbase-hud .flipbase-hud-footer')
      ?.textContent.includes('Bitte Kategorie'),
  );
  await assisted.reload();
  await assisted.waitForFunction(
    () => document.getElementById('ad-title')?.value === 'Manuelle Jacke',
    null,
    { timeout: 3000 },
  );
  assert.equal(await assisted.locator('#flipbase-hud').count(), 1);
  await assisted.waitForFunction(() =>
    document
      .querySelector('#flipbase-hud .flipbase-hud-footer')
      ?.textContent.includes('Anzeige aufgeben'),
  );
  await assisted.locator('#ad-title').fill('Vor Kategorienwahl geändert');
  await assisted.getByRole('link', { name: 'Kategorie ändern', exact: true }).click();
  await assisted.waitForURL('**/p-kategorie-aendern.html');
  await assisted.locator('#cat_153').click();
  await assisted.locator('#cat_160').click();
  await assisted.locator('#cat_shirts').click();
  await assisted.getByRole('button', { name: 'Weiter', exact: true }).click();
  await assisted.waitForURL('**/p-anzeige-aufgeben-schritt2.html');
  await assisted.waitForFunction(
    () => document.getElementById('ad-title')?.value === 'Vor Kategorienwahl geändert',
  );
  assert.equal(await assisted.locator('#ad-description').inputValue(), 'Originaltext');
  const beforeRepeat = context
    .pages()
    .filter((page) => page.url().includes('p-anzeige-aufgeben-schritt2')).length;
  assert.equal((await sendHandoff({ ...payload, price: 24, title: 'Neue Fassung' })).success, true);
  const changed = context
    .pages()
    .filter((page) => page.url().includes('p-anzeige-aufgeben-schritt2'))
    .at(-1);
  await changed.waitForFunction(
    () => document.getElementById('ad-title')?.value === 'Neue Fassung',
  );
  assert.equal(await changed.locator('#ad-price-amount').inputValue(), '24');
  assert.equal(
    context.pages().filter((page) => page.url().includes('p-anzeige-aufgeben-schritt2')).length,
    beforeRepeat + 1,
  );
  assert.equal(provider.submits, 0);
  assert.equal(provider.begins, 0);
  assert.deepEqual(fixture.errors, []);
  console.log(
    'Manueller Formularweg ohne Kategorie, Wiederaufnahme nach Neuladen, Datenerhalt über Kategorienavigation und geänderte Fassung ohne alten Preis bestanden.',
  );
  const imagePayload = {
    ...payload,
    images: [
      {
        key: 'listings/stable-image.png',
        name: 'Original.png',
        url: 'https://img.kleinanzeigen.de/source-original.png?token=first',
      },
    ],
  };
  assert.equal((await sendHandoff(imagePayload)).success, true);
  const withImage = context
    .pages()
    .filter((page) => page.url().includes('p-anzeige-aufgeben-schritt2'))
    .at(-1);
  await withImage.waitForFunction(() =>
    document.getElementById('step-images')?.textContent.includes('1 Bilder übertragen'),
  );
  const withImageCount = context.pages().length;
  assert.equal(
    (
      await sendHandoff({
        ...imagePayload,
        images: [
          {
            ...imagePayload.images[0],
            url: 'https://img.kleinanzeigen.de/source-original.png?token=second',
          },
        ],
      })
    ).success,
    true,
  );
  assert.equal(context.pages().length, withImageCount);
  assert.equal(provider.uploads, 1);
  console.log(
    'Unveränderte Originalbilder mit erneuerter URL-Signatur verwenden denselben Formular-Tab.',
  );
  for (const page of context.pages()) await page.close();
  provider.reset({ used: 8, relisting: true });
  await provider.prepare(worker);
  const relistingApp = await context.newPage();
  await relistingApp.goto('https://app.flipbase.de/marketplaces/kleinanzeigen');
  const relist = async () =>
    await relistingApp.evaluate(
      async (workspaceId) =>
        await new Promise((resolve, reject) => {
          const requestId = 'relist-' + crypto.randomUUID();
          const timer = setTimeout(() => reject(Error('Erneutes Inserieren ohne Antwort')), 180000);
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
              type: 'FLIPBASE_KLEINANZEIGEN_RELIST_LISTING',
              requestId,
              workspaceId,
              connectionId: '9',
              generation: 2,
              externalId: '999',
              categoryPaths: { 'Mode & Beauty > Herrenbekleidung > Shirts': '153/160/shirts' },
            },
            location.origin,
          );
        }),
      publicationWorkspaceId,
    );
  const recreated = await relist();
  assert.equal(recreated.success, true, JSON.stringify(recreated));
  if (recreated.result.outcome !== 'confirmed')
    console.log(
      JSON.stringify({
        deletes: provider.deletes,
        submits: provider.submits,
        uploads: provider.uploads,
        errors: fixture.errors,
        calls: provider.calls,
        pages: context.pages().map((page) => page.url()),
      }),
    );
  assert.equal(recreated.result.outcome, 'confirmed', JSON.stringify(recreated));
  assert.equal(recreated.result.newExternalId, '1001');
  assert.equal(provider.deletes, 1);
  assert.equal(provider.uploads, 1);
  assert.equal(provider.submits, 1);
  const repeated = await relist();
  assert.equal(repeated.result.outcome, 'confirmed');
  assert.equal(provider.deletes, 1);
  assert.equal(provider.submits, 1);
  assert.deepEqual(fixture.errors, []);
  console.log(
    'Echtes MV3-Neuinserieren: Originalbild vor Löschung gesichert, verzögerte Löschantwort abgewartet, genau eine Löschung und eine bestätigte Neuanlage; Wiederholung ohne zweiten Klick.',
  );
  console.log(
    'Vollständige reale MV3-Ausführung mit Chromium ' +
      context.browser()?.version() +
      ' bestanden; alle Anbieter- und API-Anfragen ausschließlich lokal.',
  );
} finally {
  await context?.close();
  await fixture.close();
  await rm(directory, { recursive: true, force: true });
}
