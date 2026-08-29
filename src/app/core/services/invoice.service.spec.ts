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

  it('should generate a compliant § 25a UStG invoice for a Sale', async () => {
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

    const result = await service.generateInvoiceForSale(sale, item, {
      name: 'Max Mustermann',
      street: 'Hauptstraße 1',
      postalCode: '10115',
      city: 'Berlin',
      email: 'max@beispiel.de',
    });

    expect(result.error).toBeNull();
    expect(result.created).toBe(true);
    const invoice = result.data!;
    expect(invoice.invoiceNumber).toContain('RE-2026-');
    expect(invoice.orderNumber).toBe('KA-991122');
    expect(invoice.total).toBe(150.0);
    expect(invoice.taxMode).toBe('diff_25a');
    expect(invoice.taxClause).toContain('§ 25a UStG');
    expect(invoice.buyer.name).toBe('Max Mustermann');
  });

  it('should generate a compliant invoice for a Webshop StoreOrder', async () => {
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

    const result = await service.generateInvoiceForOrder(order);
    expect(result.error).toBeNull();
    const invoice = result.data!;

    expect(invoice.orderNumber).toBe('RF-889900');
    expect(invoice.buyer.name).toBe('Anna Schmidt');
    expect(invoice.paymentMethod).toBe('Kreditkarte (Stripe)');
    expect(invoice.paymentStatus).toBe('paid');
    expect(invoice.items.length).toBe(1);
    expect(invoice.total).toBe(180.0);
  });

  it('erzeugt zwei Rechnungspositionen aus zwei persistierten Verkaufspositionen', async () => {
    const sale = {
      id: 'sale-lines',
      workspace_id: 'ws-1',
      sale_price: 29.97,
      sale_date: '2026-08-26',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      lines: [
        {
          id: 'line-1',
          sale_id: 'sale-lines',
          catalog_product_id: 'lamp-1',
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 9.99,
          line_total: 19.98,
          cost_of_goods_sold: 8,
          tax_mode: 'diff_25a',
        },
        {
          id: 'line-2',
          sale_id: 'sale-lines',
          inventory_item_id: 'adapter-1',
          title_snapshot: 'Adapter',
          quantity: 1,
          unit_sale_price: 9.99,
          line_total: 9.99,
          cost_of_goods_sold: 3,
          tax_mode: 'diff_25a',
        },
      ],
    } satisfies Sale;

    const result = await service.generateInvoiceForSale(sale);

    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.items.map((entry) => entry.quantity)).toEqual([2, 1]);
  });

  it('hält Positionen, Zwischensumme, Versand und Gesamtbetrag bei Versandkosten konsistent', async () => {
    const sale = {
      id: 'sale-shipping',
      workspace_id: 'ws-1',
      sale_price: 30,
      sale_date: '2026-08-26',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 5,
      packaging_cost: 0,
      other_costs: 0,
      lines: [
        {
          id: 'line-1',
          sale_id: 'sale-shipping',
          title_snapshot: 'A',
          quantity: 1,
          unit_sale_price: 10,
          line_total: 10,
          cost_of_goods_sold: 4,
          tax_mode: 'diff_25a',
        },
        {
          id: 'line-2',
          sale_id: 'sale-shipping',
          title_snapshot: 'B',
          quantity: 1,
          unit_sale_price: 20,
          line_total: 20,
          cost_of_goods_sold: 8,
          tax_mode: 'diff_25a',
        },
      ],
    } satisfies Sale;
    const invoice = (await service.generateInvoiceForSale(sale)).data!;

    expect(invoice.items.reduce((sum, entry) => sum + entry.totalPrice, 0)).toBe(invoice.subtotal);
    expect(invoice.subtotal + invoice.shippingCost).toBe(invoice.total);
    expect(invoice.total).toBe(30);
  });

  it('teilt Mengenpositionen ohne negativen Rundungsausgleich centgenau auf', async () => {
    const sale = {
      id: 'sale-quantity-rounding',
      workspace_id: 'ws-1',
      sale_price: 24.33,
      sale_date: '2026-08-26',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 5,
      packaging_cost: 0,
      other_costs: 0,
      lines: [
        {
          id: 'line-quantity-rounding',
          sale_id: 'sale-quantity-rounding',
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 9.665,
          line_total: 19.33,
          cost_of_goods_sold: 8,
          tax_mode: 'diff_25a',
        },
      ],
    } satisfies Sale;

    const invoice = (await service.generateInvoiceForSale(sale)).data!;
    expect(invoice.items).toEqual([
      expect.objectContaining({
        title: 'LED-Lampe (Preisgruppe 1)',
        quantity: 1,
        unitPrice: 9.66,
        totalPrice: 9.66,
      }),
      expect.objectContaining({
        title: 'LED-Lampe (Preisgruppe 2)',
        quantity: 1,
        unitPrice: 9.67,
        totalPrice: 9.67,
      }),
    ]);
    expect(invoice.items.every((item) => item.unitPrice * item.quantity === item.totalPrice)).toBe(
      true,
    );
    expect(invoice.items.every((item) => item.unitPrice >= 0 && item.totalPrice >= 0)).toBe(true);
    expect(invoice.items.reduce((sum, item) => sum + item.totalPrice, 0)).toBe(invoice.subtotal);
    expect(invoice.subtotal + invoice.shippingCost).toBe(invoice.total);
  });

  it('erhält bei historischen Display-Fallbacks den Override und die Legacy-Position', async () => {
    const historicSale = {
      id: 'sale-legacy',
      workspace_id: 'ws-1',
      inventory_item_id: 'item-legacy',
      sale_price: 50,
      sale_date: '2026-08-26',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 5,
      packaging_cost: 0,
      other_costs: 0,
      lines: [
        {
          id: 'fallback',
          sale_id: 'sale-legacy',
          title_snapshot: 'Altartikel',
          quantity: 1,
          unit_sale_price: 50,
          line_total: 50,
          cost_of_goods_sold: 0,
          tax_mode: 'diff_25a',
        },
      ],
      has_persisted_lines: false,
    } as Sale & { has_persisted_lines: boolean };
    const invoice = (
      await service.generateInvoiceForSale(historicSale, {
        ...({
          id: 'item-legacy',
          workspace_id: 'ws-1',
          title: 'Altartikel',
          condition: 'used',
          status: 'sold',
          allocated_purchase_cost: 10,
        } satisfies InventoryItem),
        tax_mode_override: 'regular_19',
      })
    ).data!;

    expect(invoice.taxMode).toBe('regular_19');
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].totalPrice).toBe(45);
  });

  it('bereitet eine Kaufbestätigung vor, ohne einen Versand zu behaupten', async () => {
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

    const invoice = (await service.generateInvoiceForSale(sale)).data!;
    const emailRes = await service.prepareConfirmationEmail(invoice);

    expect(emailRes.success).toBe(true);
    expect(emailRes.message).toContain('vorbereitet');
    expect(emailRes.message).not.toContain('gesendet');
    expect(service.sentEmails()[0].status).toBe('draft');
    expect(service.sentEmails().length).toBeGreaterThan(0);
  });

  it('öffnet dieselbe Verkaufsrechnung wieder, ohne eine zweite zu erzeugen', async () => {
    const sale = {
      id: 'sale-repeat',
      workspace_id: 'ws-1',
      inventory_item_id: 'item-repeat',
      sale_price: 50,
      sale_date: '2026-08-24',
      platform: 'ebay',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
    } satisfies Sale;

    const first = await service.generateInvoiceForSale(sale);
    const second = await service.generateInvoiceForSale(sale);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.data?.id).toBe(first.data?.id);
    expect(service.invoices()).toHaveLength(1);
  });
});
