import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';

@Component({
  selector: 'app-marketplace-connect',
  imports: [ButtonComponent, NoticeBannerComponent, MarketplaceBrowserTestComponent],
  templateUrl: './marketplace-connect.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceConnectComponent {
  readonly accounts = inject(MarketplaceAccountStore);
  private readonly route = inject(ActivatedRoute);
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
}
