import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import {
  EXPENSE_DOCUMENT_TYPE_LABELS,
  ExpenseDocument,
  ExpenseDocumentType,
} from '../../../../core/models/expense-document.models';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ExpenseDocumentPreviewDialogComponent } from '../expense-document-preview-dialog/expense-document-preview-dialog.component';

@Component({
  selector: 'app-expense-documents',
  imports: [ButtonComponent, CustomSelectComponent, ExpenseDocumentPreviewDialogComponent],
  templateUrl: './expense-documents.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseDocumentsComponent implements OnInit {
  readonly documentService = inject(ExpenseDocumentService);
  readonly expenseId = input.required<string>();

  readonly selectedType = signal<ExpenseDocumentType>('invoice');
  readonly preview = signal<ExpenseDocument | null>(null);
  readonly isUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly typeOptions: readonly SelectOption<ExpenseDocumentType>[] = (
    Object.entries(EXPENSE_DOCUMENT_TYPE_LABELS) as [ExpenseDocumentType, string][]
  ).map(([value, label]) => ({ value, label }));

  async ngOnInit(): Promise<void> {
    await this.documentService.loadForExpense(this.expenseId());
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploading.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.documentService.upload(this.expenseId(), file, this.selectedType());
      if (result.error) this.errorMessage.set(result.error.message);
    } finally {
      this.isUploading.set(false);
      input.value = '';
    }
  }

  async remove(document: ExpenseDocument): Promise<void> {
    const result = await this.documentService.remove(document);
    if (result.error) this.errorMessage.set(result.error.message);
  }
}
