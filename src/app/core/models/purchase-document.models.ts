import {
  PRIVATE_DOCUMENT_EXTENSIONS,
  PRIVATE_DOCUMENT_MAX_BYTES,
  PrivateDocumentFile,
  privateDocumentExtension,
  validatePrivateDocumentFile,
} from './private-document.models';

export type PurchaseDocumentType = 'invoice' | 'purchase_proof' | 'payment_proof' | 'other';

export interface PurchaseDocument {
  readonly id: string;
  readonly workspace_id: string;
  readonly purchase_id: string;
  readonly document_type: PurchaseDocumentType;
  readonly original_file_name: string;
  readonly storage_path: string;
  readonly mime_type: string;
  readonly file_size: number;
  readonly created_at: string;
  readonly created_by: string | null;
}

export interface PendingPurchaseDocument {
  readonly id: string;
  readonly file: File;
  readonly documentType: PurchaseDocumentType;
  readonly status: 'pending' | 'uploading' | 'error';
  readonly error: string | null;
}

export const PURCHASE_DOCUMENT_MAX_BYTES = PRIVATE_DOCUMENT_MAX_BYTES;
export const PURCHASE_DOCUMENT_EXTENSIONS = PRIVATE_DOCUMENT_EXTENSIONS;
export type PurchaseDocumentFile = PrivateDocumentFile;

export const purchaseDocumentExtension = privateDocumentExtension;
export const validatePurchaseDocumentFile = validatePrivateDocumentFile;

export const PURCHASE_DOCUMENT_BUCKET = 'purchase-documents';

export function purchaseDocumentPath(
  workspaceId: string,
  purchaseId: string,
  documentId: string,
  extension: string,
): string {
  return `${PURCHASE_DOCUMENT_BUCKET}/${workspaceId}/${purchaseId}/${documentId}.${extension}`;
}

export const PURCHASE_DOCUMENT_TYPE_LABELS: Readonly<Record<PurchaseDocumentType, string>> = {
  invoice: 'Rechnung / Quittung',
  purchase_proof: 'Kaufnachweis',
  payment_proof: 'Zahlungsnachweis',
  other: 'Sonstiges',
};
