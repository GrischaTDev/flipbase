import { expect, test, type Page } from '@playwright/test';
import type { PurchaseDocument } from '../src/app/core/models/purchase-document.models';
import type {
  OfflinePurchaseDraft,
  OfflinePurchaseTransferAttempt,
} from '../src/app/features/purchases/models/offline-purchase-draft.models';
import type { OfflinePurchaseDraftStore } from '../src/app/features/purchases/services/offline-purchase-draft.store';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

const origin = 'https://api.flipbase.de';
const userId = '25000000-0000-4000-8000-000000000001';
const purchaseId = '55000000-0000-4000-8000-000000000071';

async function readAttempts(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('flipbase-purchase-drafts', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const attempts = await new Promise<OfflinePurchaseTransferAttempt[]>((resolve, reject) => {
        const request = database.transaction('transfers').objectStore('transfers').getAll();
        request.onsuccess = () => resolve(request.result as OfflinePurchaseTransferAttempt[]);
        request.onerror = () => reject(request.error);
      });
      return Promise.all(
        attempts.map(async (attempt) => ({
          draftId: attempt.draftId,
          requestId: attempt.requestId,
          state: attempt.state,
          uploadedDocumentIds: attempt.uploadedDocumentIds ?? [],
          documents: await Promise.all(
            (attempt.documents ?? []).map(async (document) => {
              const file = document.file as
                | File
                | {
                    purchaseFileVersion: 1;
                    name: string;
                    type: string;
                    bytes: ArrayBuffer;
                  };
              const bytes = 'purchaseFileVersion' in file ? file.bytes : await file.arrayBuffer();
              return {
                id: document.id,
                name: file.name,
                type: file.type,
                bytes: Array.from(new Uint8Array(bytes)),
              };
            }),
          ),
        })),
      );
    } finally {
      database.close();
    }
  });
}

test('normal purchase save reconciles lost responses and finishes only after all original documents', async ({
  page,
  browserName,
}) => {
  // Alle Backendantworten bleiben lokale HTTP-Fixtures; IndexedDB, File und Dienste sind echt.
  await mockMarketplace(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { origin, userId },
  );
  const inputs = [
    {
      name: 'quittung.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nOriginal\n\x00\xff\x01', 'latin1'),
    },
    {
      name: 'zahlungsnachweis.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><beleg>Größe: 12 €</beleg>'),
    },
  ];
  const creates: Record<string, unknown>[] = [];
  const purchases = new Map<string, Record<string, unknown>>();
  const documents = new Map<string, PurchaseDocument>();
  const metadataWrites: PurchaseDocument[] = [];
  const uploads: { path: string; bytes: Buffer }[] = [];
  const storage = new Map<string, Buffer>();
  const downloads: string[] = [];
  const deletes: string[] = [];
  let recoveredMetadataReads = 0;
  let releaseLastDocument: () => void = () => undefined;
  const lastDocumentGate = new Promise<void>((resolve) => {
    releaseLastDocument = resolve;
  });

  await page.route(`${origin}/rest/v1/purchases?**`, (route) => {
    const identifier = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({
      json:
        identifier === `eq.${purchaseId}` ? [...purchases.values()][0] : [...purchases.values()],
    });
  });
  await page.route(`${origin}/rest/v1/rpc/create_purchase`, async (route) => {
    const request = route.request().postDataJSON() as { p_purchase: Record<string, unknown> };
    creates.push(request);
    const requestId = String(request.p_purchase['request_id']);
    if (!purchases.has(requestId)) {
      purchases.set(requestId, {
        ...request.p_purchase,
        id: purchaseId,
        workspace_id: workspaceId,
        receiving_status: 'draft',
        created_at: '2026-10-13T12:00:00Z',
        purchase_lines: [],
        costs: [],
        items: [],
      });
    }
    // Der Server hat bereits gespeichert; nur die erste Antwort erreicht den Browser nicht.
    if (creates.length === 1) return route.abort('failed');
    return route.fulfill({
      json: { purchase: purchases.get(requestId), purchase_lines: [], purchase_costs: [] },
    });
  });
  await page.route(`${origin}/storage/v1/object/**`, async (route) => {
    const request = route.request();
    const path = decodeURIComponent(
      new URL(request.url()).pathname.slice('/storage/v1/object/'.length),
    );
    if (request.method() === 'DELETE') {
      deletes.push(path);
      return route.fulfill({ json: [] });
    }
    if (request.method() === 'GET') {
      downloads.push(path);
      const bytes = storage.get(path);
      return bytes
        ? route.fulfill({ body: bytes, contentType: 'application/octet-stream' })
        : route.fulfill({ status: 404, json: { message: 'Not found' } });
    }
    if (request.method() !== 'POST') return route.fulfill({ status: 405 });
    const body = request.postDataBuffer();
    if (!body) throw new Error('Der Storage-Upload enthält keine Dateidaten.');
    const form = await new Response(body, {
      headers: { 'Content-Type': request.headers()['content-type'] },
    }).formData();
    const file = form.get('');
    if (!file || typeof file === 'string')
      throw new Error('Der Storage-Upload enthält keine Originaldatei.');
    let bytes = Buffer.from(await file.arrayBuffer());
    if (browserName === 'webkit' && file.size === 0) {
      // WebKit lässt Filebytes im Playwright-Interceptionprotokoll aus, obwohl echte HTTP-Uploads sie senden.
      const documentId = path.split('/').at(-1)?.split('.')[0];
      const bufferedDocument = (await readAttempts(page))
        .flatMap((attempt) => attempt.documents)
        .find((document) => document.id === documentId);
      if (!bufferedDocument)
        throw new Error('Der unveränderliche Uploadauftrag fehlt im nativen Speicher.');
      expect(file.name).toBe(bufferedDocument.name);
      expect(file.type).toBe(bufferedDocument.type);
      bytes = Buffer.from(bufferedDocument.bytes);
    }
    uploads.push({ path, bytes });
    if (storage.has(path))
      return route.fulfill({
        status: 409,
        json: { statusCode: '409', error: 'Duplicate', message: 'Already exists' },
      });
    storage.set(path, bytes);
    return route.fulfill({ json: { Key: path, Id: 'fixture-storage' } });
  });
  await page.route(`${origin}/rest/v1/purchase_documents**`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const identifier = new URL(request.url()).searchParams.get('id');
      if (!identifier) return route.fulfill({ json: [...documents.values()] });
      const document = documents.get(identifier.slice(3));
      if (document) recoveredMetadataReads++;
      return route.fulfill({ json: document ? [document] : [] });
    }
    if (request.method() === 'DELETE') {
      deletes.push(request.url());
      return route.fulfill({ json: [] });
    }
    if (request.method() !== 'POST') return route.fulfill({ status: 405 });
    const document = {
      ...request.postDataJSON(),
      created_at: '2026-10-13T12:00:00Z',
    } as PurchaseDocument;
    metadataWrites.push(document);
    if (metadataWrites.length === 2) await lastDocumentGate;
    if (documents.has(document.id))
      return route.fulfill({ status: 409, json: { code: '23505', message: 'Duplicate document' } });
    documents.set(document.id, document);
    // Auch hier bleibt der gespeicherte Datensatz erhalten, obwohl seine Antwort verloren geht.
    if (metadataWrites.length === 1) return route.abort('failed');
    return route.fulfill({ json: document });
  });

  try {
    await page.goto('/purchases/new');
    await expect(
      page.getByRole('heading', { name: 'Einkauf erstellen', exact: true }),
    ).toBeVisible();
    if (browserName === 'chromium') {
      await expect
        .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
        .toBe(true);
    }
    await page.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
    await page.getByLabel('Verkäuferangabe, falls bekannt').fill('Stand mit Originalbelegen');
    await page.getByLabel('Belegdateien auswählen').setInputFiles(inputs);
    await expect(page.locator('[data-pending-documents]')).toContainText(inputs[0].name);
    await expect(page.locator('[data-pending-documents]')).toContainText(inputs[1].name);
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await expect.poll(() => creates.length).toBe(1);
    await expect(page.locator('app-purchase-entry-form form')).not.toHaveAttribute('inert', '');
    expect(purchases.size).toBe(1);
    await expect(page).toHaveURL(/\/purchases\/new$/);
    expect(documents.size).toBe(0);

    const queued = await readAttempts(page);
    expect(queued).toHaveLength(1);
    expect(queued[0].requestId).toBe(
      (creates[0]['p_purchase'] as Record<string, unknown>)['request_id'],
    );
    expect(queued[0].requestId).toMatch(/^[a-f0-9-]{36}$/i);
    expect(
      queued[0].documents.map((document) => ({
        name: document.name,
        type: document.type,
        bytes: document.bytes,
      })),
    ).toEqual(
      inputs.map((input) => ({ name: input.name, type: input.mimeType, bytes: [...input.buffer] })),
    );

    await page.addScriptTag({ url: '/api/__pwa_test__/offline-store.js' });
    const roundtrips = await page.evaluate(async (draftId) => {
      const browserWindow = window as Window & {
        createOfflinePurchaseStore(): OfflinePurchaseDraftStore;
      };
      const attempt = await browserWindow.createOfflinePurchaseStore().getAttempt(draftId);
      if (!attempt) throw new Error('Der gespeicherte Uploadauftrag fehlt.');
      return Promise.all(
        (attempt.documents ?? []).map(async (document) => {
          const response = await fetch('/api/__pwa_test__/file-roundtrip', {
            method: 'POST',
            headers: {
              'Content-Type': document.file.type,
              'X-File-Name': encodeURIComponent(document.file.name),
            },
            body: document.file,
          });
          if (!response.ok) throw new Error('Die native HTTP-Dateiprobe ist fehlgeschlagen.');
          return {
            name: decodeURIComponent(response.headers.get('X-File-Name') ?? ''),
            type: response.headers.get('Content-Type'),
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
          };
        }),
      );
    }, queued[0].draftId);
    // Diese lokale HTTP-Senke ist bewusst nicht durch page.route ersetzt.
    expect(roundtrips).toEqual(
      inputs.map((input) => ({ name: input.name, type: input.mimeType, bytes: [...input.buffer] })),
    );

    // Der normale Online-Trigger nimmt den bestehenden Versuch ohne weiteren Speicherklick wieder auf.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => metadataWrites.length).toBe(2);
    expect(creates).toHaveLength(2);
    expect(creates[1]).toEqual(creates[0]);
    expect(purchases.size).toBe(1);
    expect(documents.size).toBe(1);
    expect(recoveredMetadataReads).toBeGreaterThan(0);
    expect(downloads).toContain(`purchase-documents/${metadataWrites[0].storage_path}`);
    expect(metadataWrites.map((document) => document.id)).toEqual(
      queued[0].documents.map((document) => document.id),
    );
    expect(uploads).toHaveLength(2);
    for (const input of inputs) {
      const document = metadataWrites.find((entry) => entry.original_file_name === input.name);
      if (!document) throw new Error(`Die Metadaten für ${input.name} fehlen.`);
      expect(document).toMatchObject({
        workspace_id: workspaceId,
        purchase_id: purchaseId,
        file_size: input.buffer.length,
        mime_type: input.mimeType,
      });
      expect(storage.get(`purchase-documents/${document.storage_path}`)).toEqual(input.buffer);
    }
    expect(deletes).toEqual([]);
    // Ein bestätigter Einkauf genügt nicht: Die letzte Belegantwort steht noch aus.
    await expect(page).toHaveURL(/\/purchases\/new$/);
    await expect(page.locator('app-purchase-entry-form')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lokaler Einkaufsentwurf' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ursprünglichen Versuch prüfen' })).toHaveCount(
      0,
    );

    releaseLastDocument();
    await expect
      .poll(async () => (await readAttempts(page))[0]?.uploadedDocumentIds.length)
      .toBe(2);
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));
    expect(documents.size).toBe(2);
    expect(new Set(metadataWrites.map((document) => document.id)).size).toBe(2);
    expect(metadataWrites).toHaveLength(2);
    expect(uploads).toHaveLength(2);
    expect(creates).toHaveLength(2);
    expect(purchases.size).toBe(1);
    expect(deletes).toEqual([]);
  } finally {
    releaseLastDocument();
  }
});

for (const preserveSession of [true, false]) {
  test(`a second window confirms the original attempt and the first window updates its newer inputs (${preserveSession ? 'existing session' : 'same-user session refresh'})`, async ({
    page,
    context,
  }) => {
    const secondPage = await context.newPage();
    const creates: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const purchases = new Map<string, Record<string, unknown>>();
    const newSeller = 'Neuer Verkäufer in Fenster A';
    const newNotes = 'Neue Notiz bleibt in Fenster A';
    let allowReconciliation = false;
    for (const windowPage of [page, secondPage]) {
      await mockMarketplace(
        windowPage,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { origin, userId, preserveExistingSession: preserveSession && windowPage === secondPage },
      );
      await windowPage.route(`${origin}/rest/v1/purchases?**`, (route) => {
        const identifier = new URL(route.request().url()).searchParams.get('id');
        return route.fulfill({
          json:
            identifier === `eq.${purchaseId}`
              ? [...purchases.values()][0]
              : [...purchases.values()],
        });
      });
      await windowPage.route(`${origin}/rest/v1/rpc/create_purchase`, (route) => {
        const request = route.request().postDataJSON() as { p_purchase: Record<string, unknown> };
        creates.push(request);
        const requestId = String(request.p_purchase['request_id']);
        if (!purchases.has(requestId))
          purchases.set(requestId, {
            ...request.p_purchase,
            id: purchaseId,
            workspace_id: workspaceId,
            receiving_status: 'draft',
            created_at: '2026-10-13T12:00:00Z',
            purchase_lines: [],
            costs: [],
            items: [],
          });
        if (!allowReconciliation) return route.abort('failed');
        return route.fulfill({
          json: { purchase: purchases.get(requestId), purchase_lines: [], purchase_costs: [] },
        });
      });
      await windowPage.route(`${origin}/rest/v1/rpc/update_purchase_draft`, (route) => {
        const request = route.request().postDataJSON() as {
          p_purchase: Record<string, unknown>;
          p_purchase_id: string;
        };
        updates.push(request);
        const [requestId, existing] = [...purchases.entries()][0];
        const purchase = { ...existing, ...request.p_purchase, id: request.p_purchase_id };
        purchases.set(requestId, purchase);
        return route.fulfill({ json: { purchase, purchase_lines: [], purchase_costs: [] } });
      });
    }
    const noteField = page.locator(
      'app-purchase-entry-form app-text-field[formcontrolname="notes"] textarea',
    );
    await page.goto('/purchases/new');
    await expect(
      page.getByRole('heading', { name: 'Einkauf erstellen', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
    await page.getByLabel('Verkäuferangabe, falls bekannt').fill('Originalverkäufer');
    await noteField.fill('Originalnotiz');
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await expect.poll(() => creates.length).toBe(1);
    await expect(page.locator('app-purchase-entry-form form')).not.toHaveAttribute('inert', '');
    await page.getByLabel('Verkäuferangabe, falls bekannt').fill(newSeller);
    await noteField.fill(newNotes);
    await expect
      .poll(() =>
        page.evaluate(async (expectedNotes) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('flipbase-purchase-drafts', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            return await new Promise<boolean>((resolve, reject) => {
              const request = database.transaction('drafts').objectStore('drafts').getAll();
              request.onsuccess = () =>
                resolve(
                  (request.result as OfflinePurchaseDraft[]).some(
                    (draft) => draft.review?.form['notes'] === expectedNotes,
                  ),
                );
              request.onerror = () => reject(request.error);
            });
          } finally {
            database.close();
          }
        }, newNotes),
      )
      .toBe(true);

    // Nur das zweite echte App-Fenster wird geöffnet; sein Bootstrap nimmt den Auftrag selbst auf.
    allowReconciliation = true;
    await secondPage.goto(preserveSession ? '/dashboard' : '/purchases/new');
    if (preserveSession) await expect(secondPage.locator('app-purchase-entry-form')).toHaveCount(0);
    await expect.poll(() => creates.length).toBe(2);
    await expect.poll(async () => (await readAttempts(secondPage))[0]?.state).toBe('confirmed');
    expect(creates[1]).toEqual(creates[0]);
    expect((creates[0]['p_purchase'] as Record<string, unknown>)['seller_name']).toBe(
      'Originalverkäufer',
    );
    expect(purchases.size).toBe(1);
    await expect(page.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue(newSeller);
    await expect(noteField).toHaveValue(newNotes);

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(
      page.getByText(
        'Einkauf wurde gespeichert. Deine weiteren Änderungen bleiben in der Maske erhalten.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entwurf speichern', exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue(newSeller);
    await expect(noteField).toHaveValue(newNotes);
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toMatchObject({
      p_workspace_id: workspaceId,
      p_purchase_id: purchaseId,
      p_purchase: { seller_name: newSeller, notes: newNotes },
    });
    await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));
    expect(creates).toHaveLength(2);
    expect(purchases.size).toBe(1);
    expect([...purchases.values()][0]).toMatchObject({
      id: purchaseId,
      seller_name: newSeller,
      notes: newNotes,
    });
  });
}
