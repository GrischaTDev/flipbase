import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';

@Component({
  selector: 'app-package-price-dialog',
  imports: [ModalShellComponent, NumberInputComponent, ReactiveFormsModule],
  templateUrl: './package-price-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackagePriceDialogComponent {
  readonly lineCount = input.required<number>();
  readonly initialTotal = input<number | null>(null);
  readonly closed = output<void>();
  readonly confirmed = output<number>();

  readonly total = new FormControl<number | null>(null, {
    validators: [Validators.required, Validators.min(0.01)],
  });

  constructor() {
    effect(() => this.total.setValue(this.initialTotal()));
  }

  confirm(): void {
    this.total.markAsTouched();
    const total = this.total.value;
    if (this.total.invalid || total === null) return;

    this.confirmed.emit(total);
  }
}
