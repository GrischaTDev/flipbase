import { CurrencyPipe } from '@angular/common';
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
  ExpenseFrequency,
  ExpenseRecurringRule,
  ExpenseVatRate,
} from '../../../../core/models/expense.models';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseRecurringService } from '../../../../core/services/expense-recurring.service';
import { calculateExpenseTax, calculateExpenseUnitPrice } from '../../../../core/utils/expense-money';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

@Component({
  selector: 'app-recurring-expense-dialog',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    ModalShellComponent,
    ButtonComponent,
    CustomSelectComponent,
    DatePickerComponent,
    TextFieldComponent,
  ],
  templateUrl: './recurring-expense-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringExpenseDialogComponent implements OnInit {
  private readonly recurringService = inject(ExpenseRecurringService);
  readonly categoryService = inject(ExpenseCategoryService);

  readonly rule = input<ExpenseRecurringRule | null>(null);
  readonly closed = output<void>();
  readonly saved = output<ExpenseRecurringRule>();

  readonly isSaving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly taxDetailsExpanded = signal(false);

  readonly frequencyOptions: readonly SelectOption<ExpenseFrequency>[] = [
    { value: 'monthly', label: 'Monatlich' },
    { value: 'quarterly', label: 'Quartalsweise' },
    { value: 'yearly', label: 'Jährlich' },
  ];
  readonly vatOptions: readonly SelectOption<ExpenseVatRate>[] = [
    { value: 19, label: '19 % enthalten' },
    { value: 7, label: '7 % enthalten' },
    { value: 0, label: '0 %' },
    { value: null, label: 'Nicht ausgewiesen / unbekannt' },
  ];
  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() =>
    this.categoryService.categories().map((category) => ({
      value: category.id,
      label: category.name,
    })),
  );

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    vendor_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(160)],
    }),
    category_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    gross_amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vat_rate: new FormControl<ExpenseVatRate>(19),
    frequency: new FormControl<ExpenseFrequency>('monthly', { nonNullable: true }),
    start_date: new FormControl(localDateKey(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    end_date: new FormControl<string | null>(null),
    is_active: new FormControl(true, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const rule = this.rule();
    if (!rule) return;
    this.form.reset({
      title: rule.title,
      vendor_name: rule.vendor_name ?? '',
      category_id: rule.category_id,
      quantity: rule.quantity,
      gross_amount: rule.gross_amount,
      vat_rate: rule.vat_rate,
      frequency: rule.frequency,
      start_date: rule.start_date,
      end_date: rule.end_date,
      is_active: rule.is_active,
      notes: rule.notes ?? '',
    });
  }

  unitPrice(): number | null {
    return calculateExpenseUnitPrice(
      Number(this.form.controls.gross_amount.value ?? 0),
      this.form.controls.quantity.value,
    );
  }

  vatSummaryLabel(): string {
    switch (this.form.controls.vat_rate.value) {
      case 19:
        return '19 % MwSt. enthalten';
      case 7:
        return '7 % MwSt. enthalten';
      case 0:
        return '0 % MwSt.';
      case null:
        return 'MwSt. nicht ausgewiesen / unbekannt';
    }
  }

  taxBreakdown() {
    return calculateExpenseTax(
      Number(this.form.controls.gross_amount.value ?? 0),
      this.form.controls.vat_rate.value,
    );
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    this.form.markAllAsTouched();
    const values = this.form.getRawValue();
    if (
      this.form.invalid ||
      values.gross_amount === null ||
      !Number.isInteger(values.quantity) ||
      values.quantity < 1
    ) {
      this.errorMessage.set(
        'Bitte Bezeichnung, Kategorie, eine gültige Menge, Gesamtbetrag und Startdatum angeben.',
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
        frequency: values.frequency,
        start_date: values.start_date,
        end_date: values.end_date,
        is_active: values.is_active,
        notes: values.notes.trim() || null,
      };
      const result = this.rule()
        ? await this.recurringService.update(this.rule()!.id, input)
        : await this.recurringService.create(input);
      if (result.error || !result.data) {
        this.errorMessage.set(
          result.error?.message ?? 'Die Regel konnte nicht gespeichert werden.',
        );
        return;
      }

      const materialized = await this.recurringService.materializeDue(localDateKey());
      if (materialized.error) {
        this.errorMessage.set(materialized.error.message);
        return;
      }

      this.saved.emit(result.data);
      this.closed.emit();
    } finally {
      this.isSaving.set(false);
    }
  }
}
