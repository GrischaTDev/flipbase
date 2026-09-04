import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-privacy-modal',
  imports: [TranslatePipe, LucideDynamicIcon, ModalDialogDirective],
  templateUrl: './privacy-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyModalComponent {
  readonly closed = output<void>();
  readonly closeIcon = X;
}
