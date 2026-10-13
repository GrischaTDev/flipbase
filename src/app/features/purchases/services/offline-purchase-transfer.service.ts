import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import {
  PurchaseService,
  CreatePurchasePayload,
  CreatePurchaseResult,
} from '../../../core/services/purchase.service';
import { OfflinePurchaseDraftStore } from './offline-purchase-draft.store';
import {
  OfflinePurchaseDraft,
  OfflinePurchaseReview,
  OfflinePurchaseTransferAttempt,
} from '../models/offline-purchase-draft.models';
import { isPermanentPurchaseFailure } from '../utils/purchase-buffer-failure';
import { PurchaseDocumentService } from '../../../core/services/purchase-document.service';

@Injectable({ providedIn: 'root' })
export class OfflinePurchaseTransferService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly store = inject(OfflinePurchaseDraftStore);
  private readonly purchases = inject(PurchaseService);
  private readonly documents = inject(PurchaseDocumentService);
  private readonly leaseOwner = crypto.randomUUID();
  readonly isBusy = signal(false);
  readonly lastCompletion = signal<'transferred' | 'newer_revision' | null>(null);
  async loadForReview(draftId: string): Promise<OfflinePurchaseDraft> {
    await this.auth.sessionReady;
    const userId = this.auth.currentUser()?.id;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!userId || !workspaceId) throw new Error('Melde dich zuerst online an.');
    const rows = await this.access.refresh();
    if (
      this.auth.currentUser()?.id !== userId ||
      this.workspace.currentWorkspace()?.id !== workspaceId ||
      !rows.some((row) => row.workspace_id === workspaceId && row.access_status === 'active')
    )
      throw new Error('Der Workspace ist nicht mehr freigegeben.');
    const draft = await this.store.get(draftId);
    if (draft.userId !== userId || draft.workspaceId !== workspaceId)
      throw new Error('Der Entwurf gehört nicht zur aktuellen Anmeldung.');
    return draft;
  }
  async saveReview(
    draft: OfflinePurchaseDraft,
    review: OfflinePurchaseReview,
  ): Promise<OfflinePurchaseDraft> {
    if (
      this.auth.currentUser()?.id !== draft.userId ||
      this.workspace.currentWorkspace()?.id !== draft.workspaceId
    )
      throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
    return this.store.save(draft.draftId, draft.revision, review.content, review);
  }
  getAttempt(draftId: string) {
    return this.store.getAttempt(draftId);
  }
  async queue(
    draft: OfflinePurchaseDraft,
    payload: CreatePurchasePayload,
    finalizeAfterSave = false,
  ): Promise<void> {
    if (
      this.auth.currentUser()?.id !== draft.userId ||
      this.workspace.currentWorkspace()?.id !== draft.workspaceId
    )
      throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
    const attempt = await this.store.beginAttempt(
      draft.draftId,
      draft.revision,
      payload,
      this.leaseOwner,
      finalizeAfterSave,
    );
    await this.store.markUnknown(attempt);
  }
  async reconcile(draft: OfflinePurchaseDraft): Promise<CreatePurchaseResult> {
    const attempt = await this.store.getAttempt(draft.draftId);
    if (!attempt || attempt.state === 'rejected')
      throw new Error('Hier gibt es keinen ungeklärten Versuch.');
    if (attempt.state === 'confirmed' && attempt.purchaseId) {
      await this.loadForReview(draft.draftId);
      const purchase = await this.purchases.getPurchaseById(attempt.purchaseId);
      if (!purchase) throw new Error('Der gespeicherte Einkauf konnte nicht geprüft werden.');
      if (attempt.documentRetryBlocked)
        return {
          status: 'partial',
          data: purchase,
          error: null,
          reportedBySyncStatus: false,
          problems: [],
        };
      await this.uploadDocuments(attempt);
      this.lastCompletion.set(await this.store.markTransferred(attempt, purchase.id));
      return {
        status: 'success',
        data: purchase,
        error: null,
        reportedBySyncStatus: false,
        problems: [],
      };
    }
    return this.transfer(draft, attempt.payload);
  }
  async transfer(
    draft: OfflinePurchaseDraft,
    payload: CreatePurchasePayload,
  ): Promise<CreatePurchaseResult> {
    if (this.isBusy()) throw new Error('Die Übertragung läuft bereits.');
    this.isBusy.set(true);
    this.lastCompletion.set(null);
    try {
      await this.loadForReview(draft.draftId);
      const attempt = await this.store.beginAttempt(
        draft.draftId,
        draft.revision,
        payload,
        this.leaseOwner,
      );
      if (
        this.auth.currentUser()?.id !== draft.userId ||
        this.workspace.currentWorkspace()?.id !== draft.workspaceId
      )
        throw new Error('Die Anmeldung hat sich geändert.');
      let result: CreatePurchaseResult;
      try {
        result = await this.purchases.createPurchase(structuredClone(attempt.payload));
      } catch (reason) {
        if (isPermanentPurchaseFailure(reason)) await this.store.markRejected(attempt);
        else await this.store.markUnknown(attempt);
        throw reason;
      }
      if (result.data?.id) {
        this.lastCompletion.set(await this.store.markTransferred(attempt, result.data.id));
        await this.uploadDocuments({ ...attempt, purchaseId: result.data.id });
        this.lastCompletion.set(await this.store.markTransferred(attempt, result.data.id));
      } else if (!result.reportedBySyncStatus || isPermanentPurchaseFailure(result.error))
        await this.store.markRejected(attempt);
      else await this.store.markUnknown(attempt);
      return result;
    } finally {
      this.isBusy.set(false);
    }
  }
  private async uploadDocuments(attempt: OfflinePurchaseTransferAttempt): Promise<void> {
    if (!attempt.purchaseId) return;
    for (const document of attempt.documents ?? []) {
      if (attempt.uploadedDocumentIds?.includes(document.id)) continue;
      if (
        this.auth.currentUser()?.id !== attempt.userId ||
        this.workspace.currentWorkspace()?.id !== attempt.workspaceId
      )
        throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
      const { error } = await this.documents.upload(
        attempt.purchaseId,
        document.file,
        document.documentType,
        null,
        null,
        attempt.workspaceId,
        document.id,
        attempt.userId,
      );
      if (error) {
        if (isPermanentPurchaseFailure(error)) await this.store.blockDocumentRetry(attempt);
        throw error;
      }
      await this.store.markDocumentUploaded(attempt, document.id);
    }
  }
}
