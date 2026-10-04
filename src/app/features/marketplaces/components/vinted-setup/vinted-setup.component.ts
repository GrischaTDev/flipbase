import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';

@Component({
  selector: 'app-vinted-setup',
  imports: [BadgeComponent, ButtonComponent, CardComponent],
  providers: [VintedLocalExtensionBridge],
  templateUrl: './vinted-setup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VintedSetupComponent {
  readonly extension = inject(VintedLocalExtensionBridge);
  constructor() {
    this.extension.checkInstallation();
  }
}
