import type { Supplier } from '../../../core/models/flipbase.models';

export type SellerTypeFilter = 'all' | 'company' | 'private';

const germanRegionNames = new Intl.DisplayNames(['de'], { type: 'region' });

export function filterSellers(
  sellers: readonly Supplier[],
  filter: SellerTypeFilter,
): readonly Supplier[] {
  if (filter === 'all') return sellers;
  const sellerType = filter === 'company' ? 'business' : 'private';
  return sellers.filter((seller) => seller.seller_type === sellerType);
}

export function formatSellerLocation(seller: Supplier): string {
  const countryCode = seller.country_code?.toUpperCase();
  const countryName = countryCode ? germanRegionNames.of(countryCode) : seller.country;

  return [seller.city, countryName].filter(Boolean).join(', ') || '—';
}

export function sellerTypeLabel(seller: Supplier): string {
  if (seller.seller_type === 'business') return 'Unternehmen';
  if (seller.seller_type === 'private') return 'Privatperson';
  return 'Nicht festgelegt';
}
