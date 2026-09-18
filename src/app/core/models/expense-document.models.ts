import {
  privateDocumentExtension,
  PrivateDocumentFile,
  validatePrivateDocumentFile,
} from './private-document.models';

export type ExpenseDocumentType = 'invoice' | 'receipt' | 'payment_proof' | 'other';

export interface ExpenseDocument {
  readonly id: string;
  readonly workspace_id: string;
  readonly expense_id: string;
  readonly document_type: ExpenseDocumentType;
  readonly original_file_name: string;
  readonly storage_path: string;
  readonly mime_type: string;
  readonly file_size: number;
  readonly created_at: string;
  readonly created_by: string | null;
}

export const EXPENSE_DOCUMENT_BUCKET = 'expense-documents';

export function expenseDocumentExtension(file: PrivateDocumentFile): string | null {
  return privateDocumentExtension(file);
}

export function validateExpenseDocumentFile(file: PrivateDocumentFile): Error | null {
  return validatePrivateDocumentFile(file);
}

export function expenseDocumentPath(
  workspaceId: string,
  expenseId: string,
  documentId: string,
  extension: string,
): string {
  return `${EXPENSE_DOCUMENT_BUCKET}/${workspaceId}/${expenseId}/${documentId}.${extension}`;
}

export const EXPENSE_DOCUMENT_TYPE_LABELS: Readonly<Record<ExpenseDocumentType, string>> = {
  invoice: 'Rechnung',
  receipt: 'Quittung',
  payment_proof: 'Zahlungsnachweis',
  other: 'Sonstiges',
};
