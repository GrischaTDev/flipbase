import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { StoreService } from './store.service';
import { InventoryItem } from '../models/reflip.models';

describe('Store & Live Checkout Service', () => {
  let storeService: StoreService;

  beforeEach(() => {
    storeService = new StoreService();
    storeService.clearCart();
  });

  it('should initialize with default store and payment settings', () => {
    const settings = storeService.storeSettings();
    expect(settings.payments.stripeEnabled).toBe(true);
    expect(settings.payments.paypalEnabled).toBe(true);
    expect(settings.payments.bankTransferEnabled).toBe(true);
  });

  it('should calculate cart totals and shipping costs correctly', () => {
    const sampleItem: InventoryItem = {
      id: 'inv-test-1',
      workspace_id: 'ws-1',
      sku: 'SKU-TEST-1',
      title: 'Sony PlayStation 5 Disc Edition',
      status: 'ready',
      allocated_purchase_cost: 300,
      expected_value: 450,
      condition: 'very_good',
      created_at: '2026-08-18',
    };

    storeService.addToCart(sampleItem, 1);
    expect(storeService.cartItemCount()).toBe(1);
    expect(storeService.cartSubtotal()).toBe(450);
    // Subtotal 450 >= freeShippingThreshold 50 -> shippingCost = 0
    expect(storeService.cartShippingCost()).toBe(0);
    expect(storeService.cartTotal()).toBe(450);
  });

  it('should process Stripe payment and simulate gateway roundtrip', async () => {
    const res = await storeService.processStripePayment(100, {
      holder: 'Max Mustermann',
      last4: '4242',
      brand: 'Visa',
    });

    expect(res.success).toBe(true);
    expect(res.transactionId).toContain('ch_stripe_');
  });

  it('should process PayPal payment and generate transaction ID', async () => {
    const res = await storeService.processPayPalPayment(150);

    expect(res.success).toBe(true);
    expect(res.transactionId).toContain('PAYID-');
  });

  it('should update payment gateway configuration', () => {
    storeService.updatePaymentsConfig({
      stripePublishableKey: 'pk_live_custom_key_456',
      paypalEmail: 'shop@myreflipdomain.com',
    });

    const pm = storeService.storeSettings().payments;
    expect(pm.stripePublishableKey).toBe('pk_live_custom_key_456');
    expect(pm.paypalEmail).toBe('shop@myreflipdomain.com');
  });
});
