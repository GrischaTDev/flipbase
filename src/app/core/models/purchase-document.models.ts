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

/** Gleiche Grenze wie der Bucket; größere Dateien lehnt schon der Browser ab. */
export const PURCHASE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const PURCHASE_DOCUMENT_BUCKET = 'purchase-documents';

/** Erlaubte Typen mit den Endungen, die der Datenbankpfad zulässt. */
export const PURCHASE_DOCUMENT_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/xml': ['xml'],
  'text/xml': ['xml'],
};

export interface PurchaseDocumentFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export function purchaseDocumentExtension(file: PurchaseDocumentFile): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return PURCHASE_DOCUMENT_EXTENSIONS[file.type]?.includes(extension) ? extension : null;
}

/** Prüft Typ, Endung und Größe, bevor eine Datei den Rechner verlässt. */
export function validatePurchaseDocumentFile(file: PurchaseDocumentFile): Error | null {
  if (!purchaseDocumentExtension(file)) {
    return new Error(`${file.name}: Bitte eine PDF-, JPG-, PNG- oder XML-Datei auswählen.`);
  }
  if (file.size <= 0) return new Error(`${file.name}: Die Datei ist leer.`);
  if (file.size > PURCHASE_DOCUMENT_MAX_BYTES) {
    return new Error(`${file.name}: Die Datei ist größer als 20 MiB.`);
  }
  return null;
}

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
