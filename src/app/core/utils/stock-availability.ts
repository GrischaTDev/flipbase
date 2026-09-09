import { Purchase } from '../models/flipbase.models';

export function hasSellableLotCost(lot: {
  readonly purchase?: Pick<Purchase, 'entry_status'> | null;
  readonly unit_cost: number | null;
}): boolean {
  return (
    lot.purchase?.entry_status === 'finalized' &&
    lot.unit_cost !== null &&
    Number.isFinite(lot.unit_cost) &&
    lot.unit_cost >= 0
  );
}
