import type { ItemCondition } from '../../../core/models/flipbase.models';
import type { CreatePurchasePayload } from '../../../core/services/purchase.service';
import type { PendingPurchaseDocument } from '../../../core/models/purchase-document.models';

export interface OfflinePurchaseContext {
  schemaVersion: 1;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  verifiedAt: number;
  locked: boolean;
}
export interface OfflinePurchaseContent {
  draftName: string;
  purchaseDate: string;
  sellerNote: string;
  notes: string;
  lines: OfflinePurchaseLine[];
}
export interface OfflinePurchaseLine {
  lineId: string;
  title: string;
  ean: string | null;
  condition: ItemCondition;
  quantity: number;
  unitPriceCents: number | null;
}
export type OfflinePurchaseDraftState =
  'local' | 'review_required' | 'transferring' | 'outcome_unknown' | 'transferred';
export interface OfflinePurchaseDraft {
  schemaVersion: 1;
  draftId: string;
  requestId: string;
  userId: string;
  workspaceId: string;
  revision: number;
  updatedAt: string;
  content: OfflinePurchaseContent;
  state: OfflinePurchaseDraftState;
  purchaseId: string | null;
  review: OfflinePurchaseReview | null;
}
export interface OfflinePurchaseReview {
  content: OfflinePurchaseContent;
  // Vollständige Onlineergänzungen; dieser Stand ist noch kein unveränderlicher Serverversuch.
  form: Record<string, unknown>;
  lines: readonly unknown[];
  costs: readonly unknown[];
  documents?: readonly PendingPurchaseDocument[];
}
export interface OfflinePurchaseTransferAttempt {
  schemaVersion: 1;
  attemptId: string;
  draftId: string;
  requestId: string;
  userId: string;
  workspaceId: string;
  sourceRevision: number;
  payload: CreatePurchasePayload;
  state: 'prepared' | 'outcome_unknown' | 'confirmed' | 'rejected';
  purchaseId: string | null;
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAt: number;
  documents?: readonly PendingPurchaseDocument[];
  uploadedDocumentIds?: readonly string[];
  finalizeAfterSave?: boolean;
  review?: OfflinePurchaseReview | null;
  documentRetryBlocked?: boolean;
}
export const offlineContextLifetime = 7 * 24 * 60 * 60 * 1000;
export const offlineDraftLimit = 100;
export const offlineStorageLimit = 10 * 1024 * 1024;
