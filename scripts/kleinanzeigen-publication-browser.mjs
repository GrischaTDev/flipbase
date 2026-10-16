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
