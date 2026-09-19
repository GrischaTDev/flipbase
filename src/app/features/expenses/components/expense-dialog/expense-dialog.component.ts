import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ExpenseDocumentType,
  validateExpenseDocumentFile,
} from '../../../../core/models/expense-document.models';
import { Expense, ExpenseStatus, ExpenseVatRate } from '../../../../core/models/expense.models';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ExpenseService } from '../../../../core/services/expense.service';
import {
  calculateExpenseTax,
  calculateExpenseUnitPrice,
} from '../../../../core/utils/expense-money';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}


@Component({
  selector: 'app-expense-dialog',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    ButtonComponent,
    CustomSelectComponent,
    DatePickerComponent,
    TextFieldComponent,
  ],
  templateUrl: './expense-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseDialogComponent implements OnInit {
  private readonly expenseService = inject(ExpenseService);
  private readonly documentService = inject(ExpenseDocumentService);
  private readonly toast = inject(ToastService);
  readonly categoryService = inject(ExpenseCategoryService);

  readonly expense = input<Expense | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Expense>();

  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly taxDetailsExpanded = signal(false);
  readonly pendingDocument = signal<File | null>(null);
  readonly selectedDocumentType = signal<ExpenseDocumentType>('invoice');

  readonly vatOptions: readonly SelectOption<ExpenseVatRate>[] = [
    { value: 19, label: '19 % enthalten' },
    { value: 7, label: '7 % enthalten' },
    { value: 0, label: '0 %' },
    { value: null, label: 'Nicht ausgewiesen / unbekannt' },
  ];
  readonly documentTypeOptions: readonly SelectOption<ExpenseDocumentType>[] = [
    { value: 'invoice', label: 'Rechnung' },
    { value: 'receipt', label: 'Quittung' },
    { value: 'payment_proof', label: 'Zahlungsnachweis' },
    { value: 'other', label: 'Sonstiges' },
  ];
  readonly statusOptions: readonly SelectOption<ExpenseStatus>[] = [
    { value: 'paid', label: 'Bezahlt' },
    { value: 'open', label: 'Offen' },
  ];
  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() =>
    this.categoryService.categories().map((category) => ({
      value: category.id,
      label: category.name,
    })),
  );

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(160)],
    }),
    vendor_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(160)],
    }),
    category_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/u)],
    }),
    gross_amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vat_rate: new FormControl<ExpenseVatRate>(19),
    expense_date: new FormControl(localDateKey(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    status: new FormControl<ExpenseStatus>('paid', { nonNullable: true }),
    due_date: new FormControl<string | null>(null),
    payment_date: new FormControl<string | null>(localDateKey()),
    notes: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const expense = this.expense();
    if (!expense) return;
    this.form.reset({
      title: expense.title,
      vendor_name: expense.vendor_name ?? '',
      category_id: expense.category_id,
      quantity: expense.quantity,
      gross_amount: expense.gross_amount,
      vat_rate: expense.vat_rate,
      expense_date: expense.expense_date,
      status: expense.status,
      due_date: expense.due_date,
      payment_date: expense.payment_date,
      notes: expense.notes ?? '',
    });
  }

  onStatusChanged(status: ExpenseStatus | null): void {
    const next = status ?? 'paid';
    this.form.controls.status.setValue(next);
    if (next === 'open') {
      this.form.controls.payment_date.setValue(null);
      return;
    }
    this.form.controls.payment_date.setValue(
      this.form.controls.payment_date.value ?? this.form.controls.expense_date.value,
    );
  }

  taxBreakdown() {
    return calculateExpenseTax(
      Number(this.form.controls.gross_amount.value ?? 0),
      this.form.controls.vat_rate.value,
    );
  }

  unitPrice(): number | null {
    return calculateExpenseUnitPrice(
      Number(this.form.controls.gross_amount.value ?? 0),
      this.form.controls.quantity.value,
    );
  }

  taxSummary(): string {
    const rate = this.form.controls.vat_rate.value;
    if (rate === null) return 'MwSt. nicht ausgewiesen / unbekannt';
    if (rate === 0) return '0 % MwSt.';
    return `${rate} % MwSt. enthalten`;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setPendingDocument(file);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setPendingDocument(file);
  }

  clearPendingDocument(): void {
    this.pendingDocument.set(null);
  }

  private setPendingDocument(file: File): void {
    const invalid = validateExpenseDocumentFile(file);
    if (invalid) {
      this.errorMessage.set(invalid.message);
      return;
    }
    this.errorMessage.set(null);
    this.pendingDocument.set(file);
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    this.form.markAllAsTouched();
    const values = this.form.getRawValue();

    if (values.status === 'paid' && !values.payment_date) {
      this.errorMessage.set('Bitte ein Zahlungsdatum angeben.');
      return;
    }
    if (this.form.invalid || values.gross_amount === null) {
      this.errorMessage.set(
        'Bitte Bezeichnung, Kategorie, Menge und einen gültigen Gesamtbetrag angeben.',
      );
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const input = {
        category_id: values.category_id,
        title: values.title.trim(),
        vendor_name: values.vendor_name.trim() || null,
        quantity: values.quantity,
        gross_amount: Number(values.gross_amount),
        vat_rate: values.vat_rate,
        expense_date: values.expense_date,
        due_date: values.status === 'open' ? values.due_date : null,
        status: values.status,
        payment_date: values.status === 'paid' ? values.payment_date : null,
        notes: values.notes.trim() || null,
      };
      const result = this.expense()
        ? await this.expenseService.update(this.expense()!.id, input)
        : await this.expenseService.create(input);
      if (result.error || !result.data) {
        this.errorMessage.set(
          result.error?.message ?? 'Die Ausgabe konnte nicht gespeichert werden.',
        );
        return;
      }

      const pendingDocument = this.pendingDocument();
      if (pendingDocument) {
        const upload = await this.documentService.upload(
          result.data.id,
          pendingDocument,
          this.selectedDocumentType(),
        );
        if (upload.error) {
          this.toast.warning(
            'Ausgabe gespeichert, Beleg nicht hochgeladen.',
            upload.error.message,
          );
        }
      }

      this.saved.emit(result.data);
      this.closed.emit();
    } finally {
      this.isSaving.set(false);
    }
  }
}
