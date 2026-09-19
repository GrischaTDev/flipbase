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
    markAsDelivered: vi.fn(async () => ({
      data: { ...bestellung, status: 'delivered' as const },
      error: null,
      reportedBySyncStatus: false,
    })),
    getSenderAddress: vi.fn(() => null),
    selectedOrderForLabel: signal<ShippingOrder | null>(null),
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
    isLabelModalOpen: signal(false),
    deliveringOrderId: signal<string | null>(null),
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
  it('lässt eine verspätete A-Antwort den laufenden B-Zustand unverändert', async () => {
    let currentWorkspaceId = 'workspace-a';
    let resolveA!: (value: { error: null }) => void;
    let resolveB!: (value: { error: null }) => void;
    const responseA = new Promise<{ error: null }>((resolve) => (resolveA = resolve));
    const responseB = new Promise<{ error: null }>((resolve) => (resolveB = resolve));
    const { komponente, fulfillmentService, toast } = erstelleKomponente({ error: null });
    fulfillmentService.bundleOrders.mockReturnValueOnce(responseA).mockReturnValueOnce(responseB);
    Object.assign(komponente, {
      workspaceService: { currentWorkspace: () => ({ id: currentWorkspaceId }) },
      workspaceActionVersion: 0,
    });

    const operationA = komponente.onBundleCandidate(kandidat);
    currentWorkspaceId = 'workspace-b';
    Object.assign(komponente, { workspaceActionVersion: 1 });
    komponente.isBundling.set(false);
    const operationB = komponente.onBundleCandidate(kandidat);

    resolveA({ error: null });
    await operationA;
    expect(komponente.isBundling()).toBe(true);
    expect(toast.toasts()).toEqual([]);

    resolveB({ error: null });
    await operationB;
    expect(komponente.isBundling()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ title: 'Sendungen wurden gebündelt.' });
  });

  it('bestätigt das Bündeln erst nach Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onBundleCandidate(kandidat);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Sendungen wurden gebündelt.',
    });
  });

  it('öffnet ohne hinterlegte Absenderadresse kein druckbares Etikett', () => {
    const { komponente, fulfillmentService, toast } = erstelleKomponente({ error: null });

    komponente.openLabelModal(bestellung);

    expect(komponente.isLabelModalOpen()).toBe(false);
    expect(fulfillmentService.selectedOrderForLabel()).toBeNull();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Absenderadresse fehlt.',
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

  it('bestätigt das Zustellen erst nach dem Service-Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.markDelivered(bestellung.id);

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Sendung wurde als zugestellt markiert.',
    });
  });

  it('beendet den Zustell-Ladezustand auch bei einer geworfenen Ausnahme', async () => {
    const { komponente, fulfillmentService, toast } = erstelleKomponente({ error: null });
    fulfillmentService.markAsDelivered.mockRejectedValue(new Error('offline'));

    await komponente.markDelivered(bestellung.id);

    expect(komponente.deliveringOrderId()).toBeNull();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Sendung konnte nicht als zugestellt markiert werden.',
      persistent: true,
    });
  });

  it('erzeugt bei reportedBySyncStatus keinen zweiten Feature-Toast', async () => {
    const { komponente, fulfillmentService, toast } = erstelleKomponente({ error: null });
    fulfillmentService.markAsDelivered.mockResolvedValue({
      data: null,
      error: new Error('offline'),
      reportedBySyncStatus: true,
    } as never);

    await komponente.markDelivered(bestellung.id);

    expect(toast.toasts()).toEqual([]);
  });
});
