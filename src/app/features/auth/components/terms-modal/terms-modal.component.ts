import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-terms-modal',
  imports: [TranslatePipe, LucideDynamicIcon, ModalDialogDirective],
  templateUrl: './terms-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsModalComponent {
  readonly closed = output<void>();
  readonly closeIcon = X;
}
