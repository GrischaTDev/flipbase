import { EbayArticleMappingStore } from '../../services/ebay-article-mapping.store';
import { InventoryService } from '../../../../core/services/inventory.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import type { EbayOrder } from '../../../../../../supabase/functions/_shared/ebay-contracts';
import type { EbaySaleTarget } from '../../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import { MarketplaceAccountHeaderComponent } from '../../../../shared/components/marketplace-account-header/marketplace-account-header.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideExternalLink,
  LucideLink2,
  LucidePlus,
  LucideSettings,
  LucideRefreshCw,
  LucideUnlink,
  LucideClipboardCheck,
  LucidePencil,
} from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import type { EbayListing } from '../../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayArticleMappingComponent } from '../ebay-article-mapping/ebay-article-mapping.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { EbayAccountStore } from '../../services/ebay-account.store';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { EbayTrafficOverviewComponent } from '../ebay-traffic-overview/ebay-traffic-overview.component';

@Component({
  selector: 'app-ebay-account',
  imports: [
    MarketplaceAccountHeaderComponent,
    DatePipe,
    NgTemplateOutlet,
    ModalShellComponent,
    DecimalPipe,
    ProductThumbnailComponent,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    DataTableComponent,
    PageHeaderComponent,
    EbayArticleMappingComponent,
    EbayTrafficOverviewComponent,
  ],
  providers: [EbayArticleMappingStore],
  templateUrl: './ebay-account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class EbayAccountComponent {
  readonly showData = input(false);
  readonly returnToOverview = input(false);
  readonly page = input<'listings' | 'orders' | 'statistics' | 'connection'>('listings');
  readonly showingStatistics = computed(() => this.page() === 'statistics');
  readonly pageTitle = computed(() => {
    switch (this.page()) {
      case 'orders':
        return 'eBay-Bestellungen';
      case 'statistics':
        return 'eBay-Statistiken';
      case 'connection':
        return 'eBay-Konten';
      default:
        return 'eBay-Inserate';
    }
  });
  readonly settingsOpen = signal(false);
  readonly actionsInFooter = input(false);
  readonly dialogActions = viewChild<TemplateRef<unknown>>('dialogActionsTemplate');
  readonly accountBusy = computed(
    () => this.store.isLoading() || this.store.isReading() || this.store.trafficLoading(),
  );
  readonly selectedListing = signal<EbayListing | null>(null);
  readonly searchText = signal('');
  readonly store = inject(EbayAccountStore);
  readonly mappingStore = inject(EbayArticleMappingStore);
  private readonly inventory = inject(InventoryService);
  private readonly catalog = inject(CatalogService);
  private readonly media = inject(MediaService);
  readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly mappingPanel = viewChild<ElementRef<HTMLElement>>('mappingPanel');
  private mappingTrigger: HTMLElement | null = null;
  readonly addIcon = LucidePlus;
  readonly settingsIcon = LucideSettings;
  readonly connectIcon = LucideLink2;
  readonly disconnectIcon = LucideUnlink;
  readonly refreshIcon = LucideRefreshCw;
  readonly externalLinkIcon = LucideExternalLink;
  readonly reviewIcon = LucideClipboardCheck;
  readonly editIcon = LucidePencil;
  readonly filteredListings = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase('de');
    return this.store
      .listings()
      .filter((listing) =>
        `${listing.title} ${listing.id}`.toLocaleLowerCase('de').includes(query),
      );
  });
  readonly filteredOrders = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase('de');
    return this.store
      .orders()
      .filter((order) =>
        `${order.id} ${order.items.map((item) => item.title).join(' ')}`
          .toLocaleLowerCase('de')
          .includes(query),
      );
  });
  editListingLink(listingId: string): string {
    return `/marketplaces/ebay/listings/${encodeURIComponent(listingId)}/edit`;
  }

  constructor() {
    if (this.route.snapshot.queryParamMap.get('ebay_result')) this.store.reset(null);
    effect(() => {
      const userId = this.auth.currentUser()?.id;
      const workspaceId = this.workspace.currentWorkspace()?.id;
      const result = this.route.snapshot.queryParamMap.get('ebay_result');
      if (!userId || !workspaceId || !result) return;
      try {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem('flipbase:ebay:overview-return') ?? 'null',
        );
        if (
          !stored ||
          typeof stored !== 'object' ||
          !('userId' in stored) ||
          !('workspaceId' in stored)
        )
          return;
        sessionStorage.removeItem('flipbase:ebay:overview-return');
        if (
          stored.userId !== userId ||
          stored.workspaceId !== workspaceId ||
          this.route.snapshot.queryParamMap.get('workspace') !== workspaceId
        )
          return;
        void this.router.navigate(['/marketplaces/overview'], {
          queryParams: { ebay_result: result, workspace: workspaceId },
          replaceUrl: true,
        });
      } catch {
        /* Ohne verfügbaren Sitzungsspeicher bleibt die bestätigte eBay-Rückkehrseite erreichbar. */
      }
    });
    effect(() => {
      const user = this.auth.currentUser();
      const workspace = this.workspace.currentWorkspace();
      const shouldRead =
        this.showData() && (this.page() === 'listings' || this.page() === 'orders');
      const section = this.page() === 'orders' ? 'orders' : 'listings';
      this.searchText.set('');
      this.settingsOpen.set(false);
      untracked(
        () =>
          void this.store.initialize(
            user && workspace && !workspace.archived_at ? workspace.id : null,
            shouldRead,
            section,
          ),
      );
    });
    effect(() => {
      const connection = this.store.connection();
      const available = this.store.importAvailable();
      this.selectedListing.set(null);
      untracked(() => {
        this.mappingStore.clear();
        if (connection?.status === 'connected' && available) {
          void this.mappingStore.load(connection);
          if (this.inventory.loadedWorkspaceId() !== connection.workspaceId)
            void this.inventory.loadInventory(connection.workspaceId);
          if (this.catalog.loadedWorkspaceId() !== connection.workspaceId)
            void this.catalog.loadProducts(connection.workspaceId);
        }
      });
    });
  }
  callbackMessage(): string | null {
    const params = this.route.snapshot.queryParamMap;
    const workspaceId = params.get('workspace');
    if (workspaceId && workspaceId !== this.workspace.currentWorkspace()?.id)
      return 'Die eBay-Anmeldung gehört zu einem anderen Workspace. Wechsle zu diesem Workspace, um den Verbindungsstatus zu prüfen.';
    const result = params.get('ebay_result');
    // Der Rückgabewert ist nur ein Hinweis; der bestätigte Status kommt vom Server.
    if (result === 'connected')
      return 'Deine eBay-Anmeldung wurde abgeschlossen. Der aktuelle Verbindungsstatus steht unten.';
    if (result === 'denied')
      return 'Du hast die eBay-Freigabe abgebrochen. Du kannst dein Konto erneut verbinden.';
    if (result === 'failed')
      return 'Die eBay-Anmeldung konnte nicht bestätigt werden. Starte die Verbindung erneut.';
    return null;
  }
  async connect(): Promise<void> {
    const url = await this.store.connect();
    if (url) {
      if (this.returnToOverview()) {
        try {
          sessionStorage.setItem(
            'flipbase:ebay:overview-return',
            JSON.stringify({
              userId: this.auth.currentUser()?.id,
              workspaceId: this.workspace.currentWorkspace()?.id,
            }),
          );
        } catch {
          /* Die offizielle Freigabe bleibt auch ohne Sitzungsspeicher nutzbar. */
        }
      }
      window.location.assign(url);
    }
  }
  refresh(): void {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!this.auth.currentUser() || !workspaceId || this.workspace.currentWorkspace()?.archived_at)
      return;
    void this.store.initialize(
      workspaceId,
      this.showData() && (this.page() === 'listings' || this.page() === 'orders'),
      this.page() === 'orders' ? 'orders' : 'listings',
    );
  }
  openMapping(listing: EbayListing, event: MouseEvent): void {
    this.mappingTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.selectedListing.set(listing);
    afterNextRender(
      () => {
        const panel = this.mappingPanel()?.nativeElement;
        panel?.focus();
        panel?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }
  closeMapping(): void {
    this.selectedListing.set(null);
    if (this.mappingTrigger?.isConnected) this.mappingTrigger.focus();
    this.mappingTrigger = null;
  }
  reloadMappings(): void {
    const connection = this.store.connection();
    if (connection?.status === 'connected') void this.mappingStore.load(connection);
  }
  private mappingTarget(
    listingId: string | null | undefined,
    variationId: string | null = null,
  ): EbaySaleTarget | null {
    return (
      this.mappingStore
        .mappings()
        .find((mapping) => mapping.listingId === listingId && mapping.variationId === variationId)
        ?.target ?? null
    );
  }
  private targetTitle(target: EbaySaleTarget | null): string | null {
    if (!target) return null;
    return 'inventoryItemId' in target
      ? (this.inventory.items().find((item) => item.id === target.inventoryItemId)?.title ??
          'Verknüpftes Einzelstück')
      : (this.catalog.products().find((product) => product.id === target.catalogProductId)?.title ??
          'Verknüpfter Mengenartikel');
  }
  listingMappingTitle(listing: EbayListing): string | null {
    const labels = this.mappingStore
      .mappings()
      .filter((mapping) => mapping.listingId === listing.id)
      .map((mapping) => this.targetTitle(mapping.target));
    return labels.length ? [...new Set(labels)].join(', ') : null;
  }
  orderMappingTitle(order: EbayOrder, index: number): string | null {
    const line = order.importSource?.lines[index];
    return this.targetTitle(this.mappingTarget(line?.listingId, line?.variationId));
  }
  orderImage(order: EbayOrder, index: number): string | null {
    const line = order.importSource?.lines[index];
    const sourceImage =
      order.items[index]?.imageUrl ??
      line?.imageUrl ??
      this.store.listings().find((listing) => listing.id === line?.listingId)?.imageUrl;
    if (sourceImage) return sourceImage;
    const target = this.mappingTarget(line?.listingId, line?.variationId);
    if (!target) return null;
    if ('catalogProductId' in target)
      return this.catalog.imageUrls()[target.catalogProductId] ?? null;
    const item = this.inventory.items().find((item) => item.id === target.inventoryItemId);
    const path =
      item?.media?.find((media) => media.is_primary)?.storage_path ??
      item?.media?.[0]?.storage_path;
    return path ? this.media.getMediaUrl(path) : null;
  }
  paymentLabel(status: string): string {
    const labels: Record<string, string> = {
      PAID: 'Bezahlt',
      PENDING: 'Zahlung ausstehend',
      FAILED: 'Zahlung fehlgeschlagen',
      FULLY_REFUNDED: 'Erstattet',
      PARTIALLY_REFUNDED: 'Teilweise erstattet',
    };
    return labels[status] ?? 'Zahlungsstatus unbekannt';
  }
  orderReviewLink(connectionId: string, orderId: string): string {
    return `/sales/ebay/${encodeURIComponent(connectionId)}/${encodeURIComponent(orderId)}`;
  }
  bookingLabel(orderId: string): string {
    const booking = this.store.orderBookings()[orderId];
    if (booking?.status === 'imported') return 'Gebucht';
    if (booking?.status === 'recorded_elsewhere') return 'Manuell gebucht';
    if (booking?.status === 'unrecorded') return 'Noch nicht gebucht';
    return this.store.bookingStatusesLoading()
      ? 'Buchungsstatus wird geprüft'
      : 'Buchungsstatus ungeprüft';
  }
  fulfillmentLabel(status: string): string {
    const labels: Record<string, string> = {
      FULFILLED: 'Versandt',
      NOT_STARTED: 'Noch nicht versandt',
      IN_PROGRESS: 'Versand läuft',
    };
    return labels[status] ?? 'Versandstatus unbekannt';
  }
  cancellationLabel(status: string | null): string | null {
    if (!status || status === 'NONE_REQUESTED') return null;
    const labels: Record<string, string> = {
      CANCELED: 'Storniert',
      IN_PROGRESS: 'Stornierung läuft',
      REJECTED: 'Stornierung abgelehnt',
      REQUESTED: 'Stornierung angefragt',
    };
    return labels[status] ?? 'Stornierungsstatus prüfen';
  }
}
