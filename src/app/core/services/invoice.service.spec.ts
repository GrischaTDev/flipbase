import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { InvoiceService } from './invoice.service';
import { Sale, InventoryItem } from '../models/flipbase.models';
import { StoreOrder } from '../models/store.models';

describe('Invoice & Email Confirmation Service (§ 25a UStG Engine)', () => {
  let service: InvoiceService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new InvoiceService());
  });

  it('should generate a compliant § 25a UStG invoice for a Sale', () => {
    const sale: Sale = {
      id: 'sale-1',
      workspace_id: 'ws-1',
      inventory_item_id: 'item-1',
      sale_price: 150.0,
      sale_date: '2026-08-18',
      platform: 'kleinanzeigen',
      platform_fee: 0,
      shipping_cost: 5.49,
      packaging_cost: 1.0,
      other_costs: 0,
      net_profit: 60.0,
      roi: 66.6,
      holding_duration_days: 5,
      external_order_id: 'KA-991122',
      buyer_notes: 'Versicherter Versand gewünscht',
    };

    const item: InventoryItem = {
      id: 'item-1',
      workspace_id: 'ws-1',
      sku: 'SKU-NIN-SW',
      title: 'Nintendo Switch OLED Neon',
      condition: 'very_good',
      status: 'sold',
      allocated_purchase_cost: 80.0,
      expected_value: 150.0,
      created_at: '2026-08-10',
    };

    const invoice = service.generateInvoiceForSale(sale, item, {
      name: 'Max Mustermann',
      street: 'Hauptstraße 1',
      postalCode: '10115',
      city: 'Berlin',
      email: 'max@beispiel.de',
    });

    expect(invoice.invoiceNumber).toContain('RE-2026-');
    expect(invoice.orderNumber).toBe('KA-991122');
    expect(invoice.total).toBe(150.0);
    expect(invoice.taxMode).toBe('diff_25a');
    expect(invoice.taxClause).toContain('§ 25a UStG');
    expect(invoice.buyer.name).toBe('Max Mustermann');
  });

  it('should generate a compliant invoice for a Webshop StoreOrder', () => {
    const order: StoreOrder = {
      id: 'order-1',
      orderNumber: 'RF-889900',
      createdAt: '2026-08-18T10:00:00Z',
      customer: {
        firstName: 'Anna',
        lastName: 'Schmidt',
        email: 'anna.schmidt@test.de',
        street: 'Sonnenallee',
        houseNumber: '44',
        zip: '12045',
        city: 'Berlin',
        country: 'Deutschland',
        shippingMethod: 'dhl_standard',
        paymentMethod: 'stripe_card',
      },
      items: [
        {
          item: {
            id: 'item-2',
            workspace_id: 'ws-1',
            sku: 'SKU-APL-AIR',
            title: 'Apple AirPods Pro 2',
            condition: 'like_new',
            status: 'sold',
            allocated_purchase_cost: 120.0,
            expected_value: 180.0,
            created_at: '2026-08-12',
          },
          quantity: 1,
        },
      ],
      subtotal: 180.0,
      shippingCost: 0,
      total: 180.0,
      paymentMethod: 'stripe_card',
      paymentStatus: 'paid',
      status: 'confirmed',
    };

    const invoice = service.generateInvoiceForOrder(order);

    expect(invoice.orderNumber).toBe('RF-889900');
    expect(invoice.buyer.name).toBe('Anna Schmidt');
    expect(invoice.paymentMethod).toBe('Kreditkarte (Stripe)');
    expect(invoice.paymentStatus).toBe('paid');
    expect(invoice.items.length).toBe(1);
    expect(invoice.total).toBe(180.0);
  });

  it('should simulate sending a purchase confirmation email', async () => {
    const sale: Sale = {
      id: 'sale-3',
      workspace_id: 'ws-1',
      inventory_item_id: 'item-3',
      sale_price: 50.0,
      sale_date: '2026-08-18',
      platform: 'ebay',
      platform_fee: 5,
      shipping_cost: 4.5,
      packaging_cost: 0.5,
      other_costs: 0,
      net_profit: 20.0,
      roi: 80.0,
      holding_duration_days: 2,
    };

    const invoice = service.generateInvoiceForSale(sale);
    const emailRes = await service.sendConfirmationEmail(invoice);

    expect(emailRes.success).toBe(true);
    expect(service.sentEmails().length).toBeGreaterThan(0);
  });
});
