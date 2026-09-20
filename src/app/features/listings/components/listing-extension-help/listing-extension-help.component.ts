import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

@Component({
  selector: 'app-listing-extension-help',
  imports: [ButtonComponent, ModalShellComponent],
  templateUrl: './listing-extension-help.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class ListingExtensionHelpComponent {
  readonly open = input(false);
  readonly checking = input(false);
  readonly closeRequested = output<void>();
  readonly checkRequested = output<void>();

  onEscape(): void {
    if (this.open()) this.closeRequested.emit();
  }
}
