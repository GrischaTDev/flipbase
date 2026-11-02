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
  provider.reset({ used: 8, relisting: true, smallRelistingImages: true });
  await provider.prepare(worker);
  const tooSmall = await relist();
  assert.equal(tooSmall.success, false, JSON.stringify(tooSmall));
  assert.match(tooSmall.error, /Bildquelle.*Originalbilder/u);
  assert.equal(provider.deletes, 0);
  assert.equal(provider.uploads, 0);
  assert.equal(provider.submits, 0);
  provider.reset({ used: 8, relisting: true });
  await provider.prepare(worker);
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
  const dates = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('kleinanzeigen_publication_days'))
        .kleinanzeigen_publication_days,
  );
  assert.ok(
    Object.values(dates ?? {}).includes(
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()),
    ),
    'Bestätigte Veröffentlichung sichert den tatsächlichen Veröffentlichungstag',
  );
  assert.equal(recreated.result.newExternalId, '1001');
  assert.equal(provider.deletes, 1);
  assert.equal(provider.uploads, 1);
  assert.equal(provider.submits, 1);
  const repeated = await relist();
  assert.equal(repeated.result.outcome, 'confirmed');
  assert.equal(provider.deletes, 1);
  assert.equal(provider.submits, 1);
  assert.deepEqual(fixture.errors, []);
  // Einen unter der alten Version vorbereiteten Vorgang mit gültigen, aber winzigen Bildbytes fortsetzen.
  await worker.evaluate(async (encoded) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('flipbase_kleinanzeigen_relisting', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = database.transaction('attempts').objectStore('attempts').getAll();
      request.onsuccess = () => resolve(request.result[0]);
      request.onerror = () => reject(request.error);
    });
    const bytes = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    record.phase = 'prepared';
    record.images[0] = {
      ...record.images[0],
      encoded,
      mimeType: 'image/png',
      byteSize: bytes.length,
      sha256,
    };
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('attempts', 'readwrite');
      transaction.objectStore('attempts').put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, provider.thumbnailEncoded);
  provider.reset({ used: 8, relisting: true });
  await provider.prepare(worker);
  const resumedSmall = await relist();
  assert.equal(resumedSmall.success, false, JSON.stringify(resumedSmall));
  assert.match(resumedSmall.error, /Bildquelle.*Originalbilder/u);
  assert.equal(provider.deletes, 0);
  assert.equal(provider.uploads, 0);
  assert.equal(provider.submits, 0);
  console.log(
    '96-Pixel-Bilder bei Neuabruf und aus altem gesicherten Vorgang gestoppt: jeweils null Löschungen, Uploads und Veröffentlichungen.',
  );
  console.log(
    'Echtes MV3-Neuinserieren: Originalbild vor Löschung gesichert, verzögerte Löschantwort abgewartet, genau eine Löschung und eine bestätigte Neuanlage; Wiederholung ohne zweiten Klick.',
  );
  // Eigene Tabs sind umrahmt, fremde Tabs bleiben außerhalb der Gruppe.
  const workTabs = await worker.evaluate(async () => {
    const values = (await chrome.storage.local.get('kleinanzeigen_work_tabs'))
      .kleinanzeigen_work_tabs;
    const group = await chrome.tabGroups.get(values.groupId);
    const members = await chrome.tabs.query({ groupId: group.id });
    return { group, members: members.map(({ id }) => id) };
  });
  assert.equal(workTabs.group.title, 'Flipbase · Kleinanzeigen');
  assert.equal(workTabs.group.color, 'yellow');
  assert.equal(
    workTabs.members.length,
    1,
    'Nach Abschluss bleibt nur der gemeinsame Anzeigen-Arbeitstab.',
  );
  const statusPage = context
    .pages()
    .find((page) => page.url() === 'https://www.kleinanzeigen.de/m-meine-anzeigen.html');
  await statusPage.locator('#flipbase-workspace-assistant').waitFor();
  // Neue eigenständige Löschaktion: keine Veröffentlichung und keine erneute Löschung bei Wiederholung.
  provider.reset({ used: 8, relisting: true });
  await provider.prepare(worker);
  // Website-Sender muss über die reale App-Brücke laufen, nicht aus dem Worker selbst.
  const removeListing = async (patch = {}) =>
    relistingApp.evaluate(
      async ({ workspaceId, patch }) =>
        await new Promise((resolve, reject) => {
          const requestId = 'delete-' + crypto.randomUUID();
          const timer = setTimeout(() => reject(Error('Löschen ohne Antwort')), 60000);
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
              type: 'FLIPBASE_KLEINANZEIGEN_DELETE_LISTING',
              requestId,
              workspaceId,
              connectionId: '9',
              generation: 2,
              externalId: '999',
              title: 'Jacke',
              ...patch,
            },
            location.origin,
          );
        }),
      { workspaceId: publicationWorkspaceId, patch },
    );
  assert.equal((await removeListing({ connectionId: '10' })).success, false);
  assert.equal((await removeListing({ title: 'Fremde Anzeige' })).success, false);
  assert.equal(provider.deletes, 0);
  const deletion = await removeListing();
  assert.equal(deletion.success, true, JSON.stringify(deletion));
  assert.equal(deletion.result.confirmed, true);
  assert.equal(provider.deletes, 1);
  assert.equal(provider.submits, 0);
  assert.equal((await removeListing()).success, false);
  assert.equal(provider.deletes, 1);
  console.log(
    'Gruppierte eigene Tabs mit Assistent sowie kontogebundene Einzellöschung ohne Veröffentlichung bestanden.',
  );
  for (const deleteRemains of [false, true]) {
    provider.reset({ used: 8, relisting: true, deleteNavigation: true, deleteRemains });
    await provider.prepare(worker);
    const navigationResult = await removeListing();
    assert.equal(navigationResult.success, !deleteRemains, JSON.stringify(navigationResult));
    assert.equal(provider.deletes, 1, 'Verlorene Antwort löst keinen zweiten Löschklick aus.');
    assert.equal(provider.submits, 0);
    if (deleteRemains) assert.match(navigationResult.error, /Löschung/);
    assert.equal(
      context.pages().filter((page) => page.url().includes('/m-einstellungen.html')).length,
      0,
      'Keine Einstellungen-Tabs.',
    );
    assert.equal(
      context.pages().filter((page) => new URL(page.url()).pathname === '/m-meine-anzeigen.html')
        .length,
      1,
      'Rückleitung verwendet denselben eigenen Tab.',
    );
  }
  console.log(
    'Lösch-Navigation: vollständige Nachprüfung ohne zweiten Klick; erhaltene Anzeige wird nicht als gelöscht bestätigt. Keine Einstellungen-Tabs.',
  );
  // Manueller Abschluss nach einem berechtigten Gebührenstopp, anschließend weitere Navigation.
  await worker.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('flipbase_kleinanzeigen_relisting', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('attempts', 'readwrite');
      transaction.objectStore('attempts').clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  provider.reset({ used: 8, relisting: true, unknownFee: true });
  await provider.prepare(worker);
  const activeBeforePause = await worker.evaluate(async () =>
    (await chrome.tabs.query({ active: true })).map((tab) => tab.id),
  );
  const paused = await relist();
  assert.deepEqual(
    await worker.evaluate(async () =>
      (await chrome.tabs.query({ active: true })).map((tab) => tab.id),
    ),
    activeBeforePause,
    'Ein Stopp darf keinen Fokuswechsel auslösen',
  );
  assert.equal(paused.result.errorCode, 'fees_or_quota', JSON.stringify(paused));
  assert.equal(provider.submits, 0);
  assert.equal(provider.deletes, 0);
  const manualForm = context
    .pages()
    .filter((page) =>
      page.url().startsWith('https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html'),
    )
    .at(-1);
  const formCount = context
    .pages()
    .filter((page) =>
      page.url().startsWith('https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html'),
    ).length;
  const resumed = await relist();
  assert.equal(resumed.result.errorCode, 'fees_or_quota');
  assert.equal(
    context
      .pages()
      .filter((page) =>
        page.url().startsWith('https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html'),
      ).length,
    formCount,
    'Fortsetzen verwendet den bereits vorbereiteten eigenen Tab',
  );
  assert.equal(provider.deletes, 0);
  assert.equal(provider.submits, 0);
  await manualForm
    .locator('#flipbase-workspace-assistant')
    .getByText('Angehalten:', { exact: false })
    .waitFor();
  await manualForm.getByRole('button', { name: 'Anzeige aufgeben', exact: true }).click();
  await manualForm.waitForURL('https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt3.html');
  await manualForm.waitForFunction(() => sessionStorage.getItem('flipbase_kleinanzeigen_receipt'));
  await manualForm.goto('https://www.kleinanzeigen.de/m-meine-anzeigen.html');
  const statuses = await relistingApp.evaluate(
    async (workspaceId) =>
      await new Promise((resolve, reject) => {
        const requestId = 'status-' + crypto.randomUUID();
        const timer = setTimeout(() => reject(Error('Status ohne Antwort')), 60000);
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
            type: 'FLIPBASE_KLEINANZEIGEN_RELIST_ATTEMPTS',
            requestId,
            workspaceId,
            connectionId: '9',
            generation: 2,
          },
          location.origin,
        );
      }),
    publicationWorkspaceId,
  );
  assert.equal(statuses.success, true, JSON.stringify(statuses));
  assert.equal(statuses.result[0].phase, 'confirmed', JSON.stringify(statuses));
  await manualForm
    .locator('#flipbase-workspace-assistant')
    .getByText('Vorgang abgeschlossen', { exact: true })
    .waitFor();
  assert.equal((await relist()).result.outcome, 'confirmed');
  assert.equal(provider.submits, 1, 'Nur der manuelle Klick hat veröffentlicht.');
  assert.equal(provider.deletes, 0, 'Der lesende Abschluss löscht keine Altanzeige.');
  console.log(
    'Manueller Abschluss nach Gebührenstopp auch nach Weiternavigation erkannt; kein zweiter Submit und keine automatische Löschung.',
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
