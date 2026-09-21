import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Source } from '../../../../core/models/flipbase.models';
import { SourcesService } from '../../../../core/services/sources.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

@Component({
  selector: 'app-purchase-source-dialog',
  imports: [ReactiveFormsModule, ModalShellComponent, TextFieldComponent, ButtonComponent],
  templateUrl: './purchase-source-dialog.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSourceDialogComponent {
  private readonly sources = inject(SourcesService);

  readonly created = output<Source>();
  readonly closed = output<void>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/u)],
    }),
  });

  hasUnsavedChanges(): boolean {
    return this.form.dirty && this.form.controls.name.value.trim().length > 0;
  }

  async save(): Promise<void> {
    if (this.saving() || this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.sources.createSource(this.form.controls.name.value.trim());
      if (result.error || !result.data) {
        this.error.set(result.error?.message ?? 'Bezugsquelle konnte nicht gespeichert werden.');
        return;
      }
      this.created.emit(result.data);
    } catch (cause: unknown) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Bezugsquelle konnte nicht gespeichert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
