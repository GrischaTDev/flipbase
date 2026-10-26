import { ListingTransferActionComponent } from '../listing-transfer-action/listing-transfer-action.component';
import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucideLayoutGrid, LucideList, LucidePencil } from '@lucide/angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { MarketplaceListingStatisticsStore } from '../../services/marketplace-listing-statistics.store';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingMetricsComponent } from './vinted-listing-metrics.component';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { createVintedListingMetricDisplay } from './vinted-listing-metric-display';
import { vintedPublicationBadge } from '../../models/vinted-publication-state';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { createVintedListingPriceEditor } from '../../services/vinted-listing-price-editor';
import { VintedListingPriceDialogComponent } from '../vinted-listing-price-dialog/vinted-listing-price-dialog.component';

@Component({
  selector: 'app-vinted-listings',
  imports: [
    ListingTransferActionComponent,
    CurrencyPipe,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    CustomSelectComponent,
    ProductThumbnailComponent,
    VintedListingMetricsComponent,
    VintedListingAgeComponent,
    VintedListingPriceDialogComponent,
  ],
  templateUrl: './vinted-listings.component.html',
  providers: [MarketplaceListingStatisticsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block min-w-0 w-full max-w-full overflow-hidden' },
})
export class VintedListingsComponent {
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly gridIcon = LucideLayoutGrid;
  readonly listIcon = LucideList;
  readonly priceIcon = LucidePencil;
  readonly store = inject(MarketplaceAccountStore);
  readonly statistics = inject(MarketplaceListingStatisticsStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private handledConnectionId: string | null = null;
  readonly page = computed(() => this.store.snapshot()?.publications ?? null);
  readonly publicationBadge = vintedPublicationBadge;
  readonly priceEntry = signal<MarketplaceEntry | null>(null);
  readonly savingPrice = signal(false);
  readonly priceNotice = signal<string | null>(null);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly priceContext = computed(() => {
    const connection = this.store.selectedConnection();
    return JSON.stringify([
      this.store.selectionVersion(),
      this.store.canManage(),
      connection?.workspaceId,
      connection?.connectionId,
      connection?.status,
      connection?.executionMode,
    ]);
  });
  private priceTrigger: HTMLElement | null = null;
  readonly priceEditor = createVintedListingPriceEditor({
    store: this.store,
    entry: () => this.priceEntry(),
    busy: this.savingPrice,
    priceRead: (price) => this.priceEntry.update((entry) => (entry ? { ...entry, price } : entry)),
    confirmed: () => this.priceNotice.set('Der neue Preis wurde bei Vinted bestätigt.'),
    closed: () => {
      afterNextRender(
        () => {
          if (this.priceTrigger?.isConnected) this.priceTrigger.focus();
          else this.element?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
        },
        { injector: this.injector },
      );
    },
  });
  readonly metricDisplay = createVintedListingMetricDisplay(
    this.store,
    () => this.page()?.items ?? [],
  );

  constructor() {
    effect(() => {
      this.priceContext();
      untracked(() => {
        this.priceEditor.reset();
        this.priceEntry.set(null);
        this.savingPrice.set(false);
        this.priceNotice.set(null);
      });
    });
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

  changePrice(entry: MarketplaceEntry, event: MouseEvent): void {
    if (this.priceEditor.open() || !this.priceEditor.available(entry)) return;
    this.priceTrigger = event.target instanceof Element ? event.target.closest('button') : null;
    this.priceEntry.set(entry);
    this.priceNotice.set(null);
    this.priceEditor.show();
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
