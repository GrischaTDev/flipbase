import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-terms-modal',
  imports: [TranslatePipe, ModalShellComponent, ButtonComponent],
  templateUrl: './terms-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsModalComponent {
  readonly closed = output<void>();
}
