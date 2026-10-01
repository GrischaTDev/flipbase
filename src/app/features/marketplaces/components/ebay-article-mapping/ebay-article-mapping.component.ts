import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideLink2, LucideTrash2 } from '@lucide/angular';
import type { EbayListing } from '../../../../../../supabase/functions/_shared/ebay-contracts';
import type { EbayArticleMapping } from '../../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import type { AccountScope } from '../../models/marketplace.models';
import { EbayArticleMappingStore } from '../../services/ebay-article-mapping.store';
import { CatalogService } from '../../../../core/services/catalog.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { StockService } from '../../../../core/services/stock.service';
import { isSellableInventoryItem } from '../../../../core/models/inventory-sellability';
import { buildSaleArticleEntries } from '../../../sales/utils/sale-article-selection';
import { ArticlePickerComponent } from '../../../../shared/components/article-picker/article-picker.component';
import type { ArticlePickerEntry } from '../../../../shared/components/article-picker/article-picker.models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';

interface EbayMappingRow {
  readonly variationId: string | null;
  readonly label: string;
  readonly canMap: boolean;
  readonly mapping: EbayArticleMapping | null;
  readonly targetLabel: string;
}
@Component({
  selector: 'app-ebay-article-mapping',
  imports: [ArticlePickerComponent, ButtonComponent, CardComponent],
  providers: [EbayArticleMappingStore],
  templateUrl: './ebay-article-mapping.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EbayArticleMappingComponent {
  readonly scope = input.required<AccountScope>();
  readonly listing = input.required<EbayListing>();
  readonly closed = output<void>();
  readonly store = inject(EbayArticleMappingStore);
  private readonly catalog = inject(CatalogService);
  private readonly inventory = inject(InventoryService);
  private readonly purchases = inject(PurchaseService);
  private readonly stock = inject(StockService);
  private revision = 0;
  private selectedRow: EbayMappingRow | null = null;
  private selectionScope: (AccountScope & { listingId: string }) | null = null;
  private articleRequestId = 0;
  readonly pickerOpen = signal(false);
  readonly articleLoading = signal(false);
  readonly articleError = signal<string | null>(null);
  readonly linkIcon = LucideLink2;
  readonly removeIcon = LucideTrash2;
  private readonly sourcesReady = computed(() => {
    const workspaceId = this.scope().workspaceId;
    return [this.catalog, this.inventory, this.purchases, this.stock].every(
      (service) => service.loadedWorkspaceId() === workspaceId && !service.loadError(),
    );
  });
  readonly entries = computed(() => {
    if (!this.sourcesReady()) return [];
    const products = this.catalog.products();
    return buildSaleArticleEntries(
      this.scope().workspaceId,
      products,
      this.inventory.items().filter(isSellableInventoryItem),
      this.purchases.purchases(),
      this.stock.positions(),
      new Set(),
    ).filter(
      (entry) =>
        !entry.id.startsWith('unavailable:') &&
        (entry.id.startsWith('inventory:') ||
          products.some(
            (product) =>
              `catalog:${product.id}` === entry.id && product.tracking_mode === 'quantity',
          )),
    );
  });
  readonly rows = computed<readonly EbayMappingRow[]>(() => {
    const listing = this.listing();
    const variants = listing.hasVariations ? (listing.variants ?? []) : [];
    const choices = listing.hasVariations
      ? variants.map((variant) => ({
          variationId: variant.id,
          label:
            variant.aspects.map((aspect) => `${aspect.name}: ${aspect.value}`).join(' · ') ||
            'Variante',
          canMap: !!variant.id,
        }))
      : [{ variationId: null, label: listing.title, canMap: true }];
    if (listing.hasVariations && choices.length === 0)
      choices.push({
        variationId: null,
        label: 'Variantenkennung fehlt – ordne den Artikel in der Bestellprüfung zu.',
        canMap: false,
      });
    return choices.map((choice) => {
      const mapping = choice.canMap
        ? (this.store
            .mappings()
            .find(
              (item) => item.listingId === listing.id && item.variationId === choice.variationId,
            ) ?? null)
        : null;
      let targetLabel = 'Noch kein Flipbase-Artikel zugeordnet';
      if (mapping) {
        const key =
          'inventoryItemId' in mapping.target
            ? `inventory:${mapping.target.inventoryItemId}`
            : `catalog:${mapping.target.catalogProductId}`;
        const entry = this.entries().find((item) => item.id === key);
        targetLabel = entry
          ? entry.title + (entry.disabledReason ? ` – ${entry.disabledReason}` : '')
          : this.sourcesReady()
            ? 'Der gespeicherte Artikel ist nicht mehr für einen Verkauf verfügbar.'
            : 'Gespeicherter Artikel – Bestand wird geprüft.';
      }
      return { ...choice, mapping, targetLabel };
    });
  });
  constructor() {
    effect(() => {
      const scope = this.scope();
      this.listing();
      const revision = ++this.revision;
      this.pickerOpen.set(false);
      this.selectedRow = null;
      this.selectionScope = null;
      void this.store.load(scope);
      void this.loadArticles(revision);
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.store.clear();
    });
  }
  private async loadArticles(revision: number): Promise<void> {
    const articleRequestId = ++this.articleRequestId;
    this.articleLoading.set(true);
    this.articleError.set(null);
    const workspaceId = this.scope().workspaceId;
    try {
      await Promise.all([
        this.catalog.loadProducts(workspaceId),
        this.inventory.loadInventory(workspaceId),
        this.purchases.loadPurchases(workspaceId),
        this.stock.loadPositions(workspaceId),
      ]);
      if (
        revision === this.revision &&
        articleRequestId === this.articleRequestId &&
        !this.sourcesReady()
      )
        this.articleError.set(
          'Die Artikel oder Bestände konnten nicht vollständig geladen werden. Lade sie erneut.',
        );
    } catch {
      if (revision === this.revision && articleRequestId === this.articleRequestId)
        this.articleError.set('Die Artikel konnten nicht geladen werden.');
    } finally {
      if (revision === this.revision && articleRequestId === this.articleRequestId)
        this.articleLoading.set(false);
    }
  }
  async openPicker(row: EbayMappingRow): Promise<void> {
    if (
      !row.canMap ||
      this.store.loading() ||
      !this.rows().some(
        (candidate) => candidate.variationId === row.variationId && candidate.canMap,
      )
    )
      return;
    this.selectionScope = { ...this.scope(), listingId: this.listing().id };
    this.selectedRow = row;
    this.pickerOpen.set(true);
    await this.loadArticles(this.revision);
  }
  closePicker(): void {
    if (!this.store.loading()) {
      this.pickerOpen.set(false);
      this.selectedRow = null;
      this.selectionScope = null;
    }
  }
  async selectArticle(selected: readonly ArticlePickerEntry[]): Promise<void> {
    const row = this.selectedRow;
    const selectionScope = this.selectionScope;
    if (
      !selectionScope ||
      selectionScope.workspaceId !== this.scope().workspaceId ||
      selectionScope.connectionId !== this.scope().connectionId ||
      selectionScope.listingId !== this.listing().id
    )
      return;
    if (!row?.canMap || selected.length !== 1 || this.articleLoading() || this.articleError())
      return;
    const entry = this.entries().find((candidate) => candidate.id === selected[0].id);
    if (!entry || entry.disabledReason || !entry.availableQuantity || entry.availableQuantity < 1)
      return;
    const target = entry.id.startsWith('inventory:')
      ? { inventoryItemId: entry.id.slice(10) }
      : { catalogProductId: entry.id.slice(8) };
    const revision = this.revision;
    if (
      (await this.store.save(this.scope(), this.listing().id, row.variationId, target)) &&
      revision === this.revision
    )
      this.closePicker();
  }
  async remove(row: EbayMappingRow): Promise<void> {
    if (row.mapping) await this.store.remove(this.scope(), row.mapping.id);
  }
}
