export type OperatingExpenseStatus = 'open' | 'paid';
export type OperatingExpenseVatRate = 0 | 7 | 19 | null;
export type OperatingExpenseInterval = 'monthly' | 'quarterly' | 'yearly';
export type OperatingExpenseDocumentType = 'invoice' | 'payment_proof' | 'other';

export interface OperatingExpenseCategory {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly default_key: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly created_by: string | null;
}

export interface RecurringOperatingExpense {
  readonly id: string;
  readonly workspace_id: string;
  readonly category_id: string;
  readonly title: string;
  readonly gross_amount: number;
  readonly vat_rate: OperatingExpenseVatRate;
  readonly interval: OperatingExpenseInterval;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly next_due_date: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by: string | null;
}

export interface OperatingExpense {
  readonly id: string;
  readonly workspace_id: string;
  readonly category_id: string;
  readonly recurring_rule_id: string | null;
  readonly recurrence_date: string | null;
  readonly title: string;
  readonly gross_amount: number;
  readonly vat_rate: OperatingExpenseVatRate;
  readonly expense_date: string;
  readonly status: OperatingExpenseStatus;
  readonly due_date: string | null;
  readonly paid_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by: string | null;
}

export interface OperatingExpenseDocument {
  readonly id: string;
  readonly workspace_id: string;
  readonly expense_id: string;
  readonly document_type: OperatingExpenseDocumentType;
  readonly original_file_name: string;
  readonly storage_path: string;
  readonly mime_type: string;
  readonly file_size: number;
  readonly created_at: string;
  readonly created_by: string | null;
}

export interface OperatingExpenseCreateInput {
  readonly categoryId: string;
  readonly title: string;
  readonly grossAmount: number;
  readonly vatRate: OperatingExpenseVatRate;
  readonly expenseDate: string;
  readonly status: OperatingExpenseStatus;
  readonly dueDate: string | null;
  readonly paidAt: string | null;
}

export const OPERATING_EXPENSE_DEFAULT_CATEGORIES = [
  { key: 'shipping_material', label: 'Versandmaterial' },
  { key: 'equipment', label: 'Technik & Geräte' },
  { key: 'software_subscriptions', label: 'Software & Abos' },
  { key: 'hosting_server', label: 'Hosting & Server' },
  { key: 'rent_premises', label: 'Miete & Räume' },
  { key: 'advertising', label: 'Werbung' },
  { key: 'services', label: 'Dienstleistungen' },
  { key: 'fees', label: 'Gebühren' },
  { key: 'office_supplies', label: 'Bürobedarf' },
  { key: 'vehicle_travel', label: 'Fahrzeug & Fahrtkosten' },
  { key: 'insurance', label: 'Versicherungen' },
  { key: 'tax_advice', label: 'Steuer & Beratung' },
  { key: 'other', label: 'Sonstiges' },
] as const;

export const OPERATING_EXPENSE_INTERVAL_LABELS: Readonly<
  Record<OperatingExpenseInterval, string>
> = {
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  yearly: 'Jährlich',
};

export const OPERATING_EXPENSE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const OPERATING_EXPENSE_DOCUMENT_BUCKET = 'operating-expense-documents';

const DOCUMENT_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/xml': ['xml'],
  'text/xml': ['xml'],
};

export interface OperatingExpenseDocumentFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateExpenseTax(
  grossAmount: number,
  vatRate: OperatingExpenseVatRate,
): { netAmount: number | null; vatAmount: number | null } {
  const gross = money(grossAmount);
  if (vatRate === null) return { netAmount: null, vatAmount: null };
  if (vatRate === 0) return { netAmount: gross, vatAmount: 0 };

  const netAmount = money(gross / (1 + vatRate / 100));
  return { netAmount, vatAmount: money(gross - netAmount) };
}

export function operatingExpenseDocumentExtension(
  file: OperatingExpenseDocumentFile,
): string | null {
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  return DOCUMENT_EXTENSIONS[file.type]?.includes(extension) ? extension : null;
}

export function validateOperatingExpenseDocumentFile(
  file: OperatingExpenseDocumentFile,
): Error | null {
  if (!operatingExpenseDocumentExtension(file)) {
    return new Error(`${file.name}: Bitte eine PDF-, JPG-, PNG- oder XML-Datei auswählen.`);
  }
  if (file.size <= 0) return new Error(`${file.name}: Die Datei ist leer.`);
  if (file.size > OPERATING_EXPENSE_DOCUMENT_MAX_BYTES) {
    return new Error(`${file.name}: Die Datei ist größer als 20 MiB.`);
  }
  return null;
}

export function operatingExpenseDocumentPath(
  workspaceId: string,
  expenseId: string,
  documentId: string,
  extension: string,
): string {
  return `${OPERATING_EXPENSE_DOCUMENT_BUCKET}/${workspaceId}/${expenseId}/${documentId}.${extension}`;
}
