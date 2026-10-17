import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedLocalRuntimeStore } from '../../services/vinted-local-runtime.store';
import { VintedAccountGridComponent } from './vinted-account-grid.component';

/** Derselbe Kontodialog mit eigenem, arbeitsbereichsgebundenem Zustand in der Übersicht. */
@Component({
  selector: 'app-vinted-account-management',
  imports: [VintedAccountGridComponent],
  providers: [
    MarketplaceAccountStore,
    VintedLocalExtensionBridge,
    VintedLocalExtensionStore,
    VintedLocalRuntimeStore,
  ],
  templateUrl: './vinted-account-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedAccountManagementComponent {
  readonly connectionId = input<string | null>(null);
  readonly addAccount = input(false);
}
