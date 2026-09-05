import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
  LucideShoppingCart as ShoppingCart,
  LucidePackageOpen as PackageOpen,
  LucideArrowRight as ArrowRight,
  LucidePrinter as Printer,
  LucideStore as Store,
  LucideDynamicIcon,
} from '@lucide/angular';
import {
  InventoryItem,
  ItemStatus,
  Purchase,
  Sale,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import {
  isInventoryItemMutationLocked,
  isSellableInventoryItem,
} from '../../../../core/models/inventory-sellability';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import type { InventoryPresentationRow } from '../../models/inventory-presentation.models';
import { editableItemStatusOptions } from '../../models/item-status-options';
import {
  buildInventoryPresentation,
  InventorySourceState,
} from '../../utils/inventory-presentation';

@Component({
  selector: 'app-stock-position-list',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    CustomSelectComponent,
    CostStateComponent,
    ItemConditionLabelPipe,
  ],
  templateUrl: './stock-position-list.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockPositionListComponent {
  readonly archivePendingIds = input<ReadonlySet<string>>(new Set());
  readonly archiveItem = output<InventoryItem>();
  readonly visibleColumns = input<readonly string[]>([
    'selection',
    'title',
    'condition',
    'quantity',
    'status',
    'origin',
    'unit_cost',
    'inventory_value',
    'sale',
    'actions',
  ]);
  readonly presentationRows = input<readonly InventoryPresentationRow[] | null>(null);
  readonly positions = input.required<readonly StockPosition[]>();
  readonly lots = input<readonly StockLot[]>([]);
  readonly movements = input<readonly StockMovement[]>([]);
  readonly purchases = input<readonly Purchase[]>([]);
  readonly sales = input<readonly Sale[]>([]);
  readonly workspaceId = input('');
  readonly inventoryState = input<InventorySourceState>('known');
  readonly stockState = input<InventorySourceState>('known');
  readonly stockWorkspaceId = input<string | null | undefined>(undefined);
  readonly purchaseState = input<InventorySourceState>('known');
  readonly salesState = input<InventorySourceState>('known');
  readonly individualItems = input<readonly InventoryItem[]>([]);
  readonly selectedItemIds = input<ReadonlySet<string>>(new Set());
  readonly sell = output<StockPosition>();
  readonly sellIndividual = output<InventoryItem>();
  readonly selectionChanged = output<string>();
  readonly labelIndividual = output<InventoryItem>();
  readonly storeToggle = output<InventoryItem>();
  readonly statusChange = output<{ readonly item: InventoryItem; readonly status: ItemStatus }>();
  readonly restoreLegacy = output<InventoryItem>();
  readonly reconcileSale = output<InventoryItem>();

  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;
  readonly shoppingCartIcon = ShoppingCart;
  readonly packageOpenIcon = PackageOpen;
  readonly arrowRightIcon = ArrowRight;
  readonly printerIcon = Printer;
  readonly storeIcon = Store;
  readonly openPositionIds = signal<ReadonlySet<string>>(new Set());

  readonly statusOptions: SelectOption<ItemStatus>[] = [...editableItemStatusOptions];

  readonly presentation = computed(() =>
    buildInventoryPresentation({
      workspaceId: this.workspaceId() || this.detectWorkspaceId(),
      inventoryState: this.inventoryState(),
      stockState: this.stockState(),
      stockWorkspaceId: this.stockWorkspaceId(),
      purchaseState: this.purchaseState(),
      salesState: this.salesState(),
      individualItems: this.individualItems(),
      positions: this.positions(),
      lots: this.lots(),
      movements: this.movements(),
      purchases: this.purchases(),
      sales: this.sales(),
    }),
  );

  readonly rows = computed(() => this.presentationRows() ?? this.presentation().rows);

  readonly movementRows = computed(() => {
    const lotById = new Map(this.lots().map((lot) => [lot.id, lot]));
    return this.movements().map((movement) => {
      const lot = lotById.get(movement.stock_lot_id) as
        (StockLot & { catalog_product?: { title?: string } | null }) | undefined;
      const position = this.positions().find(
        (entry) => entry.catalog_product_id === lot?.catalog_product_id,
      );
      return {
        ...movement,
        title: lot?.catalog_product?.title ?? position?.title ?? 'Unbekannter Artikel',
      };
    });
  });

  isSellable(item: InventoryItem): boolean {
    return isSellableInventoryItem(item);
  }

  isMutationLocked(item: InventoryItem): boolean {
    return isInventoryItemMutationLocked(item);
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedItemIds().has(itemId);
  }

  emitStatusChange(item: InventoryItem, status: ItemStatus | null): void {
    if (status && !this.isMutationLocked(item)) this.statusChange.emit({ item, status });
  }

  emitStoreToggle(item: InventoryItem): void {
    if (!this.isMutationLocked(item)) this.storeToggle.emit(item);
  }

  emitIndividualSale(item: InventoryItem): void {
    if (this.isSellable(item)) this.sellIndividual.emit(item);
  }

  emitRestoreLegacy(item: InventoryItem): void {
    if (item.sale_state === 'legacy_sold_unverified') this.restoreLegacy.emit(item);
  }

  movementReason(reason: StockMovement['reason']): string {
    switch (reason) {
      case 'receipt':
        return 'Wareneingang';
      case 'sale':
        return 'Verkauf';
      case 'return':
        return 'Rückgabe';
      case 'damage':
        return 'Beschädigung';
      case 'loss':
        return 'Verlust';
      case 'reservation':
        return 'Reservierung';
      case 'reservation_release':
        return 'Reservierung aufgehoben';
      case 'correction':
        return 'Korrektur';
    }
  }

  toggleLots(productId: string): void {
    this.openPositionIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  areLotsOpen(productId: string): boolean {
    return this.openPositionIds().has(productId);
  }

  stockPosition(row: InventoryPresentationRow): StockPosition {
    return {
      catalog_product_id: row.actionId,
      title: row.title,
      available_quantity: row.quantity.available,
      reserved_quantity: row.quantity.reserved,
      on_hand_quantity: row.quantity.available + row.quantity.reserved,
      oldest_available_unit_cost: row.costPerUnit.kind === 'known' ? row.costPerUnit.amount : null,
      is_public_store: row.isPublicStore,
    };
  }

  private detectWorkspaceId(): string {
    return (
      this.individualItems()[0]?.workspace_id ??
      this.lots()[0]?.workspace_id ??
      this.sales()[0]?.workspace_id ??
      this.purchases()[0]?.workspace_id ??
      ''
    );
  }
}
