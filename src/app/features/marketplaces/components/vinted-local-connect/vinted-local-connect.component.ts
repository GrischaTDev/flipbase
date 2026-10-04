import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';

@Component({
  selector: 'app-vinted-local-connect',
  imports: [DatePipe, ButtonComponent, CardComponent, NoticeBannerComponent],
  providers: [VintedLocalExtensionBridge, VintedLocalExtensionStore],
  templateUrl: './vinted-local-connect.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedLocalConnectComponent {
  readonly accounts = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  readonly extension = inject(VintedLocalExtensionBridge);
  private readonly route = inject(ActivatedRoute);
  private readonly parameters = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly connection = computed(
    () =>
      this.accounts
        .connections()
        .find((account) => account.connectionId === this.parameters().get('connectionId')) ?? null,
  );
  constructor() {
    this.extension.checkInstallation();
    effect(() => {
      const connection = this.connection();
      this.local.connection.set(connection);
      if (
        connection &&
        this.accounts.canManage() &&
        this.accounts.selectedConnection()?.connectionId !== connection.connectionId
      )
        void this.accounts.selectConnection(connection.connectionId);
    });
  }
}
