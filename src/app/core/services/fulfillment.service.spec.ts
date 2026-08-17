import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { FulfillmentService } from './fulfillment.service';
import { ShippingOrder } from '../models/fulfillment.models';

describe('Fulfillment & Shipping Label Engine', () => {
  let service: FulfillmentService;

  beforeEach(() => {
    service = Object.create(FulfillmentService.prototype);
    service['orders'] = signal<ShippingOrder[]>([
      {
        id: 'ship-1',
        workspace_id: 'ws-1',
        sale_id: 'sale-1',
        order_number: 'ORD-2026-8801',
        order_date: new Date().toISOString(),
        platform: 'kleinanzeigen',
        item_title: 'Sony PlayStation 5 Digital Edition (CFI-1116B)',
        item_sku: 'SKU-PS5-DIG',
        item_condition: 'Sehr gut',
        sale_price: 360.0,
        customer: {
          name: 'Maximilian Weber',
          street: 'Hauptstraße',
          house_number: '42b',
          postal_code: '80331',
          city: 'München',
          country: 'Deutschland',
          email: 'max.weber@beispiel.de',
        },
        carrier: 'dhl',
        package_type: 'DHL Paket bis 5 kg',
        status: 'ready_to_pack',
        created_at: new Date().toISOString(),
      },
      {
        id: 'ship-2',
        workspace_id: 'ws-1',
        sale_id: 'sale-2',
        order_number: 'ORD-2026-8802',
        order_date: new Date().toISOString(),
        platform: 'ebay',
        item_title: 'Bosch Akku-Bohrschrauber',
        sale_price: 75.0,
        customer: {
          name: 'Laura Becker',
          street: 'Kaiserstraße',
          house_number: '17',
          postal_code: '60311',
          city: 'Frankfurt',
          country: 'Deutschland',
        },
        carrier: 'dhl',
        package_type: 'DHL Paket bis 2 kg',
        tracking_number: '00340434289012345678',
        tracking_url: 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=00340434289012345678',
        status: 'shipped',
        created_at: new Date().toISOString(),
      },
    ]);
  });

  it('should generate valid DHL and Hermes tracking URLs', () => {
    const dhlUrl = service.getTrackingUrl('dhl', '00340434289012345678');
    expect(dhlUrl).toContain('dhl.de');
    expect(dhlUrl).toContain('00340434289012345678');

    const hermesUrl = service.getTrackingUrl('hermes', '02345678901234');
    expect(hermesUrl).toContain('myhermes.de');
    expect(hermesUrl).toContain('02345678901234');
  });

  it('should correctly update order status to shipped with tracking number', () => {
    service.markAsShipped('ship-1', '00340123456789012345', 'dhl');
    const order = service.orders().find((o) => o.id === 'ship-1');

    expect(order?.status).toBe('shipped');
    expect(order?.tracking_number).toBe('00340123456789012345');
    expect(order?.tracking_url).toContain('00340123456789012345');
    expect(order?.shipped_at).toBeDefined();
  });

  it('should format sender address with defaults', () => {
    service['workspaceService'] = { currentWorkspace: () => ({ name: 'Test Shop' }) } as any;
    const sender = service.getSenderAddress();
    expect(sender.name).toBe('Test Shop');
    expect(sender.country).toBe('Deutschland');
  });
});
