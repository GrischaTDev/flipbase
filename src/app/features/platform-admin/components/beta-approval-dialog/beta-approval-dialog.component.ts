import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { LucideShieldCheck as ShieldCheck } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { BetaApplication, DEFAULT_GRANTED_DAYS } from '../../models/beta-application.model';

function integerValidator(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { integer: true };
}

@Component({
  selector: 'app-beta-approval-dialog',
  imports: [ReactiveFormsModule, ModalShellComponent, NumberInputComponent, ButtonComponent],
  templateUrl: './beta-approval-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApprovalDialogComponent {
  readonly application = input.required<BetaApplication>();
  readonly processing = input(false);
  readonly approved = output<number>();
  readonly closed = output<void>();

  readonly icon = ShieldCheck;
  readonly form = new FormGroup({
    grantedDays: new FormControl<number | null>(DEFAULT_GRANTED_DAYS, {
      validators: [Validators.required, Validators.min(1), Validators.max(3650), integerValidator],
    }),
  });

  approve(): void {
    this.form.markAllAsTouched();
    const grantedDays = this.form.controls.grantedDays.value;
    if (this.form.invalid || grantedDays === null) return;
    this.approved.emit(grantedDays);
  }
}
