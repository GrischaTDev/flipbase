/**
 * Vorbelegung für den gemeinsamen Verkaufsdialog. Die Union trennt
 * Mengenartikel und einzeln nachverfolgbare Inventarartikel strikt, damit
 * der Verkaufsfluss nie eine Kennung des falschen Typs verwenden kann.
 */
export type SaleTarget =
  | {
      readonly kind: 'catalog_product';
      readonly catalogProductId: string;
      readonly title: string;
      readonly availableQuantity: number;
    }
  | {
      readonly kind: 'inventory_item';
      readonly inventoryItemId: string;
      readonly title: string;
    };

/** Route-State-Vertrag zwischen Inventar und dem Verkaufsdialog (Aufgabe 6). */
export interface SaleTargetRouteState {
  readonly saleTarget: SaleTarget;
}
