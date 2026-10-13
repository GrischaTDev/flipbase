import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import type { Purchase } from '../../../core/models/flipbase.models';
import { OfflinePurchaseDraftStore } from './offline-purchase-draft.store';
import { OfflinePurchaseTransferService } from './offline-purchase-transfer.service';
import type { OfflinePurchaseDraft } from '../models/offline-purchase-draft.models';
import type { OfflinePurchaseReview } from '../models/offline-purchase-draft.models';

@Injectable({ providedIn: 'root' })
export class PurchaseBufferService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly store = inject(OfflinePurchaseDraftStore);
  private readonly transfer = inject(OfflinePurchaseTransferService);
  private readonly destroyRef = inject(DestroyRef);
  private running = false;
  private readonly observedConfirmations = new Set<string>();
  private readonly activeDrafts = new Set<string>();
  private readonly observationReleases = new Map<string, () => void>();
  readonly confirmed = signal<{
    draftId: string;
    purchase: Purchase;
    completion: 'transferred' | 'newer_revision';
    review: OfflinePurchaseReview | null;
    finalizeAfterSave: boolean;
    uploadedDocumentIds: readonly string[];
    documentsComplete: boolean;
  } | null>(null);
  constructor() {
    effect(() => {
      this.auth.currentUser();
      this.auth.isLoading();
      this.workspace.currentWorkspace();
      this.access.access();
      this.access.verifiedUserId();
      untracked(() => void this.flush());
    });
    const resume = () => void this.flush();
    window.addEventListener('online', resume);
    const timer = setInterval(resume, 30000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    this.destroyRef.onDestroy(() => window.removeEventListener('online', resume));
  }
  observe(draftId: string): () => void {
    this.activeDrafts.add(draftId);
    let isActive = true;
    let releaseLock = () => undefined as void;
    const held = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    if (navigator.locks)
      void navigator.locks
        .request(`flipbase-purchase-buffer:${draftId}`, { mode: 'shared' }, async () => {
          if (isActive) await held;
        })
        .catch(() => undefined);
    const release = () => {
      isActive = false;
      releaseLock();
      this.activeDrafts.delete(draftId);
      if (this.observationReleases.get(draftId) === release)
        this.observationReleases.delete(draftId);
    };
    this.observationReleases.set(draftId, release);
    return release;
  }
  async removeConfirmed(draft: OfflinePurchaseDraft): Promise<void> {
    this.observationReleases.get(draft.draftId)?.();
    await this.removeUnobservedConfirmed(draft);
  }
  private async removeUnobservedConfirmed(draft: OfflinePurchaseDraft): Promise<void> {
    if (!navigator.locks || this.activeDrafts.has(draft.draftId)) return;
    await navigator.locks.request(
      `flipbase-purchase-buffer:${draft.draftId}`,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (lock) await this.store.remove(draft.draftId, draft.revision);
      },
    );
  }
  async restore(): Promise<OfflinePurchaseDraft | null> {
    await this.auth.sessionReady;
    const userId = this.auth.currentUser()?.id;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!userId || !workspaceId) return null;
    const context = await this.store.activeContext();
    if (context.userId !== userId || context.workspaceId !== workspaceId) return null;
    return (
      (await this.store.list()).find((draft) => draft.review && draft.state !== 'transferred') ??
      null
    );
  }
  async create(purchaseDate: string): Promise<OfflinePurchaseDraft> {
    const context = await this.store.activeContext();
    if (
      this.auth.currentUser()?.id !== context.userId ||
      this.workspace.currentWorkspace()?.id !== context.workspaceId
    )
      throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
    return this.store.create({ draftName: '', purchaseDate, sellerNote: '', notes: '', lines: [] });
  }
  async flush(): Promise<void> {
    if (this.running || navigator.onLine === false || this.auth.isLoading()) return;
    const userId = this.auth.currentUser()?.id;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (
      !userId ||
      !workspaceId ||
      this.access.verifiedUserId() !== userId ||
      !this.access
        .access()
        .some((row) => row.workspace_id === workspaceId && row.access_status === 'active')
    )
      return;
    this.running = true;
    try {
      const context = await this.store.activeContext();
      if (context.userId !== userId || context.workspaceId !== workspaceId) return;
      for (const draft of await this.store.list()) {
        if (
          this.auth.currentUser()?.id !== userId ||
          this.workspace.currentWorkspace()?.id !== workspaceId
        )
          return;
        const attempt = await this.store.getAttempt(draft.draftId);
        if (!attempt || attempt.state === 'rejected') continue;
        const confirmationKey = `${attempt.attemptId}:${draft.revision}:${attempt.uploadedDocumentIds?.length ?? 0}:${Boolean(attempt.documentRetryBlocked)}`;
        if (attempt.state === 'confirmed' && this.observedConfirmations.has(confirmationKey))
          continue;
        try {
          const result = await this.transfer.reconcile(draft);
          if (
            result.data &&
            this.auth.currentUser()?.id === userId &&
            this.workspace.currentWorkspace()?.id === workspaceId
          ) {
            const completedAttempt = await this.store.getAttempt(draft.draftId);
            this.observedConfirmations.add(confirmationKey);
            this.confirmed.set({
              draftId: draft.draftId,
              purchase: result.data,
              completion: this.transfer.lastCompletion() ?? 'newer_revision',
              review: attempt.review ?? null,
              finalizeAfterSave: attempt.finalizeAfterSave ?? false,
              uploadedDocumentIds: completedAttempt?.uploadedDocumentIds ?? [],
              documentsComplete: result.status === 'success',
            });
            if (
              result.status === 'success' &&
              completedAttempt?.sourceRevision === draft.revision &&
              !this.activeDrafts.has(draft.draftId)
            )
              await this.removeUnobservedConfirmed(draft);
          }
        } catch {
          // Ein fehlgeschlagener Versuch bleibt unverändert und wird erst nach erneuter Onlineprüfung wieder aufgenommen.
        }
      }
    } catch {
      // Ohne gültigen Gerätekontext gibt es keinen automatischen Versand.
    } finally {
      this.running = false;
    }
  }
}
