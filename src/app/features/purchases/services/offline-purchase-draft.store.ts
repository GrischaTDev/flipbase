import { Injectable } from '@angular/core';
import {
  OfflinePurchaseContent,
  OfflinePurchaseContext,
  OfflinePurchaseDraft,
  OfflinePurchaseReview,
  OfflinePurchaseTransferAttempt,
  offlineContextLifetime,
  offlineDraftLimit,
  offlineStorageLimit,
} from '../models/offline-purchase-draft.models';
import {
  isOfflineIdentifier,
  validateOfflineContent,
  validateOfflineDraft,
} from '../utils/offline-purchase-validation';
import type { CreatePurchasePayload } from '../../../core/services/purchase.service';
import {
  restorePurchaseFiles,
  serializePurchaseDocuments,
  serializePurchaseReview,
} from '../utils/purchase-buffer-files';

const lockKey = 'flipbase_purchase_context_locked';
type StoreName = 'contexts' | 'drafts' | 'transfers';
class OfflineContextChangedError extends Error {}
function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Lokaler Speicherfehler.'));
  });
}

@Injectable({ providedIn: 'root' })
export class OfflinePurchaseDraftStore {
  private database: Promise<IDBDatabase> | null = null;
  private expectedUserId: string | null = null;
  private epoch = 0;
  private isLocked = false;
  private workspaceId: string | null = null;
  noteIdentity(userId: string): void {
    if (this.expectedUserId !== userId) {
      this.expectedUserId = userId;
      this.epoch++;
    }
  }
  async lock(): Promise<void> {
    this.isLocked = true;
    this.epoch++;
    localStorage.setItem(lockKey, 'locked');
    await this.transaction(['contexts'], 'readwrite', async (transaction) => {
      const contexts = transaction.objectStore('contexts');
      const active = (await requestResult(contexts.get('active'))) as
        OfflinePurchaseContext | undefined;
      if (active) await requestResult(contexts.put({ ...active, locked: true }, 'active'));
    });
  }
  async registerContext(userId: string, workspaceId: string, workspaceName: string): Promise<void> {
    if (!isOfflineIdentifier(userId) || !isOfflineIdentifier(workspaceId))
      throw new Error('Ungültige lokale Zuordnung.');
    this.noteIdentity(userId);
    if (this.workspaceId !== workspaceId) {
      this.workspaceId = workspaceId;
      this.epoch++;
    }
    const epoch = this.epoch;
    const context: OfflinePurchaseContext = {
      schemaVersion: 1,
      userId,
      workspaceId,
      workspaceName,
      verifiedAt: Date.now(),
      locked: false,
    };
    await this.transaction(['contexts'], 'readwrite', async (transaction) => {
      if (epoch !== this.epoch) throw new Error('Die Anmeldung hat sich geändert.');
      await requestResult(transaction.objectStore('contexts').put(context, [userId, workspaceId]));
      await requestResult(transaction.objectStore('contexts').put(context, 'active'));
    });
    if (epoch === this.epoch) {
      localStorage.removeItem(lockKey);
      this.isLocked = false;
    }
  }
  activeContext(): Promise<OfflinePurchaseContext> {
    return this.transaction(['contexts'], 'readonly', (transaction) =>
      this.requireContext(transaction),
    );
  }
  async selectContext(workspaceId: string): Promise<void> {
    await this.transaction(['contexts'], 'readwrite', async (transaction) => {
      const active = await this.requireContext(transaction);
      const context = (await requestResult(
        transaction.objectStore('contexts').get([active.userId, workspaceId]),
      )) as OfflinePurchaseContext | undefined;
      this.validateContext(context);
      await requestResult(transaction.objectStore('contexts').put(context, 'active'));
    });
  }
  list(): Promise<OfflinePurchaseDraft[]> {
    return this.transaction(['contexts', 'drafts'], 'readonly', async (transaction) => {
      const context = await this.requireContext(transaction);
      const drafts = (await requestResult(
        transaction.objectStore('drafts').getAll(),
      )) as OfflinePurchaseDraft[];
      return drafts
        .filter(
          (draft) => draft.userId === context.userId && draft.workspaceId === context.workspaceId,
        )
        .map((draft) => {
          validateOfflineDraft(draft);
          return draft;
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
  }
  exportCurrent(unsaved: { draftId: string; content: OfflinePurchaseContent } | null = null) {
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readonly',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        const drafts = (
          (await requestResult(
            transaction.objectStore('drafts').getAll(),
          )) as OfflinePurchaseDraft[]
        ).filter(
          (draft) => draft.userId === context.userId && draft.workspaceId === context.workspaceId,
        );
        const attempts = (
          (await requestResult(
            transaction.objectStore('transfers').getAll(),
          )) as OfflinePurchaseTransferAttempt[]
        ).filter(
          (attempt) =>
            attempt.userId === context.userId && attempt.workspaceId === context.workspaceId,
        );
        if (unsaved && !drafts.some((draft) => draft.draftId === unsaved.draftId))
          throw new Error('Die Eingaben gehören nicht zum ausgewählten Workspace.');
        return { schemaVersion: 1, context, drafts, attempts, unsaved };
      },
    );
  }
  get(draftId: string): Promise<OfflinePurchaseDraft> {
    return this.transaction(['contexts', 'drafts'], 'readonly', async (transaction) =>
      this.requireDraft(transaction, await this.requireContext(transaction), draftId),
    );
  }
  async create(content: OfflinePurchaseContent): Promise<OfflinePurchaseDraft> {
    validateOfflineContent(content);
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        const draft: OfflinePurchaseDraft = {
          schemaVersion: 1,
          draftId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          userId: context.userId,
          workspaceId: context.workspaceId,
          revision: 1,
          updatedAt: new Date().toISOString(),
          content,
          state: 'local',
          purchaseId: null,
          review: null,
        };
        await this.checkCapacity(transaction, draft, true);
        await requestResult(transaction.objectStore('drafts').add(draft));
        return draft;
      },
    );
  }
  async save(
    draftId: string,
    expectedRevision: number,
    content: OfflinePurchaseContent,
    review?: OfflinePurchaseReview,
  ): Promise<OfflinePurchaseDraft> {
    validateOfflineContent(content);
    const storedReview = await serializePurchaseReview(review ?? (await this.get(draftId)).review);
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const draft = await this.requireDraft(
          transaction,
          await this.requireContext(transaction),
          draftId,
        );
        if (draft.revision !== expectedRevision)
          throw new Error(
            'Dieser Entwurf wurde in einem anderen Fenster geändert. Bitte sichere deine Eingaben und lade ihn erneut.',
          );
        const updated: OfflinePurchaseDraft = {
          ...draft,
          content,
          review: storedReview,
          revision: draft.revision + 1,
          updatedAt: new Date().toISOString(),
          state: draft.state === 'local' ? 'local' : 'review_required',
        };
        await this.checkCapacity(transaction, updated);
        await requestResult(transaction.objectStore('drafts').put(updated));
        return updated;
      },
    );
  }
  async remove(draftId: string, expectedRevision?: number): Promise<void> {
    await this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        const draft = await this.requireDraft(transaction, context, draftId);
        if (expectedRevision !== undefined && draft.revision !== expectedRevision)
          throw new Error('Die Eingaben wurden in einem anderen Fenster geändert.');
        const attempt = (await requestResult(
          transaction
            .objectStore('transfers')
            .get([context.userId, context.workspaceId, draft.requestId]),
        )) as OfflinePurchaseTransferAttempt | undefined;
        if (attempt && attempt.state !== 'confirmed' && attempt.state !== 'rejected')
          throw new Error('Der Ausgang der Übertragung muss vor dem Verwerfen geklärt werden.');
        await requestResult(
          transaction.objectStore('drafts').delete([context.userId, context.workspaceId, draftId]),
        );
        if (attempt)
          await requestResult(
            transaction
              .objectStore('transfers')
              .delete([context.userId, context.workspaceId, draft.requestId]),
          );
      },
    );
  }
  async attachOnlinePurchase(
    source: OfflinePurchaseDraft,
    purchaseId: string,
    uploadedDocumentIds?: readonly string[],
  ): Promise<void> {
    if (!isOfflineIdentifier(purchaseId)) throw new Error('Ungültige Einkaufsbestätigung.');
    await this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        if (context.userId !== source.userId || context.workspaceId !== source.workspaceId)
          throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
        const draft = await this.requireDraft(transaction, context, source.draftId);
        if (
          draft.requestId !== source.requestId ||
          (draft.purchaseId && draft.purchaseId !== purchaseId)
        )
          throw new Error('Die Einkaufsbestätigung gehört zu einer anderen Erfassung.');
        const transfers = transaction.objectStore('transfers');
        const attempt = (await requestResult(
          transfers.get([context.userId, context.workspaceId, source.requestId]),
        )) as OfflinePurchaseTransferAttempt | undefined;
        if (
          attempt &&
          attempt.state !== 'rejected' &&
          (attempt.state !== 'confirmed' || attempt.purchaseId !== purchaseId)
        )
          throw new Error('Der ursprüngliche Speicherversuch muss zuerst geprüft werden.');
        const documents =
          draft.review?.documents?.filter(
            (document) => !uploadedDocumentIds?.includes(document.id),
          ) ?? [];
        await requestResult(
          transaction.objectStore('drafts').put({
            ...draft,
            purchaseId,
            review: draft.review ? { ...draft.review, documents } : null,
            state:
              uploadedDocumentIds && !documents.length && draft.revision === source.revision
                ? 'transferred'
                : 'review_required',
          }),
        );
        if (attempt?.state === 'rejected')
          await requestResult(
            transfers.delete([context.userId, context.workspaceId, source.requestId]),
          );
        else if (attempt && uploadedDocumentIds)
          await requestResult(
            transfers.put({
              ...attempt,
              documents: [],
              review: attempt.review ? { ...attempt.review, documents: [] } : null,
              uploadedDocumentIds: [
                ...new Set([...(attempt.uploadedDocumentIds ?? []), ...uploadedDocumentIds]),
              ],
              documentRetryBlocked: false,
            }),
          );
      },
    );
  }
  async beginAttempt(
    draftId: string,
    expectedRevision: number,
    payload: CreatePurchasePayload,
    leaseOwner: string,
    finalizeAfterSave = false,
  ): Promise<OfflinePurchaseTransferAttempt> {
    const sourceDraft = await this.get(draftId);
    const storedReview = await serializePurchaseReview(sourceDraft.review);
    const sourceAttempt = await this.getAttempt(draftId);
    const storedDocuments = sourceAttempt
      ? await serializePurchaseDocuments(sourceAttempt.documents ?? [])
      : (storedReview?.documents ?? []);
    const storedAttemptReview = sourceAttempt
      ? await serializePurchaseReview(sourceAttempt.review ?? null)
      : storedReview;
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        const draft = await this.requireDraft(transaction, context, draftId);
        if (draft.revision !== sourceDraft.revision)
          throw new Error('Die Eingaben wurden in einem anderen Fenster geändert.');
        if (draft.purchaseId)
          throw new Error(
            'Dieser Entwurf gehört bereits zu einem Einkauf. Prüfe Ergänzungen dort.',
          );
        const transfers = transaction.objectStore('transfers');
        let previous = (await requestResult(
          transfers.get([context.userId, context.workspaceId, draft.requestId]),
        )) as OfflinePurchaseTransferAttempt | undefined;
        if (
          previous &&
          (previous.schemaVersion !== 1 ||
            previous.draftId !== draftId ||
            previous.payload.request_id !== draft.requestId)
        )
          throw new Error('Der lokale Übertragungsversuch ist beschädigt.');
        if (previous?.state === 'confirmed')
          throw new Error('Die Übertragung wurde bereits bestätigt.');
        if (previous?.state === 'rejected') {
          if (sourceAttempt?.state !== 'rejected')
            throw new Error(
              'Der Speicherversuch wurde inzwischen abgelehnt. Prüfe deine Angaben erneut.',
            );
          previous = undefined;
        }
        if (previous && previous.attemptId !== sourceAttempt?.attemptId)
          throw new Error('Ein anderes Fenster hat das Speichern übernommen.');
        if (previous && previous.leaseExpiresAt > Date.now() && previous.leaseOwner !== leaseOwner)
          throw new Error(
            'Ein anderes Fenster überträgt diesen Entwurf. Warte kurz und prüfe erneut.',
          );
        if (!previous && draft.revision !== expectedRevision)
          throw new Error('Der Entwurf wurde geändert. Bitte erneut prüfen.');
        if (!previous && payload.request_id !== draft.requestId)
          throw new Error('Die Anlegekennung stimmt nicht mit dem Entwurf überein.');
        const attempt: OfflinePurchaseTransferAttempt = {
          ...(previous
            ? { ...previous, documents: storedDocuments, review: storedAttemptReview }
            : {
                schemaVersion: 1,
                attemptId: crypto.randomUUID(),
                draftId,
                requestId: draft.requestId,
                userId: context.userId,
                workspaceId: context.workspaceId,
                sourceRevision: draft.revision,
                payload: structuredClone(payload),
                state: 'prepared',
                purchaseId: null,
                documents: storedReview?.documents ?? [],
                review: storedReview,
                uploadedDocumentIds: [],
                finalizeAfterSave,
              }),
          leaseOwner,
          leaseToken: crypto.randomUUID(),
          leaseExpiresAt: Date.now() + 120000,
        };
        await this.checkCapacity(transaction, draft, false, attempt);
        await requestResult(transfers.put(attempt));
        await requestResult(
          transaction.objectStore('drafts').put({
            ...draft,
            review: storedReview,
            state: draft.revision === attempt.sourceRevision ? 'transferring' : 'review_required',
          }),
        );
        return attempt;
      },
    );
  }
  async getAttempt(draftId: string): Promise<OfflinePurchaseTransferAttempt | null> {
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readonly',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        const draft = await this.requireDraft(transaction, context, draftId);
        return (
          ((await requestResult(
            transaction
              .objectStore('transfers')
              .get([context.userId, context.workspaceId, draft.requestId]),
          )) as OfflinePurchaseTransferAttempt | undefined) ?? null
        );
      },
    );
  }
  async markUnknown(attempt: OfflinePurchaseTransferAttempt): Promise<void> {
    await this.completeAttempt(attempt, null);
  }
  async markRejected(attempt: OfflinePurchaseTransferAttempt): Promise<void> {
    await this.completeAttempt(attempt, null, true);
  }
  async markDocumentUploaded(
    attempt: OfflinePurchaseTransferAttempt,
    documentId: string,
  ): Promise<void> {
    await this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        if (context.userId !== attempt.userId || context.workspaceId !== attempt.workspaceId)
          throw new Error('Die Anmeldung hat sich geändert.');
        const transfers = transaction.objectStore('transfers');
        const stored = (await requestResult(
          transfers.get([context.userId, context.workspaceId, attempt.requestId]),
        )) as OfflinePurchaseTransferAttempt | undefined;
        if (
          !stored ||
          stored.attemptId !== attempt.attemptId ||
          stored.leaseToken !== attempt.leaseToken
        )
          throw new Error('Ein anderes Fenster hat das Speichern übernommen.');
        const uploaded = [...new Set([...(stored.uploadedDocumentIds ?? []), documentId])];
        await requestResult(transfers.put({ ...stored, uploadedDocumentIds: uploaded }));
        const draft = await this.requireDraft(transaction, context, attempt.draftId);
        await requestResult(
          transaction.objectStore('drafts').put({
            ...draft,
            review: draft.review
              ? {
                  ...draft.review,
                  documents: draft.review.documents?.filter(
                    (document) => document.id !== documentId,
                  ),
                }
              : null,
          }),
        );
      },
    );
  }
  async blockDocumentRetry(attempt: OfflinePurchaseTransferAttempt): Promise<void> {
    await this.transaction(['contexts', 'transfers'], 'readwrite', async (transaction) => {
      const context = await this.requireContext(transaction);
      if (context.userId !== attempt.userId || context.workspaceId !== attempt.workspaceId)
        throw new Error('Die Anmeldung hat sich geändert.');
      const transfers = transaction.objectStore('transfers');
      const stored = (await requestResult(
        transfers.get([context.userId, context.workspaceId, attempt.requestId]),
      )) as OfflinePurchaseTransferAttempt | undefined;
      if (
        !stored ||
        stored.attemptId !== attempt.attemptId ||
        stored.leaseToken !== attempt.leaseToken
      )
        throw new Error('Das Speichern wurde in einem anderen Fenster fortgesetzt.');
      await requestResult(transfers.put({ ...stored, documentRetryBlocked: true }));
    });
  }
  async markTransferred(
    attempt: OfflinePurchaseTransferAttempt,
    purchaseId: string,
  ): Promise<'transferred' | 'newer_revision'> {
    if (!isOfflineIdentifier(purchaseId)) throw new Error('Ungültige Einkaufsbestätigung.');
    return this.completeAttempt(attempt, purchaseId);
  }
  private completeAttempt(
    attempt: OfflinePurchaseTransferAttempt,
    purchaseId: string | null,
    rejected = false,
  ): Promise<'transferred' | 'newer_revision'> {
    return this.transaction(
      ['contexts', 'drafts', 'transfers'],
      'readwrite',
      async (transaction) => {
        const context = await this.requireContext(transaction);
        if (context.userId !== attempt.userId || context.workspaceId !== attempt.workspaceId)
          throw new Error('Die Anmeldung oder der Workspace hat sich geändert.');
        const draft = await this.requireDraft(transaction, context, attempt.draftId);
        const transfers = transaction.objectStore('transfers');
        const stored = (await requestResult(
          transfers.get([context.userId, context.workspaceId, attempt.requestId]),
        )) as OfflinePurchaseTransferAttempt | undefined;
        if (
          !stored ||
          (stored.state === 'confirmed' && (!purchaseId || stored.purchaseId !== purchaseId)) ||
          stored.attemptId !== attempt.attemptId ||
          stored.leaseToken !== attempt.leaseToken ||
          stored.sourceRevision !== attempt.sourceRevision ||
          draft.requestId !== attempt.requestId
        )
          throw new Error(
            'Ein anderes Fenster hat die Übertragung übernommen. Bitte erneut prüfen.',
          );
        const newer = draft.revision !== stored.sourceRevision;
        const documentsComplete =
          purchaseId &&
          !(stored.documents ?? []).some(
            (document) => !stored.uploadedDocumentIds?.includes(document.id),
          );
        await requestResult(
          transfers.put({
            ...stored,
            documents: documentsComplete ? [] : stored.documents,
            review:
              documentsComplete && stored.review
                ? { ...stored.review, documents: [] }
                : stored.review,
            state: purchaseId ? 'confirmed' : rejected ? 'rejected' : 'outcome_unknown',
            purchaseId,
            leaseExpiresAt: 0,
          }),
        );
        await requestResult(
          transaction.objectStore('drafts').put({
            ...draft,
            purchaseId,
            state: newer
              ? 'review_required'
              : purchaseId
                ? stored.documents?.some(
                    (document) => !stored.uploadedDocumentIds?.includes(document.id),
                  )
                  ? 'transferring'
                  : 'transferred'
                : 'outcome_unknown',
          }),
        );
        return newer ? 'newer_revision' : 'transferred';
      },
    );
  }
  private validateContext(
    context: OfflinePurchaseContext | undefined,
  ): asserts context is OfflinePurchaseContext {
    if (
      !context ||
      context.schemaVersion !== 1 ||
      context.locked ||
      this.isLocked ||
      localStorage.getItem(lockKey) === 'locked' ||
      (this.expectedUserId && context.userId !== this.expectedUserId) ||
      !isOfflineIdentifier(context.userId) ||
      !isOfflineIdentifier(context.workspaceId) ||
      !Number.isFinite(context.verifiedAt) ||
      context.verifiedAt > Date.now() ||
      Date.now() - context.verifiedAt > offlineContextLifetime
    )
      throw new Error(
        'Melde dich zuerst online im vorbereiteten Workspace an. Lokale Entwürfe bleiben auf diesem Gerät erhalten.',
      );
  }
  private async requireContext(transaction: IDBTransaction): Promise<OfflinePurchaseContext> {
    const context = (await requestResult(transaction.objectStore('contexts').get('active'))) as
      OfflinePurchaseContext | undefined;
    this.validateContext(context);
    return context;
  }
  private async requireDraft(
    transaction: IDBTransaction,
    context: OfflinePurchaseContext,
    draftId: string,
  ): Promise<OfflinePurchaseDraft> {
    if (!isOfflineIdentifier(draftId)) throw new Error('Ungültige Entwurfskennung.');
    const draft = (await requestResult(
      transaction.objectStore('drafts').get([context.userId, context.workspaceId, draftId]),
    )) as OfflinePurchaseDraft | undefined;
    if (!draft || draft.userId !== context.userId || draft.workspaceId !== context.workspaceId)
      throw new Error('Der Entwurf gehört nicht zu diesem lokalen Kontext.');
    validateOfflineDraft(draft);
    return draft;
  }
  private async checkCapacity(
    transaction: IDBTransaction,
    draft: OfflinePurchaseDraft,
    adding = false,
    attempt?: OfflinePurchaseTransferAttempt,
  ): Promise<void> {
    const drafts = (await requestResult(
      transaction.objectStore('drafts').getAll(),
    )) as OfflinePurchaseDraft[];
    const transfers = (await requestResult(
      transaction.objectStore('transfers').getAll(),
    )) as OfflinePurchaseTransferAttempt[];
    if (
      adding &&
      drafts.filter((entry) => entry.state !== 'transferred').length >= offlineDraftLimit
    )
      throw new Error(
        'Der verfügbare Zwischenspeicher reicht nicht aus. Deine Eingaben bleiben in der Maske erhalten.',
      );
    const nextDrafts = [...drafts.filter((entry) => entry.draftId !== draft.draftId), draft];
    const nextTransfers = attempt
      ? [
          ...transfers.filter(
            (entry) =>
              entry.userId !== attempt.userId ||
              entry.workspaceId !== attempt.workspaceId ||
              entry.requestId !== attempt.requestId,
          ),
          attempt,
        ]
      : transfers;
    const files = new Map<string, number>();
    for (const entry of [
      ...nextDrafts.map((entry) => entry.review?.documents ?? []),
      ...nextTransfers.map((entry) => entry.documents ?? []),
    ])
      for (const document of entry)
        files.set(document.id, Math.max(files.get(document.id) ?? 0, document.file.size));
    if (
      new TextEncoder().encode(
        JSON.stringify([
          nextDrafts.filter((entry) => entry.state !== 'transferred'),
          nextTransfers.filter((entry) =>
            nextDrafts.some(
              (draft) =>
                draft.requestId === entry.requestId &&
                draft.userId === entry.userId &&
                draft.workspaceId === entry.workspaceId &&
                draft.state !== 'transferred',
            ),
          ),
        ]),
      ).byteLength > offlineStorageLimit ||
      [...files.values()].reduce((total, size) => total + size, 0) > 100 * 1024 * 1024
    )
      throw new Error(
        'Der verfügbare Zwischenspeicher reicht nicht aus. Deine Eingaben bleiben in der Maske erhalten.',
      );
  }
  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Dieser Browser erlaubt keinen lokalen Entwurfsspeicher.'));
        return;
      }
      const request = indexedDB.open('flipbase-purchase-drafts', 1);
      let failed = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('contexts');
        database.createObjectStore('drafts', { keyPath: ['userId', 'workspaceId', 'draftId'] });
        database.createObjectStore('transfers', {
          keyPath: ['userId', 'workspaceId', 'requestId'],
        });
      };
      request.onblocked = () => {
        failed = true;
        reject(new Error('Schließe ältere Flipbase-Fenster, um den lokalen Speicher zu öffnen.'));
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Lokaler Speicher nicht verfügbar.'));
      request.onsuccess = () => {
        if (failed) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          this.database = null;
        };
        resolve(request.result);
      };
    }).catch((reason: unknown) => {
      this.database = null;
      throw reason;
    });
    return this.database;
  }
  private async transaction<Result>(
    stores: StoreName[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<Result>,
    retry = false,
  ): Promise<Result> {
    const database = await this.open();
    const epoch = this.epoch;
    const transaction = database.transaction(stores, mode);
    const committed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Die lokale Sicherung wurde abgebrochen.'));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Die lokale Sicherung ist fehlgeschlagen.'));
    });
    try {
      const result = await operation(transaction);
      if (epoch !== this.epoch)
        throw new OfflineContextChangedError(
          'Die Anmeldung hat sich während der lokalen Sicherung geändert.',
        );
      await committed;
      if (epoch !== this.epoch)
        throw new OfflineContextChangedError(
          'Die Anmeldung hat sich während der lokalen Sicherung geändert.',
        );
      return restorePurchaseFiles(result);
    } catch (reason) {
      try {
        transaction.abort();
      } catch {
        /* Die Transaktion kann bereits beendet sein. */
      }
      await committed.catch(() => undefined);
      if (mode === 'readonly' && !retry && reason instanceof OfflineContextChangedError)
        return this.transaction(stores, mode, operation, true);
      throw reason;
    }
  }
}
