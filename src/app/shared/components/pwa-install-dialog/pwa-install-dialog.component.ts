import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-pwa-install-dialog',
  imports: [ModalShellComponent, ButtonComponent],
  templateUrl: './pwa-install-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstallDialogComponent {
  readonly pwa = inject(PwaService);
}
