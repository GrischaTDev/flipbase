import type { StockLot, StockMovement, StockPosition } from '../models/flipbase.models';

export interface StockQuantitySummary {
  /** Zahlen nur bei bekanntem Zustand anzeigen; sonst bleiben sie interne Vergleichswerte. */
  readonly state: 'known' | 'review_required';
  readonly onHand: number;
  readonly available: number;
  readonly reserved: number;
  readonly sold: number;
}

/** Berechnet einen Artikelbestand aus Positionen und den Bewegungen seiner belegten Lose. */
export function summarizeStockQuantities(
  positions: readonly StockPosition[],
  lots: readonly StockLot[],
  movements: readonly StockMovement[],
): StockQuantitySummary {
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  const reservedByLot = new Map<string, number>();
  const soldByLot = new Map<string, number>();
  let invalidMovement = false;
  for (const movement of movements) {
    const lot = lotById.get(movement.stock_lot_id);
    if (!lot || lot.workspace_id !== movement.workspace_id) continue;
    if (!Number.isSafeInteger(movement.quantity) || movement.quantity < 0) invalidMovement = true;
    const reservationDelta =
      movement.reason === 'reservation' && movement.direction === 'out'
        ? movement.quantity
        : movement.reason === 'reservation_release' && movement.direction === 'in'
          ? -movement.quantity
          : 0;
    reservedByLot.set(lot.id, (reservedByLot.get(lot.id) ?? 0) + reservationDelta);
    const soldDelta =
      movement.reason === 'sale' && movement.direction === 'out'
        ? movement.quantity
        : movement.reason === 'return' && movement.direction === 'in'
          ? -movement.quantity
          : 0;
    soldByLot.set(lot.id, (soldByLot.get(lot.id) ?? 0) + soldDelta);
  }

  const reservedBalances = [...reservedByLot.values()];
  const soldBalances = [...soldByLot.values()];
  const movementReserved = reservedBalances.reduce((sum, balance) => sum + Math.max(0, balance), 0);
  const positionReserved = positions.reduce((sum, position) => sum + position.reserved_quantity, 0);
  const positionAvailable = positions.reduce(
    (sum, position) => sum + position.available_quantity,
    0,
  );
  const onHand = positions.reduce((sum, position) => sum + position.on_hand_quantity, 0);
  const remaining = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  // Bereits in der Position berücksichtigte Reservierungen nicht ein zweites Mal abziehen.
  const reserved = Math.max(positionReserved, movementReserved);
  const available = Math.max(
    0,
    positionAvailable - Math.max(0, movementReserved - positionReserved),
  );
  const sold = soldBalances.reduce((sum, balance) => sum + Math.max(0, balance), 0);
  const invalid =
    invalidMovement ||
    [...reservedBalances, ...soldBalances].some((balance) => balance < 0) ||
    reserved > onHand ||
    lots.some(
      (lot) =>
        !Number.isSafeInteger(lot.received_quantity) ||
        !Number.isSafeInteger(lot.remaining_quantity) ||
        lot.remaining_quantity < 0 ||
        lot.remaining_quantity > lot.received_quantity,
    ) ||
    (remaining > 0 && positions.length === 0) ||
    (lots.length > 0 && positions.length > 0 && remaining !== onHand) ||
    positions.some(
      (position) =>
        [position.on_hand_quantity, position.available_quantity, position.reserved_quantity].some(
          (quantity) => !Number.isSafeInteger(quantity) || quantity < 0,
        ) || position.available_quantity + position.reserved_quantity > position.on_hand_quantity,
    );

  return { state: invalid ? 'review_required' : 'known', onHand, available, reserved, sold };
}
