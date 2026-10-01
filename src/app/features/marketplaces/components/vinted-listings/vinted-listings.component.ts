import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingMetricsComponent } from './vinted-listing-metrics.component';
import { createVintedListingMetricDisplay } from './vinted-listing-metric-display';

@Component({
  selector: 'app-vinted-listings',
  imports: [
    CurrencyPipe,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedListingMetricsComponent,
  ],
  templateUrl: './vinted-listings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingsComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private handledConnectionId: string | null = null;
  readonly page = computed(() => this.store.snapshot()?.publications ?? null);
  readonly metricDisplay = createVintedListingMetricDisplay(
    this.store,
    () => this.page()?.items ?? [],
  );

  constructor() {
    effect(() => {
      const connectionId = this.queryParams().get('connectionId');
      const connections = this.store.connections();
      const loading = this.store.loading();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      untracked(() => {
        if (!connectionId) {
          this.handledConnectionId = null;
          return;
        }
        if (this.handledConnectionId === connectionId || loading || !workspaceId) return;
        this.handledConnectionId = connectionId;
        const account = connections.find(
          (item) => item.connectionId === connectionId && item.workspaceId === workspaceId,
        );
        if (account) void this.selectLinkedConnection(connectionId, workspaceId);
      });
    });
  }

  private async selectLinkedConnection(connectionId: string, workspaceId: string): Promise<void> {
    const selection = this.store.selectionVersion();
    const navigated = await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { connectionId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (
      !navigated ||
      this.workspace.currentWorkspace()?.id !== workspaceId ||
      selection !== this.store.selectionVersion()
    )
      return;
    if (this.store.selectedConnection()?.connectionId !== connectionId)
      await this.store.selectConnection(connectionId);
  }
}
