import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
  LucideShoppingCart as ShoppingCart,
  LucidePackageOpen as PackageOpen,
  LucideDynamicIcon,
} from '@lucide/angular';
import { InventoryItem, StockLot, StockPosition } from '../../../../core/models/flipbase.models';

interface DisplayPosition extends StockPosition {
  readonly lots: readonly StockLot[];
}

@Component({
  selector: 'app-stock-position-list',
  imports: [CurrencyPipe, DatePipe, LucideDynamicIcon],
  templateUrl: './stock-position-list.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockPositionListComponent {
  readonly positions = input.required<readonly StockPosition[]>();
  readonly lots = input<readonly StockLot[]>([]);
  /**
   * Kompatibilitaetseingabe fuer Aufrufer, die Einzelstuecke zusammen mit
   * Mengenpositionen anzeigen. Die Inventarseite trennt beides in Tabs.
   */
  readonly individualItems = input<readonly InventoryItem[]>([]);
  readonly sell = output<StockPosition>();

  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;
  readonly shoppingCartIcon = ShoppingCart;
  readonly packageOpenIcon = PackageOpen;
  readonly openPositionIds = signal<ReadonlySet<string>>(new Set());

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
