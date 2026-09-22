import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-privacy-modal',
  imports: [TranslatePipe, ModalShellComponent, ButtonComponent],
  templateUrl: './privacy-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyModalComponent {
  readonly closed = output<void>();
}
