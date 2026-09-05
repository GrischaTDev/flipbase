import type { Purchase, Sale, StockLot } from '../models/flipbase.models';
import { purchaseIsFinalized } from './cost-basis';

export type InventorySourceState = 'known' | 'loading' | 'error';
type CostState = { readonly kind: 'known'; readonly amount: number } | { readonly kind: 'open' };
function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}
function knownCost(amount: number): CostState {
  return { kind: 'known', amount: cents(amount) / 100 };
}

interface LotCostResult {
  readonly remainingValueCents: number | null;
  readonly historicalPoolCents: number | null;
  readonly costPerUnit: CostState;
}

export function lotCostResult(
  lot: StockLot,
  purchase: Purchase | undefined,
  sales: readonly Sale[],
  salesState: InventorySourceState,
): LotCostResult {
  if (!purchaseIsFinalized(purchase) || lot.received_quantity <= 0) {
    return {
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    };
  }
  const originalPoolCents = cents(Number(lot.unit_cost) * lot.received_quantity);
  if (lot.remaining_quantity === lot.received_quantity) {
    return {
      remainingValueCents: originalPoolCents,
      historicalPoolCents: originalPoolCents,
      costPerUnit: knownCost(originalPoolCents / 100 / lot.remaining_quantity),
    };
  }
  if (lot.remaining_quantity === 0) {
    const allocations = sales.flatMap((sale) =>
      (sale.lot_allocations ?? [])
        .filter((allocation) => allocation.stock_lot_id === lot.id)
        .map((allocation) => ({
          allocation,
          activeSale: !sale.returned_at && !sale.voided_at,
        })),
    );
    const activeQuantity = allocations.reduce(
      (sum, entry) => sum + (entry.activeSale ? entry.allocation.quantity : 0),
      0,
    );
    const activeCostCents = allocations.reduce(
      (sum, entry) => sum + cents(Number(entry.allocation.active_allocated_cost)),
      0,
    );
    const isAuthoritative =
      salesState === 'known' &&
      allocations.length > 0 &&
      allocations.every((entry) => entry.allocation.active_allocated_cost != null) &&
      activeQuantity === lot.received_quantity &&
      activeCostCents === originalPoolCents;
    return {
      remainingValueCents: 0,
      historicalPoolCents: isAuthoritative ? originalPoolCents : null,
      costPerUnit: isAuthoritative
        ? knownCost(originalPoolCents / 100 / lot.received_quantity)
        : { kind: 'open' },
    };
  }
  if (
    lot.remaining_quantity < 0 ||
    lot.remaining_quantity > lot.received_quantity ||
    salesState !== 'known'
  ) {
    return {
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    };
  }
  const salesWithAllocations = sales.filter((sale) =>
    (sale.lot_allocations ?? []).some((allocation) => allocation.stock_lot_id === lot.id),
  );
  if (salesWithAllocations.some((sale) => !!sale.returned_at || !!sale.voided_at)) {
    return {
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    };
  }
  const allocations = salesWithAllocations.flatMap((sale) =>
    (sale.lot_allocations ?? []).filter((allocation) => allocation.stock_lot_id === lot.id),
  );
  const consumedQuantity = lot.received_quantity - lot.remaining_quantity;
  if (
    allocations.length === 0 ||
    allocations.some((allocation) => allocation.active_allocated_cost == null) ||
    allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== consumedQuantity
  ) {
    return {
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    };
  }
  const activeCostCents = allocations.reduce(
    (sum, allocation) => sum + cents(Number(allocation.active_allocated_cost)),
    0,
  );
  const remainingValueCents = originalPoolCents - activeCostCents;
  if (remainingValueCents < 0) {
    return {
      remainingValueCents: null,
      historicalPoolCents: null,
      costPerUnit: { kind: 'open' },
    };
  }
  return {
    remainingValueCents,
    historicalPoolCents: null,
    costPerUnit: knownCost(remainingValueCents / 100 / lot.remaining_quantity),
  };
}
