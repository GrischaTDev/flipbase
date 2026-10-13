import { expect, test, Page } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';
import type { OfflinePurchaseDraftStore } from '../src/app/features/purchases/services/offline-purchase-draft.store';

declare global {
  interface Window {
    createOfflinePurchaseStore(): OfflinePurchaseDraftStore;
  }
}
const userId = '25000000-0000-4000-8000-000000000001';
async function mockBackend(page: Page) {
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
    { origin: 'https://api.flipbase.de', userId },
  );
}
async function fixture(page: Page) {
  await page.goto('/offline');
  await expect(
    page.getByRole('heading', { name: 'Lokale Einkaufsentwürfe', exact: true }),
  ).toBeVisible();
  await page.addScriptTag({ url: '/api/__pwa_test__/offline-store.js' });
}
test('real IndexedDB isolates users, reloads and locks without deleting drafts', async ({
  page,
}) => {
  await fixture(page);
  const result = await page.evaluate(
    async ({ userId, workspaceId }) => {
      const store = window.createOfflinePurchaseStore();
      await store.registerContext(userId, workspaceId, 'Eigener Workspace');
      const draft = await store.create({
        draftName: 'A',
        purchaseDate: '2026-10-13',
        sellerNote: '',
        notes: '',
        lines: [],
      });
      const restarted = window.createOfflinePurchaseStore();
      const restored = await restarted.get(draft.draftId);
      restarted.noteIdentity('35000000-0000-4000-8000-000000000001');
      const otherDenied = await restarted.get(draft.draftId).then(
        () => false,
        () => true,
      );
      await restarted.registerContext('35000000-0000-4000-8000-000000000001', workspaceId, 'B');
      const otherCount = (await restarted.list()).length;
      await restarted.lock();
      const locked = await window
        .createOfflinePurchaseStore()
        .list()
        .then(
          () => false,
          () => true,
        );
      await restarted.registerContext(userId, workspaceId, 'A');
      return {
        restoredId: restored.draftId,
        expectedId: draft.draftId,
        otherDenied,
        otherCount,
        locked,
        remaining: (await restarted.list()).length,
      };
    },
    { userId, workspaceId },
  );
  expect(result).toEqual({
    restoredId: result.expectedId,
    expectedId: result.expectedId,
    otherDenied: true,
    otherCount: 0,
    locked: true,
    remaining: 1,
  });
});
test('real IndexedDB commits one competing revision and preserves the immutable retry after edits', async ({
  page,
}) => {
  await fixture(page);
  const result = await page.evaluate(
    async ({ userId, workspaceId }) => {
      const store = window.createOfflinePurchaseStore();
      const other = window.createOfflinePurchaseStore();
      await store.registerContext(userId, workspaceId, 'A');
      const draft = await store.create({
        draftName: 'Test',
        purchaseDate: '2026-10-13',
        sellerNote: '',
        notes: 'alt',
        lines: [],
      });
      const saves = await Promise.allSettled([
        store.save(draft.draftId, 1, { ...draft.content, notes: 'eins' }),
        other.save(draft.draftId, 1, { ...draft.content, notes: 'zwei' }),
      ]);
      const before = await store.get(draft.draftId);
      const payload = {
        request_id: draft.requestId,
        type: 'lot' as const,
        title: '',
        purchase_date: draft.content.purchaseDate,
        purchase_price: 1,
        notes: 'Unveränderlicher Originaltext',
        supplier_id: '65000000-0000-4000-8000-000000000001',
        purchase_lines: [],
      };
      const first = await store.beginAttempt(draft.draftId, before.revision, payload, 'tab-a');
      const blocked = await other
        .beginAttempt(draft.draftId, before.revision, payload, 'tab-b')
        .then(
          () => false,
          () => true,
        );
      await store.markUnknown(first);
      const newer = await store.save(
        draft.draftId,
        before.revision,
        {
          ...before.content,
          notes: 'Neue Ergänzungen',
          lines: [
            {
              lineId: '45000000-0000-4000-8000-000000000001',
              title: 'Neu',
              ean: null,
              condition: 'used',
              quantity: 5,
              unitPriceCents: 13,
            },
          ],
        },
        {
          content: before.content,
          form: { supplier_id: '75000000-0000-4000-8000-000000000001' },
          lines: [],
          costs: [],
        },
      );
      const retry = await other.beginAttempt(
        draft.draftId,
        newer.revision,
        { ...payload, purchase_price: 99, notes: 'geändert' },
        'tab-b',
      );
      const staleDenied = await store
        .markTransferred(first, '55000000-0000-4000-8000-000000000001')
        .then(
          () => false,
          () => true,
        );
      const completion = await other.markTransferred(retry, '55000000-0000-4000-8000-000000000001');
      const after = await other.get(draft.draftId);
      const exportSnapshot = await other.exportCurrent();
      return {
        writes: saves.filter((save) => save.status === 'fulfilled').length,
        blocked,
        samePayload: JSON.stringify(payload) === JSON.stringify(retry.payload),
        sameRequest: retry.requestId === draft.requestId,
        staleDenied,
        completion,
        state: after.state,
        notes: after.content.notes,
        price: after.content.lines[0].unitPriceCents,
        reviewSeller: after.review?.form['supplier_id'],
        exportCount: exportSnapshot.drafts.length,
      };
    },
    { userId, workspaceId },
  );
  expect(result).toEqual({
    writes: 1,
    blocked: true,
    samePayload: true,
    sameRequest: true,
    staleDenied: true,
    completion: 'newer_revision',
    state: 'review_required',
    notes: 'Neue Ergänzungen',
    price: 13,
    reviewSeller: '75000000-0000-4000-8000-000000000001',
    exportCount: 1,
  });
});

test('local write failure, expired access and unknown formats retain the previous IndexedDB data', async ({
  page,
}) => {
  await fixture(page);
  const result = await page.evaluate(
    async ({ userId, workspaceId }) => {
      const store = window.createOfflinePurchaseStore();
      await store.registerContext(userId, workspaceId, 'A');
      const draft = await store.create({
        draftName: 'Sicherung',
        purchaseDate: '2026-10-13',
        sellerNote: '',
        notes: 'Vorher',
        lines: [],
      });
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'drafts') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return put.apply(this, args);
      };
      let writeDenied: boolean;
      try {
        writeDenied = await store
          .save(draft.draftId, 1, { ...draft.content, notes: 'Ungesichert' })
          .then(
            () => false,
            () => true,
          );
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      const unchanged = await store.get(draft.draftId);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('flipbase-purchase-drafts', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const write = (storeName: string, entry: unknown, key?: IDBValidKey) =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).put(entry, key);
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
      const context = await store.activeContext();
      await write('contexts', { ...context, verifiedAt: Date.now() - 8 * 86400000 }, 'active');
      const expiredDenied = await window
        .createOfflinePurchaseStore()
        .list()
        .then(
          () => false,
          () => true,
        );
      await store.registerContext(userId, workspaceId, 'A');
      await write('drafts', { ...draft, schemaVersion: 999 });
      const unknownDenied = await store.get(draft.draftId).then(
        () => false,
        () => true,
      );
      const raw = await new Promise<{ schemaVersion: number; content: { notes: string } }>(
        (resolve, reject) => {
          const request = database
            .transaction('drafts')
            .objectStore('drafts')
            .get([userId, workspaceId, draft.draftId]);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      database.close();
      return {
        writeDenied,
        notes: unchanged.content.notes,
        revision: unchanged.revision,
        expiredDenied,
        unknownDenied,
        rawVersion: raw.schemaVersion,
        rawNotes: raw.content.notes,
      };
    },
    { userId, workspaceId },
  );
  expect(result).toEqual({
    writeDenied: true,
    notes: 'Vorher',
    revision: 1,
    expiredDenied: true,
    unknownDenied: true,
    rawVersion: 999,
    rawNotes: 'Vorher',
  });
});
test('prepared offline UI autosaves and reopens the exact local draft @worker', async ({
  page,
  context,
}) => {
  await mockBackend(page);
  await page.goto('/settings/app');
  await expect(page.getByRole('heading', { name: 'Progressive Web App (PWA)' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  await page.goto('/offline/purchases');
  await page.getByRole('button', { name: 'Neuer lokaler Entwurf' }).click();
  await page.getByLabel('Lokaler Entwurfsname').fill('Messe am Dienstag');
  await page.getByLabel('Verkäufernotiz', { exact: true }).fill('Stand 7');
  await page.getByLabel('Allgemeine Notiz').fill('Lampe prüfen');
  await expect(page.getByRole('status')).toHaveText('Auf diesem Gerät gespeichert.');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Messe am Dienstag', exact: true }).click();
  await expect(page.getByLabel('Verkäufernotiz', { exact: true })).toHaveValue('Stand 7');
  await expect(page.getByLabel('Allgemeine Notiz')).toHaveValue('Lampe prüfen');
  await context.setOffline(false);
  await page.addScriptTag({ url: '/api/__pwa_test__/axe.js' });
  expect(
    await page.evaluate(
      async () =>
        (await (window as unknown as { axe: typeof axe }).axe.run('app-offline-purchases'))
          .violations,
    ),
  ).toEqual([]);
});

test('an account switch at IndexedDB completion never returns the old user draft', async ({
  page,
}) => {
  await fixture(page);
  const denied = await page.evaluate(
    async ({ userId, workspaceId }) => {
      const store = window.createOfflinePurchaseStore();
      await store.registerContext(userId, workspaceId, 'A');
      const draft = await store.create({
        draftName: 'A',
        purchaseDate: '2026-10-13',
        sellerNote: '',
        notes: 'Privat',
        lines: [],
      });
      const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      if (!descriptor?.set) throw new Error('Native transaction completion hook missing');
      const setComplete = descriptor.set;
      let switched = false;
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...descriptor,
        set(handler: ((event: Event) => void) | null) {
          setComplete.call(this, function (this: IDBTransaction, event: Event) {
            if (!switched) {
              switched = true;
              store.noteIdentity('35000000-0000-4000-8000-000000000001');
            }
            handler?.call(this, event);
          });
        },
      });
      try {
        return await store.get(draft.draftId).then(
          () => false,
          () => true,
        );
      } finally {
        Object.defineProperty(IDBTransaction.prototype, 'oncomplete', descriptor);
      }
    },
    { userId, workspaceId },
  );
  expect(denied).toBe(true);
});
test('online form freezes the complete first payload and reconciles a lost response after newer seller and note edits', async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto('/settings/app');
  await expect(page.getByRole('heading', { name: 'Progressive Web App (PWA)' })).toBeVisible();
  await page.goto('/offline/purchases');
  await page.getByRole('button', { name: 'Neuer lokaler Entwurf' }).click();
  await page.getByLabel('Lokaler Entwurfsname').fill('Lokaler Name');
  await page.getByLabel('Verkäufernotiz', { exact: true }).fill('Stand 7');
  await page.getByLabel('Allgemeine Notiz').fill('Originalnotiz');
  await expect(page.getByRole('status')).toHaveText('Auf diesem Gerät gespeichert.');
  await page.getByRole('button', { name: 'Online prüfen und übernehmen' }).click();
  await expect(page.getByRole('region', { name: 'Lokaler Einkaufsentwurf' })).toBeVisible();
  await page.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
  const creates: Record<string, unknown>[] = [];
  let releaseResponse: () => void = () => undefined;
  const delayedResponse = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const purchaseId = '55000000-0000-4000-8000-000000000001';
  await page.route('https://api.flipbase.de/rest/v1/rpc/create_purchase', async (route) => {
    const body = route.request().postDataJSON() as { p_purchase: Record<string, unknown> };
    creates.push(body);
    if (creates.length === 1) {
      await delayedResponse;
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      json: {
        purchase: {
          ...body.p_purchase,
          id: purchaseId,
          workspace_id: workspaceId,
          created_at: new Date().toISOString(),
        },
        purchase_lines: [],
        purchase_costs: [],
      },
    });
  });
  await page.getByLabel('Verkäuferangabe, falls bekannt').fill('Originalverkäufer');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page.locator('app-purchase-entry-form form')).toHaveAttribute('inert', '');
  const sellerInput = page.getByLabel('Verkäuferangabe, falls bekannt');
  expect(
    await sellerInput.evaluate((input) => {
      (input as HTMLElement).focus();
      return document.activeElement === input;
    }),
  ).toBe(false);
  await expect(sellerInput).toHaveValue('Originalverkäufer');
  releaseResponse();
  await expect(page.getByRole('button', { name: 'Ursprünglichen Versuch prüfen' })).toBeVisible();
  await page.getByLabel('Verkäuferangabe, falls bekannt').fill('Neuer Verkäufer');
  await page
    .locator('app-purchase-entry-form app-text-field[formcontrolname="notes"] textarea')
    .fill('Neue Notiz');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Neuer Verkäufer');
  await page.getByRole('button', { name: 'Ursprünglichen Versuch prüfen' }).click();
  await expect(
    page.getByRole('link', { name: 'Ergänzungen im zugeordneten Einkauf prüfen' }),
  ).toBeVisible();
  expect(creates).toHaveLength(2);
  expect(creates[1]).toEqual(creates[0]);
  expect(creates[0]['p_purchase']).toMatchObject({
    title: '',
    seller_name: 'Originalverkäufer',
    notes: 'Verkäufernotiz:\nStand 7\n\nAllgemeine Notiz:\nOriginalnotiz',
  });
  await page.reload();
  await expect(page.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Neuer Verkäufer');
  await expect(
    page.locator('app-purchase-entry-form app-text-field[formcontrolname="notes"] textarea'),
  ).toHaveValue('Neue Notiz');
  await expect(
    page.getByRole('link', { name: 'Ergänzungen im zugeordneten Einkauf prüfen' }),
  ).toBeVisible();
  expect(creates).toHaveLength(2);
});
