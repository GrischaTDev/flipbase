import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { FulfillmentService } from './fulfillment.service';

describe('Fulfillment & Smart Bundling Engine (Chapter 27)', () => {
  let service: FulfillmentService;

  beforeEach(() => {
    service = new FulfillmentService();
    service.loadDemoOrders();
  });

  it('should automatically detect bundle candidates for same customer', () => {
    const candidates = service.bundleCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].customerName).toBe('Maximilian Weber');
    expect(candidates[0].itemsCount).toBeGreaterThanOrEqual(2);
    expect(candidates[0].potentialSavings).toBeGreaterThanOrEqual(0);
  });

  it('should bundle multiple orders into single combined order', async () => {
    const candidate = service.bundleCandidates()[0];
    const initialOrdersCount = service.orders().length;
    const bundled = await service.bundleOrders(candidate);

    expect(bundled.is_bundled).toBe(true);
    expect(bundled.item_title).toContain('SAMMELPAKET');
    expect(bundled.bundled_item_titles?.length).toBe(candidate.itemsCount);
    expect(service.orders().length).toBe(initialOrdersCount - candidate.itemsCount + 1);
  });

  it('should unbundle a bundled order back to individual shipments', async () => {
    const candidate = service.bundleCandidates()[0];
    const bundled = await service.bundleOrders(candidate);

    await service.unbundleOrder(bundled.id);
    expect(service.orders().some((o) => o.id === bundled.id)).toBe(false);
  });

  it('should purchase a DHL shipping label and update order status', async () => {
    const order = service.orders()[0];
    const res = await service.purchaseShippingLabel(order.id, 'dhl-paket-2kg');

    expect(res.success).toBe(true);
    expect(res.trackingNumber).toContain('00340434');
    expect(res.trackingUrl).toContain('dhl.de');

    const updated = service.orders().find((o) => o.id === order.id);
    expect(updated?.status).toBe('label_printed');
    expect(updated?.label_price).toBe(5.49);
    expect(updated?.tracking_number).toBe(res.trackingNumber);
  });
});
