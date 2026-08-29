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
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import {
  hasInventoryIntegrityConflict,
  isInventoryItemMutationLocked,
  isSellableInventoryItem,
} from '../../../../core/models/inventory-sellability';

interface DisplayPosition extends StockPosition {
  readonly lots: readonly StockLot[];
}

@Component({
  selector: 'app-stock-position-list',
  imports: [RouterLink, CurrencyPipe, DatePipe, LucideDynamicIcon],
  templateUrl: './stock-position-list.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockPositionListComponent {
  readonly positions = input.required<readonly StockPosition[]>();
  readonly lots = input<readonly StockLot[]>([]);
  readonly movements = input<readonly StockMovement[]>([]);
  readonly individualItems = input<readonly InventoryItem[]>([]);
  readonly selectedItemIds = input<ReadonlySet<string>>(new Set());
  readonly sell = output<StockPosition>();
  readonly sellIndividual = output<InventoryItem>();
  readonly selectionChanged = output<string>();
  readonly labelIndividual = output<InventoryItem>();
  readonly storeToggle = output<InventoryItem>();
  readonly statusChange = output<{ readonly item: InventoryItem; readonly status: ItemStatus }>();
  readonly restoreLegacy = output<{ readonly item: InventoryItem; readonly reason: string }>();
  readonly reconcileSale = output<InventoryItem>();

  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;
  readonly shoppingCartIcon = ShoppingCart;
  readonly packageOpenIcon = PackageOpen;
  readonly arrowRightIcon = ArrowRight;
  readonly printerIcon = Printer;
  readonly storeIcon = Store;
  readonly openPositionIds = signal<ReadonlySet<string>>(new Set());
  readonly legacyReasons = signal<Readonly<Record<string, string>>>({});

  readonly statusOptions: readonly { readonly value: ItemStatus; readonly label: string }[] = [
    { value: 'received', label: 'Auf Lager' },
    { value: 'needs_review', label: 'Prüfung nötig' },
    { value: 'researched', label: 'Recherchiert' },
    { value: 'ready', label: 'Bereit' },
    { value: 'listed', label: 'Gelistet' },
    { value: 'reserved', label: 'Reserviert' },
    { value: 'defective', label: 'Defekt' },
    { value: 'returned', label: 'Retourniert' },
    { value: 'archived', label: 'Archiviert' },
  ];

  readonly displayPositions = computed<readonly DisplayPosition[]>(() => {
    const lotsByProduct = new Map<string, StockLot[]>();
    for (const lot of this.lots()) {
      if (lot.remaining_quantity <= 0) continue;
      const productLots = lotsByProduct.get(lot.catalog_product_id) ?? [];
      productLots.push(lot);
      lotsByProduct.set(lot.catalog_product_id, productLots);
    }
    for (const productLots of lotsByProduct.values()) {
      productLots.sort((left, right) => left.received_at.localeCompare(right.received_at));
    }

    const aggregated = new Map<string, StockPosition>();
    for (const position of this.positions()) {
      if (position.available_quantity <= 0) continue;
      const existing = aggregated.get(position.catalog_product_id);
      aggregated.set(position.catalog_product_id, {
        ...position,
        title: existing?.title ?? position.title,
        available_quantity: (existing?.available_quantity ?? 0) + position.available_quantity,
        reserved_quantity: (existing?.reserved_quantity ?? 0) + position.reserved_quantity,
        on_hand_quantity: (existing?.on_hand_quantity ?? 0) + position.on_hand_quantity,
        oldest_available_unit_cost:
          existing?.oldest_available_unit_cost ?? position.oldest_available_unit_cost,
        is_public_store: existing?.is_public_store ?? position.is_public_store,
      });
    }

    return [...aggregated.values()]
      .map((position) => {
        const lots = lotsByProduct.get(position.catalog_product_id) ?? [];
        return {
          ...position,
          oldest_available_unit_cost: lots[0]?.unit_cost ?? position.oldest_available_unit_cost,
          lots,
        };
      })
      .sort((left, right) => left.title.localeCompare(right.title, 'de'));
  });

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

  hasIntegrityConflict(item: InventoryItem): boolean {
    return hasInventoryIntegrityConflict(item);
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedItemIds().has(itemId);
  }

  setLegacyReason(itemId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.legacyReasons.update((reasons) => ({ ...reasons, [itemId]: value }));
  }

  legacyReason(itemId: string): string {
    return this.legacyReasons()[itemId] ?? '';
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

  emitStatusChangeFromEvent(item: InventoryItem, event: Event): void {
    this.emitStatusChange(item, (event.target as HTMLSelectElement).value as ItemStatus);
  }

  emitRestoreLegacy(item: InventoryItem): void {
    const reason = this.legacyReason(item.id).trim();
    if (reason) this.restoreLegacy.emit({ item, reason });
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
      default:
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
}
