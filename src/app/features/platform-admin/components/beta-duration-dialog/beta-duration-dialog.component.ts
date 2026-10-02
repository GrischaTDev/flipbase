import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { BetaLifecycleClockService } from '../../services/beta-lifecycle-clock.service';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';

function integerDays(control: AbstractControl<number | null>): ValidationErrors | null {
  return control.value === null || Number.isInteger(control.value) ? null : { integer: true };
}

@Component({
  selector: 'app-beta-duration-dialog',
  imports: [
    TranslatePipe,
    DatePipe,
    ReactiveFormsModule,
    ModalShellComponent,
    NumberInputComponent,
    ButtonComponent,
  ],
  templateUrl: './beta-duration-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaDurationDialogComponent {
  readonly name = input.required<string>();
  readonly endsAt = input<string | null>(null);
  readonly processing = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly changed = output<{ action: 'extend' | 'end'; days: number }>();
  readonly closed = output<void>();
  readonly days = new FormControl<number | null>(30, {
    validators: [Validators.required, Validators.min(1), Validators.max(3650), integerDays],
  });
  private readonly clock = inject(BetaLifecycleClockService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly selectedDays = toSignal(this.days.valueChanges, { initialValue: 30 });
  readonly previewEnd = computed(() => {
    const days = this.selectedDays();
    if (days === null || !Number.isInteger(days) || days < 1 || days > 3650) return null;
    const now = this.clock.now() + this.access.serverOffset();
    const currentEnd = Date.parse(this.endsAt() ?? '');
    return new Date(
      Math.max(now, Number.isFinite(currentEnd) ? currentEnd : now) + days * 86400000,
    ).toISOString();
  });

  extend(): void {
    this.days.markAsTouched();
    if (!this.processing() && this.days.valid && this.days.value !== null)
      this.changed.emit({ action: 'extend', days: this.days.value });
  }

  end(): void {
    if (!this.processing()) this.changed.emit({ action: 'end', days: 0 });
  }
}
