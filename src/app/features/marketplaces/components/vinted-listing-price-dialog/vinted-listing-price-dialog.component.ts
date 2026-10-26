import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule, type FormControl, type FormGroup } from '@angular/forms';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-vinted-listing-price-dialog',
  imports: [ReactiveFormsModule, ModalShellComponent, NumberInputComponent, ButtonComponent],
  templateUrl: './vinted-listing-price-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingPriceDialogComponent {
  readonly title = input.required<string>();
  readonly form = input.required<FormGroup<{ price: FormControl<number | null> }>>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();
}
