import { LucideRotateCcw, LucideMessageCircle } from '@lucide/angular';
import { CurrencyPipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  BadgeComponent,
  type BadgeTone,
} from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { AccountScope } from '../../models/marketplace.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { VintedShippingLabelStore } from '../../services/vinted-shipping-label.store';
import { VintedShippingLabelActionsComponent } from '../vinted-shipping-label-actions/vinted-shipping-label-actions.component';
import { vintedSaleItemIds } from '../../models/vinted-listing-source';
import { TableActionMenuComponent } from '../../../../shared/components/table-action-menu/table-action-menu.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { createVintedAccountList } from '../../services/vinted-addressed-list';
import { vintedAccountEntryKey } from '../../models/vinted-account-list';

interface SaleLink {
  readonly saleId: string;
  readonly scope: AccountScope;
}

@Component({
  selector: 'app-vinted-sales',
  imports: [
    CurrencyPipe,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    VintedShippingLabelActionsComponent,
    TableActionMenuComponent,
    NoticeBannerComponent,
  ],
  templateUrl: './vinted-sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedSalesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly accountList = createVintedAccountList(() => ({ kind: 'sale' }));
  readonly entryKey = vintedAccountEntryKey;
  private readonly api = inject(MarketplaceApiService);
  private readonly shippingLabels = inject(VintedShippingLabelStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  readonly icons = { relist: LucideRotateCcw, chat: LucideMessageCircle };
  readonly itemIds = vintedSaleItemIds;
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly linkedSale = computed<SaleLink | null>(() => {
    const params = this.queryParams();
    const saleId = params.get('saleId');
    const connectionId = params.get('connectionId');
    const workspaceId = params.get('workspaceId');
    if (!saleId || !connectionId || !this.store.canManage()) return null;
    const account = this.store
      .connections()
      .find(
        (connection) =>
          connection.connectionId === connectionId &&
          (workspaceId === null || connection.workspaceId === workspaceId),
      );
    return account ? { saleId, scope: { workspaceId: account.workspaceId, connectionId } } : null;
  });
  private readonly activeSaleLink = computed(() => {
    const link = this.linkedSale();
    if (this.accountList.showAllAccounts()) return link;
    const selected = this.store.selectedConnection();
    return link &&
      selected?.workspaceId === link.scope.workspaceId &&
      selected.connectionId === link.scope.connectionId
      ? { ...link, selectionVersion: this.store.selectionVersion() }
      : null;
  });
  private readonly fetchedSale = signal<{
    link: SaleLink;
    entry: MarketplaceEntry | null;
  } | null>(null);
  readonly page = computed(() =>
    this.accountList.showAllAccounts() ? this.accountList.page() : this.store.snapshot()?.sales,
  );
  readonly loadMore = () =>
    this.accountList.showAllAccounts() ? this.accountList.loadMore() : this.store.loadMore('sale');
  private readonly linkedSaleInPage = computed(() =>
    this.page()?.items.find((entry) => this.isLinkedSale(entry)),
  );
  readonly entries = computed(() => {
    const entries = (this.page()?.items ?? []).filter((entry) => entry.saleState !== 'relisted');
    const fetched = this.fetchedSale();
    return fetched?.link === this.activeSaleLink() && fetched.entry && !this.linkedSaleInPage()
      ? [fetched.entry, ...entries]
      : entries;
  });
  readonly linkedSaleUnavailable = computed(() => {
    const known = this.linkedSaleInPage();
    if (known) return known.saleState === 'relisted';
    const fetched = this.fetchedSale();
    return fetched?.link === this.activeSaleLink() && fetched.entry === null;
  });

  canCopy(entry: MarketplaceEntry): boolean {
    const connection = this.accountList.showAllAccounts()
      ? this.store.connections().find((account) => account.connectionId === entry.connectionId)
      : this.store.selectedConnection();
    return (
      this.store.canManage() &&
      connection?.status === 'connected' &&
      connection.executionMode === 'cloud' &&
      entry.workspaceId === connection.workspaceId &&
      entry.connectionId === connection.connectionId &&
      this.itemIds(entry).length > 0
    );
  }
  constructor() {
    // Versandscheine gibt es nur für Cloud-Konten; sie gehören zum gewählten Konto.
    effect(() => {
      if (this.accountList.showAllAccounts()) {
        const workspaceId = this.store.connections()[0]?.workspaceId;
        if (workspaceId && this.store.canManage())
          untracked(() => void this.shippingLabels.load({ workspaceId }));
        return;
      }
      const connection = this.store.selectedConnection();
      if (connection?.executionMode !== 'cloud') return;
      const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
      untracked(() => void this.shippingLabels.load(scope));
    });
    effect(() => {
      const target = this.linkedSale();
      if (!target || this.store.loading() || this.activeSaleLink()) return;
      untracked(() => void this.store.selectConnection(target.scope.connectionId));
    });
    effect((onCleanup) => {
      const target = this.activeSaleLink();
      const known = this.linkedSaleInPage();
      this.fetchedSale.set(null);
      if (!target || known) return;
      let current = true;
      onCleanup(() => (current = false));
      const accept = (entry: MarketplaceEntry | null) => {
        if (!current || target !== this.activeSaleLink()) return;
        this.fetchedSale.set({
          link: target,
          entry: entry && entry.saleState !== 'relisted' && this.isLinkedSale(entry) ? entry : null,
        });
      };
      untracked(() => {
        void this.api.readVisibleSale(target.scope, target.saleId).then(accept, () => accept(null));
      });
    });
    let focusedLink: SaleLink | null = null;
    afterRenderEffect({
      write: () => {
        const target = this.activeSaleLink();
        if (
          !target ||
          target === focusedLink ||
          !this.entries().some((entry) => this.isLinkedSale(entry))
        )
          return;
        const card = this.host.nativeElement.querySelector<HTMLElement>(
          '[data-vinted-sale-target]',
        );
        if (!card) return;
        card.focus({ preventScroll: true });
        card.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        focusedLink = target;
      },
    });
  }

  isLinkedSale(entry: MarketplaceEntry): boolean {
    const target = this.activeSaleLink();
    return (
      target !== null &&
      entry.id === target.saleId &&
      entry.workspaceId === target.scope.workspaceId &&
      entry.connectionId === target.scope.connectionId
    );
  }
  details(entry: MarketplaceEntry): string {
    if (entry.isBundle || (entry.itemCount ?? 0) > 1)
      return entry.itemCount ? `Paket mit ${entry.itemCount} Artikeln` : 'Artikelpaket';
    return [entry.brand, entry.size].filter(Boolean).join(' \u00b7 ') || 'Einzelartikel';
  }
  badge(entry: MarketplaceEntry): { label: string; tone: BadgeTone } {
    switch (entry.saleState) {
      case 'sold':
        return { label: 'Verkauft', tone: 'info' };
      case 'shipped':
        return { label: 'Versendet', tone: 'info' };
      case 'completed':
        return { label: 'Abgeschlossen', tone: 'success' };
      case 'cancelled':
        return { label: 'Storniert', tone: 'critical' };
      default:
        return { label: entry.status ?? 'Status noch nicht bestätigt', tone: 'neutral' };
    }
  }
}
