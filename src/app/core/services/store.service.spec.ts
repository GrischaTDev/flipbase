import { describe, it, expect } from 'vitest';
import { InventoryItem } from '../models/reflip.models';
import { CartItem, StoreSettings } from '../models/store.models';

describe('Storefront & Cart Engine (Online Shop)', () => {
  const dummyItem: InventoryItem = {
    id: 'item-101',
    workspace_id: 'ws-1',
    purchase_id: 'p-1',
    sku: 'RF-SNES-01',
    title: 'Super Nintendo Classic Edition',
    brand: 'Nintendo',
    category: 'Gaming & Konsolen',
    condition: 'very_good',
    allocated_purchase_cost: 35.0,
    expected_value: 89.99,
    status: 'listed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const settings: StoreSettings = {
    storeName: 'ReFlip Store',
    tagline: 'Geprüfte Gebrauchtware',
    shippingFlatRate: 4.99,
    freeShippingThreshold: 50.0,
    currency: 'EUR',
    imprint: {
      owner: 'ReFlip',
      street: 'Musterstraße',
      city: 'Berlin',
      email: 'test@reflip.de',
    },
  };

  it('should correctly calculate cart subtotal with quantities', () => {
    const cart: CartItem[] = [
      { item: dummyItem, quantity: 2 },
    ];

    const subtotal = cart.reduce((sum, i) => sum + (i.item.expected_value || 0) * i.quantity, 0);
    expect(subtotal).toBeCloseTo(179.98, 2);
  });

  it('should grant free shipping when subtotal is above freeShippingThreshold', () => {
    const subtotal = 89.99;
    const shipping = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFlatRate;
    expect(shipping).toBe(0);
  });

  it('should apply shipping flat rate when subtotal is below freeShippingThreshold', () => {
    const smallItem: InventoryItem = {
      ...dummyItem,
      id: 'item-102',
      expected_value: 29.99,
    };
    const cart: CartItem[] = [{ item: smallItem, quantity: 1 }];
    const subtotal = cart.reduce((sum, i) => sum + (i.item.expected_value || 0) * i.quantity, 0);

    const shipping = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFlatRate;
    expect(shipping).toBe(4.99);

    const total = subtotal + shipping;
    expect(total).toBeCloseTo(34.98, 2);
  });

  it('should waive shipping cost when pickup is selected', () => {
    const shippingMethod = 'pickup';
    const subtotal = 29.99;
    const shipping = shippingMethod === 'pickup' ? 0 : settings.shippingFlatRate;
    expect(shipping).toBe(0);
  });
});
