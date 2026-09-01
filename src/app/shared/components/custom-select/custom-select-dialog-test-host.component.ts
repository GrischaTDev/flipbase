import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ModalDialogDirective } from '../../directives/modal-dialog.directive';

@Component({
  selector: 'app-custom-select-dialog-test-host',
  imports: [ModalDialogDirective],
  templateUrl: './custom-select-dialog-test-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomSelectDialogTestHostComponent {
  readonly dialogOpen = signal(true);
}
