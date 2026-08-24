import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BundleCandidate, ShippingOrder } from '../../core/models/fulfillment.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { FulfillmentComponent } from './fulfillment.component';

const bestellung = {
  id: 'order-1',
  workspace_id: 'workspace-1',
  sale_id: 'sale-1',
  order_number: 'ORD-1',
  order_date: '2026-08-24T10:00:00.000Z',
  platform: 'ebay',
  item_title: 'Testartikel',
  sale_price: 20,
  customer: {
    name: 'Ada',
    street: 'Teststraße',
    house_number: '1',
    postal_code: '10115',
    city: 'Berlin',
    country: 'Deutschland',
  },
  carrier: 'dhl',
  package_type: 'Paket',
  status: 'ready_to_pack',
  created_at: '2026-08-24T10:00:00.000Z',
} as ShippingOrder;

const kandidat = {
  customerName: 'Ada',
  customerKey: 'ada-berlin',
  customerCity: 'Berlin',
  orders: [bestellung],
  itemsCount: 1,
  totalOrderValue: 20,
  individualShippingCost: 6.99,
  potentialSavings: 2,
  bundledShippingCost: 4.99,
  suggestedRate: {
    id: 'dhl',
    carrier: 'dhl',
    name: 'Paket',
    description: 'Testtarif',
    price: 4.99,
    weightLimitKg: 2,
    dimensions: '60 × 30 × 15 cm',
    isTrackingIncluded: true,
    isInsuranceIncluded: true,
  },
} as BundleCandidate;

function erstelleKomponente(ergebnis: { readonly error: Error | null }) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const fulfillmentService = {
    bundleOrders: vi.fn(async () => ergebnis),
    unbundleOrder: vi.fn(async () => ergebnis),
    markAsShipped: vi.fn(async () => ergebnis),
  };
  const dialog = { frage: vi.fn(async () => true) };
  const komponente = Object.create(FulfillmentComponent.prototype) as FulfillmentComponent;
  Object.assign(komponente, {
    fulfillmentService,
    dialog,
    syncStatus,
    toast,
    isBundling: signal(false),
    isPurchaseModalOpen: signal(true),
    isTrackingModalOpen: signal(true),
    trackingOrderId: signal(bestellung.id),
    trackingForm: {
      invalid: false,
      getRawValue: () => ({ carrier: 'dhl', trackingNumber: '0034043412345' }),
    },
    closeTrackingModal: vi.fn(),
  });

  return { komponente, dialog, fulfillmentService, toast };
}

describe('FulfillmentComponent – Aktionsmeldungen', () => {
  it('bestätigt das Bündeln erst nach Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onBundleCandidate(kandidat);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Sendungen wurden gebündelt.',
    });
  });

  it('bestätigt das Auflösen nach Bestätigung und Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onUnbundleOrder(bestellung);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Sammelpaket wurde aufgelöst.',
    });
  });

  it('schließt die Sendungsverfolgung erst nach bestätigtem Speichern', async () => {
    const { komponente, fulfillmentService, toast } = erstelleKomponente({
      error: new Error('offline'),
    });

    await komponente.onSaveTracking();

    expect(fulfillmentService.markAsShipped).toHaveBeenCalledOnce();
    expect(komponente.closeTrackingModal).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Sendungsverfolgung konnte nicht gespeichert werden.',
      persistent: true,
    });
  });
});
