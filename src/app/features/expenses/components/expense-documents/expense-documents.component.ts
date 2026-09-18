import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  OperatingExpenseDocument,
  OperatingExpenseDocumentType,
} from '../../../../core/models/operating-expense.models';
import { OperatingExpenseDocumentService } from '../../../../core/services/operating-expense-document.service';

const TYPE_LABELS: Readonly<Record<OperatingExpenseDocumentType, string>> = {
  invoice: 'Rechnung / Quittung',
  payment_proof: 'Zahlungsnachweis',
  other: 'Sonstiges',
};

@Component({
  selector: 'app-expense-documents',
  standalone: true,
  template: `
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-documents-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
    >
      <section class="linear-surface w-full max-w-xl rounded-xl border border-fb-line p-5 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="expense-documents-title" class="text-base font-semibold text-fb-text-primary">
              Belege
            </h2>
            <p class="mt-1 text-xs text-fb-text-muted">
              Rechnungen und Zahlungsnachweise werden privat gespeichert.
            </p>
          </div>
          <button type="button" class="text-sm text-fb-text-muted" (click)="closed.emit()">✕</button>
        </div>

        <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label class="flex-1 text-xs font-medium text-fb-text-secondary">
            Belegart
            <select
              class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              [value]="documentType()"
              (change)="setDocumentType($event)"
            >
              <option value="invoice">Rechnung / Quittung</option>
              <option value="payment_proof">Zahlungsnachweis</option>
              <option value="other">Sonstiges</option>
            </select>
          </label>
          <label class="flex-1 text-xs font-medium text-fb-text-secondary">
            Datei
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xml,application/pdf,image/jpeg,image/png,application/xml,text/xml"
              class="mt-1 block w-full text-xs text-fb-text-secondary"
              (change)="uploadFile($event)"
            />
          </label>
        </div>

        @if (error()) {
          <p role="alert" class="mt-3 text-xs font-medium text-fb-critical">{{ error() }}</p>
        }

        <div class="mt-4 divide-y divide-fb-line rounded-lg border border-fb-line">
          @for (document of service.documents(); track document.id) {
            <div class="flex items-center justify-between gap-3 p-3">
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-fb-text-primary">
                  {{ document.original_file_name }}
                </p>
                <p class="mt-0.5 text-xs text-fb-text-muted">
                  {{ typeLabel(document.document_type) }}
                </p>
              </div>
              <div class="flex shrink-0 gap-2">
                <button
                  type="button"
                  class="h-7 rounded-lg border border-fb-line px-2 text-xs text-fb-text-secondary"
                  (click)="downloadDocument(document)"
                >
                  Öffnen
                </button>
                <button
                  type="button"
                  class="h-7 rounded-lg border border-fb-critical-border px-2 text-xs text-fb-critical"
                  (click)="removeDocument(document)"
                >
                  Entfernen
                </button>
              </div>
            </div>
          } @empty {
            <p class="p-4 text-center text-xs text-fb-text-muted">Noch keine Belege hinterlegt.</p>
          }
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseDocumentsComponent implements OnChanges {
  readonly expenseId = input.required<string>();
  readonly closed = output<void>();
  readonly service = inject(OperatingExpenseDocumentService);
  readonly documentType = signal<OperatingExpenseDocumentType>('invoice');
  readonly error = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['expenseId']?.currentValue) {
      void this.service.loadForExpense(this.expenseId());
    }
  }

  setDocumentType(event: Event): void {
    this.documentType.set(
      (event.target as HTMLSelectElement).value as OperatingExpenseDocumentType,
    );
  }

  async uploadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set(null);
    const result = await this.service.upload(this.expenseId(), file, this.documentType());
    if (result.error) this.error.set(result.error.message);
    input.value = '';
  }

  async removeDocument(document: OperatingExpenseDocument): Promise<void> {
    this.error.set(null);
    const result = await this.service.remove(document);
    if (result.error) this.error.set(result.error.message);
  }

  async downloadDocument(document: OperatingExpenseDocument): Promise<void> {
    this.error.set(null);
    const result = await this.service.download(document);
    if (result.error || !result.data) {
      this.error.set(result.error?.message ?? 'Der Beleg konnte nicht geöffnet werden.');
      return;
    }

    const url = URL.createObjectURL(result.data);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = document.original_file_name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  typeLabel(type: OperatingExpenseDocumentType): string {
    return TYPE_LABELS[type];
  }
}
