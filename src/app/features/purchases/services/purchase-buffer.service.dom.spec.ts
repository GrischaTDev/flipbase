import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Purchase } from '../../../core/models/flipbase.models';
import type { CreatePurchasePayload } from '../../../core/services/purchase.service';
import type {
  OfflinePurchaseDraft,
  OfflinePurchaseTransferAttempt,
} from '../models/offline-purchase-draft.models';
import { PurchaseBufferService } from './purchase-buffer.service';
import { OfflinePurchaseTransferService } from './offline-purchase-transfer.service';

function setup() {
  const user = signal({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a' });
  const purchase = {
    id: 'purchase-a',
    workspace_id: 'workspace-a',
    purchase_lines: [],
  } as unknown as Purchase;
  const draft: OfflinePurchaseDraft = {
    schemaVersion: 1,
    draftId: 'draft-a',
    requestId: 'request-a',
    userId: 'user-a',
    workspaceId: 'workspace-a',
    revision: 2,
    updatedAt: '2026-10-13T10:00:00Z',
    purchaseId: null,
    state: 'local',
    content: { draftName: '', purchaseDate: '2026-10-13', sellerNote: '', notes: '', lines: [] },
    review: {
      content: { draftName: '', purchaseDate: '2026-10-13', sellerNote: '', notes: '', lines: [] },
      form: { notes: 'original' },
      lines: [],
      costs: [],
      documents: [],
    },
  };
  let attempt: OfflinePurchaseTransferAttempt | null = null;
  const payload: CreatePurchasePayload = {
    type: 'single',
    title: '',
    purchase_date: '2026-10-13',
    purchase_price: 0,
    request_id: draft.requestId,
    notes: 'original',
    purchase_lines: [],
  };
  const auth = { currentUser: user, isLoading: signal(false), sessionReady: Promise.resolve() };
  const access = {
    verifiedUserId: signal('user-a'),
    access: signal([{ workspace_id: 'workspace-a', access_status: 'active' }]),
    refresh: vi.fn(async () => [{ workspace_id: 'workspace-a', access_status: 'active' }]),
  };
  const store = {
    activeContext: vi.fn(async () => ({ userId: 'user-a', workspaceId: 'workspace-a' })),
    list: vi.fn(async () => [draft]),
    get: vi.fn(async () => draft),
    getAttempt: vi.fn(async () => attempt),
    beginAttempt: vi.fn(
      async (_id: string, _revision: number, submitted: CreatePurchasePayload) => {
        if (!attempt)
          attempt = {
            schemaVersion: 1,
            attemptId: 'attempt-a',
            draftId: draft.draftId,
            requestId: draft.requestId,
            userId: draft.userId,
            workspaceId: draft.workspaceId,
            sourceRevision: draft.revision,
            payload: structuredClone(submitted),
            state: 'prepared',
            purchaseId: null,
            leaseOwner: 'tab-a',
            leaseToken: 'token-a',
            leaseExpiresAt: 0,
            review: structuredClone(draft.review),
            documents: draft.review?.documents ?? [],
            uploadedDocumentIds: [],
          };
        return attempt;
      },
    ),
    markUnknown: vi.fn(async () => {
      if (attempt) attempt.state = 'outcome_unknown';
    }),
    markRejected: vi.fn(async () => {
      if (attempt) attempt.state = 'rejected';
    }),
    markTransferred: vi.fn(async (_attempt: OfflinePurchaseTransferAttempt, id: string) => {
      if (attempt) {
        attempt.state = 'confirmed';
        attempt.purchaseId = id;
      }
      draft.purchaseId = id;
      return draft.revision === attempt?.sourceRevision
        ? ('transferred' as const)
        : ('newer_revision' as const);
    }),
    markDocumentUploaded: vi.fn(async (_attempt: OfflinePurchaseTransferAttempt, id: string) => {
      if (attempt) attempt.uploadedDocumentIds = [...(attempt.uploadedDocumentIds ?? []), id];
    }),
    blockDocumentRetry: vi.fn(async () => {
      if (attempt) attempt.documentRetryBlocked = true;
    }),
    remove: vi.fn(async (_draftId: string, _revision?: number) => undefined),
  };
  const purchases = {
    createPurchase: vi.fn(async (_payload: CreatePurchasePayload) => ({
      status: 'success',
      data: purchase,
      error: null,
      reportedBySyncStatus: false,
      problems: [],
    })),
    getPurchaseById: vi.fn(async () => purchase),
  };
  const documents = {
    upload: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  };
  const transfer = Object.create(
    OfflinePurchaseTransferService.prototype,
  ) as OfflinePurchaseTransferService;
  Object.assign(transfer, {
    auth,
    workspace: { currentWorkspace: workspace },
    access,
    store,
    purchases,
    documents,
    leaseOwner: 'tab-a',
    isBusy: signal(false),
    lastCompletion: signal(null),
  });
  const buffer = Object.create(PurchaseBufferService.prototype) as PurchaseBufferService;
  Object.assign(buffer, {
    auth,
    workspace: { currentWorkspace: workspace },
    access,
    store,
    transfer,
    running: false,
    confirmed: signal(null),
    observedConfirmations: new Set(),
    activeDrafts: new Set(),
    observationReleases: new Map(),
  });
  return {
    buffer,
    transfer,
    auth,
    workspace,
    access,
    store,
    purchases,
    documents,
    payload,
    draft,
    purchase,
    attempt: () => attempt,
  };
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('normal purchase buffering', () => {
  it('retains confirmed records when another window holds a shared observer lock', async () => {
    let sharedObservers = 0;
    const request = vi.fn(
      async (
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => Promise<void>,
      ) => {
        if (options.mode === 'shared') {
          sharedObservers++;
          try {
            await callback({ name, mode: 'shared' } as Lock);
          } finally {
            sharedObservers--;
          }
        } else await callback(sharedObservers ? null : ({ name, mode: 'exclusive' } as Lock));
      },
    );
    vi.stubGlobal('navigator', { onLine: true, locks: { request } });
    const first = setup();
    const second = setup();
    Object.assign(second.buffer, { store: first.store, transfer: first.transfer });
    const release = first.buffer.observe(first.draft.draftId);
    await first.transfer.queue(first.draft, first.payload);
    await second.buffer.flush();
    expect(first.store.remove).not.toHaveBeenCalled();
    await first.buffer.flush();
    expect(first.buffer.confirmed()?.purchase.id).toBe(first.purchase.id);
    expect(first.purchases.createPurchase).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(sharedObservers).toBe(0));
    await second.buffer.removeConfirmed(first.draft);
    expect(first.store.remove).toHaveBeenCalledWith(first.draft.draftId, first.draft.revision);
  });

  it('retains confirmed records safely when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const state = setup();
    await state.transfer.queue(state.draft, state.payload);
    await state.buffer.flush();
    expect(state.store.remove).not.toHaveBeenCalled();
    expect(state.buffer.confirmed()?.purchase.id).toBe(state.purchase.id);
  });
  it('restores unsubmitted inputs without submitting them', async () => {
    const { buffer, draft, purchases, store } = setup();
    expect(await buffer.restore()).toBe(draft);
    await buffer.flush();
    expect(store.beginAttempt).not.toHaveBeenCalled();
    expect(purchases.createPurchase).not.toHaveBeenCalled();
  });

  it('replays the exact submitted request while preserving newer edits', async () => {
    const state = setup();
    await state.transfer.queue(state.draft, state.payload);
    state.draft.revision++;
    if (!state.draft.review) throw new Error('Missing review fixture');
    state.draft.review = { ...state.draft.review, form: { notes: 'new unsent edit' } };
    state.payload.notes = 'mutated caller';
    state.purchases.createPurchase.mockRejectedValueOnce(new TypeError('network response lost'));
    await state.buffer.flush();
    await state.buffer.flush();
    expect(state.purchases.createPurchase).toHaveBeenCalledTimes(2);
    expect(state.purchases.createPurchase.mock.calls[0][0]).toEqual(
      state.purchases.createPurchase.mock.calls[1][0],
    );
    expect(state.purchases.createPurchase.mock.calls[1][0]).toMatchObject({
      request_id: 'request-a',
      notes: 'original',
    });
    expect(state.buffer.confirmed()?.completion).toBe('newer_revision');
    expect(state.draft.review.form['notes']).toBe('new unsent edit');
    expect(state.access.refresh).toHaveBeenCalledTimes(2);
  });

  it('stops retrying a terminal authorization failure', async () => {
    const state = setup();
    await state.transfer.queue(state.draft, state.payload);
    state.purchases.createPurchase.mockRejectedValue({ status: 403 });
    await state.buffer.flush();
    await state.buffer.flush();
    expect(state.purchases.createPurchase).toHaveBeenCalledTimes(1);
    expect(state.attempt()?.state).toBe('rejected');
    expect(state.buffer.confirmed()).toBeNull();
  });

  it('adopts another window’s confirmed purchase without a second create', async () => {
    const state = setup();
    await state.transfer.queue(state.draft, state.payload);
    await state.store.markTransferred(
      state.attempt() as OfflinePurchaseTransferAttempt,
      state.purchase.id,
    );
    await state.buffer.flush();
    await state.buffer.flush();
    expect(state.buffer.confirmed()?.purchase.id).toBe(state.purchase.id);
    expect(state.purchases.createPurchase).not.toHaveBeenCalled();
    expect(state.purchases.getPurchaseById).toHaveBeenCalledTimes(1);
  });

  it.each([403, 503])(
    'preserves a confirmed purchase and handles document status %i safely',
    async (status) => {
      const state = setup();
      if (state.draft.review)
        state.draft.review.documents = [
          {
            id: 'document-a',
            file: new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' }),
            documentType: 'invoice',
            status: 'pending',
            error: null,
          },
        ];
      await state.transfer.queue(state.draft, state.payload);
      state.documents.upload.mockResolvedValueOnce({
        error: Object.assign(new Error('upload'), { status }),
      });
      await state.buffer.flush();
      await state.buffer.flush();
      await state.buffer.flush();
      expect(state.purchases.createPurchase).toHaveBeenCalledTimes(1);
      expect(state.attempt()?.purchaseId).toBe(state.purchase.id);
      expect(state.documents.upload).toHaveBeenCalledTimes(status === 403 ? 1 : 2);
      expect(state.buffer.confirmed()?.documentsComplete).toBe(status !== 403);
    },
  );

  it('never reads or replays user A’s buffer as user B', async () => {
    const state = setup();
    await state.transfer.queue(state.draft, state.payload);
    state.auth.currentUser.set({ id: 'user-b' });
    state.access.verifiedUserId.set('user-b');
    expect(await state.buffer.restore()).toBeNull();
    await state.buffer.flush();
    expect(state.purchases.createPurchase).not.toHaveBeenCalled();
  });
});
