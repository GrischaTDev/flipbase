import type { MarketplaceListingReference } from './marketplace-overview.models';
import { overviewListingKey } from './marketplace-overview-normalization';
export function selectVisibleListings(
  visible: readonly MarketplaceListingReference[],
  checked: boolean,
): readonly MarketplaceListingReference[] {
  return checked ? [...visible] : [];
}
export function toggleListingSelection(
  current: readonly MarketplaceListingReference[],
  reference: MarketplaceListingReference,
  checked: boolean,
  visible: readonly MarketplaceListingReference[],
): readonly MarketplaceListingReference[] {
  const allowed = new Set(visible.map(overviewListingKey));
  const key = overviewListingKey(reference);
  const retained = current.filter(
    (item) => allowed.has(overviewListingKey(item)) && overviewListingKey(item) !== key,
  );
  return checked && allowed.has(key) ? [...retained, reference] : retained;
}
