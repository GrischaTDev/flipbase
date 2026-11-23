import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { claimVintedAccountActionNotification } from './vinted-account-action-transport';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import { VintedListingOperationStore } from './vinted-listing-operation.store';

const entry = (id: string, title: string) =>
  ({ id, title, workspaceId: 'workspace-a', connectionId: 'account-a' }) as MarketplaceEntry;

let store: VintedListingOperationStore;
beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: 'workspace-a', archived_at: null }) },
      },
    ],
  });
  store = TestBed.inject(VintedListingOperationStore);
});

it('zeigt die neueste Aktion zuerst und eine laufende Aktualisierung mit eigenem Text', async () => {
  await store
    .deleteListing(entry('a', 'Alte Jacke'), async () => {
      throw new Error('Nicht bestätigt');
    })
    .catch(() => undefined);
  let finish: () => void = () => undefined;
  const saving = store.updateListing(
    entry('b', 'Silver Jeans'),
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  expect(store.entries().map((action) => [action.title, action.state, action.message])).toEqual([
    ['Silver Jeans', 'running', 'Inserat wird aktualisiert …'],
    ['Alte Jacke', 'error', 'Nicht bestätigt'],
  ]);
  expect(store.runningLabel(entry('b', 'Silver Jeans'))).toBe('Inserat wird aktualisiert');
  expect(store.label('edit')).toBe('Aktualisierung');
  finish();
  await saving;
  expect(store.entries().map((action) => action.title)).toEqual(['Alte Jacke']);
});

it('meldet auch sofort abgeschlossene Serveraktionen genau einmal und zeigt nach Kontowechsel keine alten Titel', async () => {
  const toast = vi.spyOn(TestBed.inject(ToastService), 'success');
  const item = entry('33333333-3333-4333-8333-333333333333', 'Private Jacke');
  const id = '66666666-6666-4666-8666-666666666666';
  await store.updateListing(item, async () => {
    window.dispatchEvent(
      new CustomEvent('flipbase-account-action-accepted', {
        detail: {
          id,
          requestId: '55555555-5555-4555-8555-555555555555',
          workspaceId: 'workspace-a',
          connectionId: 'account-a',
          entryId: item.id,
          title: item.title,
          kind: 'listing_edit_intent',
          state: 'succeeded',
          version: 1,
          waitReason: null,
          errorCode: null,
          result: { status: 'confirmed' },
          blockedByActionId: null,
          historyPurged: false,
          resultExpired: false,
          createdAt: '2026-11-14T12:00:00Z',
          updatedAt: '2026-11-14T12:00:00Z',
          startedAt: null,
          finishedAt: null,
        },
      }),
    );
    expect(store.entries()).toEqual([]);
    expect(store.isRunning(item)).toBe(true);
    expect(store.runningLabel(item)).toBe('Inserat wird aktualisiert');
  });
  expect(toast).toHaveBeenCalledOnce();
  expect(claimVintedAccountActionNotification(id)).toBe(false);
  toast.mockClear();
  await store.updateListing(item, async () => {
    TestBed.inject(WorkspaceService).currentWorkspace.set(null);
  });
  expect(toast).not.toHaveBeenCalled();
});

it('zeigt den neuen Preis sofort und nach einem Fehler wieder den bisherigen', async () => {
  const jacket = entry('c', 'Trainingsjacke');
  let fail: (error: Error) => void = () => undefined;
  const saving = store.changePrice(
    jacket,
    () => new Promise<void>((_resolve, reject) => (fail = reject)),
    2999,
  );
  expect(store.pendingPrice(jacket)).toBe(29.99);
  expect(store.runningLabel(jacket)).toBe('Preis wird übertragen');
  expect(store.pendingPrice(entry('d', 'Andere Jacke'))).toBeNull();
  fail(new Error('Der neue Preis wurde nicht gespeichert.'));
  await saving.catch(() => undefined);
  expect(store.pendingPrice(jacket)).toBeNull();

  let finish: () => void = () => undefined;
  const saved = store.changePrice(
    jacket,
    () => new Promise<void>((resolve) => (finish = resolve)),
    2500,
  );
  expect(store.pendingPrice(jacket)).toBe(25);
  finish();
  await saved;
  expect(store.pendingPrice(jacket)).toBeNull();
});
