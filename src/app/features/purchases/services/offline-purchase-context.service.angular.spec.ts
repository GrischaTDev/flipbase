import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { OfflinePurchaseDraftStore } from './offline-purchase-draft.store';
import { OfflinePurchaseContextService } from './offline-purchase-context.service';

afterEach(() => TestBed.resetTestingModule());
it('locks prepared drafts after a verified empty access result and ignores an initial or failed check', async () => {
  const verifiedUserId = signal<string | null>(null);
  const access = signal<readonly { workspace_id: string; access_status: string }[]>([]);
  const error = signal<string | null>(null);
  const isLoading = signal(false);
  const store = {
    lock: vi.fn(async () => undefined),
    registerContext: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      OfflinePurchaseContextService,
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }), isLoading } },
      {
        provide: WorkspaceService,
        useValue: {
          currentWorkspace: signal({
            id: 'workspace-a',
            name: 'A',
            setup_completed_at: '2026-10-13',
          }),
        },
      },
      { provide: WorkspaceAccessService, useValue: { access, error, verifiedUserId } },
      { provide: OfflinePurchaseDraftStore, useValue: store },
    ],
  });
  TestBed.inject(OfflinePurchaseContextService);
  TestBed.tick();
  expect(store.lock).not.toHaveBeenCalled();
  access.set([{ workspace_id: 'workspace-a', access_status: 'active' }]);
  verifiedUserId.set('user-a');
  TestBed.tick();
  await Promise.resolve();
  expect(store.registerContext).toHaveBeenCalledOnce();
  isLoading.set(true);
  access.set([]);
  TestBed.tick();
  expect(store.lock).not.toHaveBeenCalled();
  isLoading.set(false);
  error.set('Network unavailable');
  TestBed.tick();
  expect(store.lock).not.toHaveBeenCalled();
  error.set(null);
  TestBed.tick();
  expect(store.lock).toHaveBeenCalledOnce();
});
