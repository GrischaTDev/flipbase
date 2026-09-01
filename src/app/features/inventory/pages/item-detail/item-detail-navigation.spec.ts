import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { validatePurchaseReturnTo } from './item-detail.component';

describe('ItemDetailComponent – sicherer Rückweg zum Einkauf', () => {
  it.each([
    'https://example.org/purchases/purchase-1',
    '//example.org/purchases/purchase-1',
    '/purchases/../inventory',
    '/purchases/purchase-1?admin=true',
    '/purchases/purchase-1#fragment',
    '/purchases/purchase-1/extra',
    '/purchases\\purchase-1',
    '/purchases/%2F%2Fevil.example',
    '/purchases/',
    'kaputt',
  ])('lehnt den unsicheren oder fehlerhaften Rückweg %s ab', (value) => {
    expect(validatePurchaseReturnTo(value)).toBeNull();
  });

  it('akzeptiert ausschließlich eine interne Einkaufsdetailroute', () => {
    expect(validatePurchaseReturnTo('/purchases/123e4567-e89b-42d3-a456-426614174000')).toBe(
      '/purchases/123e4567-e89b-42d3-a456-426614174000',
    );
    expect(validatePurchaseReturnTo('/purchases/purchase_ABC-123')).toBe(
      '/purchases/purchase_ABC-123',
    );
  });
});
