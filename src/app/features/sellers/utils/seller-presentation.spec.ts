import { describe, expect, it } from 'vitest';
import type { Supplier } from '../../../core/models/flipbase.models';
import { filterSellers, formatSellerLocation } from './seller-presentation';

const sellers: Supplier[] = [
  {
    id: 'company-1',
    workspace_id: 'workspace-1',
    name: 'Close Vintage',
    seller_type: 'business',
    city: 'Berlin',
    country_code: 'DE',
  },
  {
    id: 'private-1',
    workspace_id: 'workspace-1',
    name: 'Ada Beispiel',
    seller_type: 'private',
    country_code: 'AT',
  },
];

describe('seller presentation', () => {
  it('filtert Verkäufer ausschließlich nach ihrem Typ', () => {
    expect(filterSellers(sellers, 'company').map((seller) => seller.id)).toEqual(['company-1']);
    expect(filterSellers(sellers, 'private').map((seller) => seller.id)).toEqual(['private-1']);
    expect(filterSellers(sellers, 'all')).toEqual(sellers);
  });

  it('formatiert Ort und deutschen Ländernamen ohne leere Trenner', () => {
    expect(formatSellerLocation(sellers[0])).toBe('Berlin, Deutschland');
    expect(formatSellerLocation(sellers[1])).toBe('Österreich');
  });
});
