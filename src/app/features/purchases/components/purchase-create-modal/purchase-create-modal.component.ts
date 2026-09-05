import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Purchase } from '../../../../core/models/flipbase.models';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { PurchaseEntryFormComponent } from '../purchase-entry-form/purchase-entry-form.component';

@Component({
  selector: 'app-purchase-create-modal',
  imports: [ModalDialogDirective, PurchaseEntryFormComponent],
  templateUrl: './purchase-create-modal.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseCreateModalComponent {
  readonly purchase = input<Purchase | null>(null);
  readonly closed = output<void>();
  readonly created = output<void>();
}
