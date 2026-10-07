import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  type ModalSize,
  ModalShellComponent,
} from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { LucideLink2 } from '@lucide/angular';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceCloudSetupStore } from '../../services/marketplace-cloud-setup.store';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';

@Component({
  selector: 'app-marketplace-connect',
  imports: [
    ButtonComponent,
    ModalShellComponent,
    NoticeBannerComponent,
    MarketplaceBrowserTestComponent,
  ],
  templateUrl: './marketplace-connect.component.html',
  providers: [MarketplaceCloudSetupStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceConnectComponent {
  readonly accounts = inject(MarketplaceAccountStore);
  readonly cloud = inject(MarketplaceCloudSetupStore);
  readonly previewActive = signal(false);
  readonly modalSize = computed<ModalSize>(() => (this.previewActive() ? 'xl' : 'lg'));
  protected readonly loginIcon = LucideLink2;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly requestedId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('connectionId'))),
    { initialValue: this.route.snapshot.paramMap.get('connectionId') },
  );
  readonly reconnectRequested = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('reauth') === '1')),
    { initialValue: this.route.snapshot.queryParamMap.get('reauth') === '1' },
  );
  readonly requestedConnection = computed(
    () =>
      this.accounts.connections().find((item) => item.connectionId === this.requestedId()) ?? null,
  );
  readonly activeCloudSetup = computed(() => {
    const setup = this.cloud.setup();
    return setup?.connectionId === this.requestedId() ? setup : null;
  });
  readonly selected = computed(
    () =>
      this.requestedConnection() !== null &&
      this.accounts.selectedConnection()?.connectionId === this.requestedId(),
  );

  constructor() {
    effect(() => {
      const connection = this.requestedConnection();
      if (connection && this.accounts.canManage() && !this.selected()) {
        void this.accounts.selectConnection(connection.connectionId);
      }
    });
  }

  close(): void {
    void this.cloud.cancel();
    void this.router.navigate(['/marketplaces/vinted']);
  }

  async upgrade(): Promise<void> {
    const connection = this.requestedConnection();
    if (
      !connection ||
      !this.selected() ||
      connection.executionMode !== 'local' ||
      connection.status === 'paused' ||
      connection.status === 'blocked'
    )
      return;
    await this.cloud.begin({ connectionId: connection.connectionId });
  }
}
