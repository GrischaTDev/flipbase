import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ItemCondition, PurchaseLine } from '../../../../core/models/flipbase.models';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  PackageContentInput,
  PurchasePackageService,
} from '../../services/purchase-package.service';

function contentRow() {
  return new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(300),
        (c) => (c.value.trim() ? null : { required: true }),
      ],
    }),
    condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
  });
}

@Component({
  selector: 'app-package-content-dialog',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    ButtonComponent,
    TextFieldComponent,
    CustomSelectComponent,
  ],
  templateUrl: './package-content-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackageContentDialogComponent {
  readonly line = input.required<PurchaseLine>();
  readonly saved = output<void>();
  readonly closed = output<void>();
  private readonly service = inject(PurchasePackageService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly rows = new FormArray([contentRow()]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  private readonly requestId = crypto.randomUUID();
  readonly conditionOptions: SelectOption<ItemCondition>[] = [
    { value: 'new', label: 'Neu' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt' },
  ];

  addRow(): void {
    if (this.saving() || this.rows.length >= 100) return;
    this.rows.push(contentRow());
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`#package-content-title-${this.rows.length - 1}`)
        ?.focus(),
    );
  }

  removeRow(index: number): void {
    if (this.saving() || this.rows.length === 1) return;
    this.rows.removeAt(index);
    this.rows.markAsDirty();
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(
          `#package-content-title-${Math.min(index, this.rows.length - 1)}`,
        )
        ?.focus(),
    );
  }

  hasUnsavedChanges(): boolean {
    return (
      this.saving() ||
      this.rows.dirty ||
      this.rows.getRawValue().some((row) => !!row.title.trim() || !!row.description.trim())
    );
  }

  async close(): Promise<void> {
    if (this.saving()) return;
    if (
      this.hasUnsavedChanges() &&
      !(await this.confirmation.frage({
        titel: 'Erfassung verwerfen?',
        text: 'Die noch nicht gespeicherten Artikel gehen verloren.',
        bestaetigenText: 'Verwerfen',
        abbrechenText: 'Weiter erfassen',
      }))
    )
      return;
    this.closed.emit();
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    this.rows.markAllAsTouched();
    if (this.rows.invalid) return;
    const items: PackageContentInput[] = this.rows.getRawValue().map((row) => ({
      title: row.title.trim(),
      condition: row.condition,
      description: row.description.trim() || null,
    }));
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.service.capture(this.line().id, items, this.requestId);
      if (result.error || !result.data) {
        this.error.set(
          result.error?.message ??
            'Der Inhalt konnte nicht gespeichert werden. Bitte erneut versuchen.',
        );
        return;
      }
      this.rows.markAsPristine();
      this.saved.emit();
    } catch {
      this.error.set('Der Inhalt konnte nicht gespeichert werden. Bitte erneut versuchen.');
    } finally {
      this.saving.set(false);
    }
  }
}
