import type { Purchase } from '../../../core/models/flipbase.models';

export function isFreePurchase(purchase: Purchase | null | undefined): boolean {
  return (
    !!purchase?.purchase_lines?.length &&
    purchase.purchase_lines.every((line) => line.position_kind === 'free')
  );
}
