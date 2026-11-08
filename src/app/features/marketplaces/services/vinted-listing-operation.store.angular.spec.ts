import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, expect, it } from 'vitest';
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
