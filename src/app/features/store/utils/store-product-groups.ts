import { SellableItemRef } from '../../../core/models/store.models';

/** Zeigt im Sortiment eine Karte je Artikelgruppe; der Warenkorb nutzt weiterhin Varianten-IDs. */
export function storeCatalogCards(items: readonly SellableItemRef[]): SellableItemRef[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.variantGroupId ?? item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
