import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { FulfillmentService } from './fulfillment.service';

describe('Fulfillment & Smart Bundling Engine (Chapter 27)', () => {
  let service: FulfillmentService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new FulfillmentService());
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
    const ergebnis = await service.bundleOrders(candidate);
    const bundled = ergebnis.data;

    expect(ergebnis.error).toBeNull();
    if (!bundled) throw new Error('Das Sammelpaket fehlt.');
    expect(bundled.is_bundled).toBe(true);
    expect(bundled.item_title).toContain('SAMMELPAKET');
    expect(bundled.bundled_item_titles?.length).toBe(candidate.itemsCount);
    expect(service.orders().length).toBe(initialOrdersCount - candidate.itemsCount + 1);
  });

  it('should unbundle a bundled order back to individual shipments', async () => {
    const candidate = service.bundleCandidates()[0];
    const ergebnis = await service.bundleOrders(candidate);
    const bundled = ergebnis.data;

    if (!bundled) throw new Error('Das Sammelpaket fehlt.');
    const unbundleErgebnis = await service.unbundleOrder(bundled.id);
    expect(unbundleErgebnis.error).toBeNull();
    expect(service.orders().some((o) => o.id === bundled.id)).toBe(false);
  });

  it('erfindet keine Sendungsnummer, wenn kein Zusteller angebunden ist', async () => {
    // Dieser Test stand frueher andersherum: Er verlangte eine Nummer, die mit
    // "00340434" beginnt - dem echten DHL-Format. Damit war die Erfindung
    // festgeschrieben. Es wurde nie eine Marke gekauft, aber die Nummer landete
    // auf dem Etikett und damit beim Kaeufer.
    expect(service.zustellerAngebunden).toBe(false);
    await expect(service.purchaseShippingLabel()).rejects.toThrow();
  });

  it('uebernimmt eine selbst eingetragene Sendungsnummer', async () => {
    // Der ehrliche Weg: Marke beim Zusteller kaufen, echte Nummer eintragen.
    const order = service.orders()[0];

    const ergebnis = await service.markAsShipped(order.id, '00340434161094015902', 'dhl');

    expect(ergebnis.error).toBeNull();
    const aktualisiert = service.orders().find((o) => o.id === order.id);
    expect(aktualisiert?.tracking_number).toBe('00340434161094015902');
  });
});
