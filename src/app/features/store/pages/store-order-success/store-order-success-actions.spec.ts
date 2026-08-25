import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { StoreOrder } from '../../../../core/models/store.models';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { StoreOrderSuccessComponent } from './store-order-success.component';

const order = {
  id: 'order-1',
  orderNumber: 'FB-1',
  createdAt: '2026-08-24T10:00:00Z',
  customer: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    street: 'Testweg',
    houseNumber: '1',
    zip: '10115',
    city: 'Berlin',
    country: 'DE',
    shippingMethod: 'dhl_standard',
    paymentMethod: 'bank_transfer',
  },
  items: [],
  subtotal: 0,
  shippingCost: 0,
  total: 0,
  paymentMethod: 'bank_transfer',
  paymentStatus: 'paid',
  status: 'confirmed',
} satisfies StoreOrder;

function erstelleKomponente() {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const invoiceService = {
    generateInvoiceForOrder: vi.fn(async () => ({
      data: { id: 'invoice-1' },
      error: null,
      created: true,
      reportedBySyncStatus: false,
    })),
  };
  const component = Object.create(
    StoreOrderSuccessComponent.prototype,
  ) as StoreOrderSuccessComponent;
  Object.assign(component, {
    order: signal(order),
    activeInvoice: signal(null),
    isCreatingInvoice: signal(false),
    invoiceService,
    toast,
    syncStatus,
  });
  return { component, invoiceService, syncStatus, toast };
}

describe('StoreOrderSuccessComponent – Rechnung', () => {
  it('startet bei einem Doppelklick nur eine Rechnungserstellung', async () => {
    const { component, invoiceService } = erstelleKomponente();
    let resolve!: (value: {
      data: { id: string };
      error: null;
      created: boolean;
      reportedBySyncStatus: boolean;
    }) => void;
    invoiceService.generateInvoiceForOrder.mockImplementation(
      () =>
        new Promise((resolver) => {
          resolve = resolver;
        }),
    );

    const first = component.openInvoice();
    const second = component.openInvoice();

    expect(invoiceService.generateInvoiceForOrder).toHaveBeenCalledOnce();
    resolve({
      data: { id: 'invoice-1' },
      error: null,
      created: true,
      reportedBySyncStatus: false,
    });
    await Promise.all([first, second]);
  });

  it('öffnet nur eine bestätigte Rechnung und bestätigt nur deren Neuerstellung', async () => {
    const { component, invoiceService, toast } = erstelleKomponente();
    await component.openInvoice();
    expect(component.activeInvoice()).toMatchObject({ id: 'invoice-1' });
    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Rechnung wurde erstellt.' });

    invoiceService.generateInvoiceForOrder.mockResolvedValue({
      data: { id: 'invoice-1' },
      error: null,
      created: false,
      reportedBySyncStatus: false,
    });
    toast.toasts().forEach((meldung) => toast.dismiss(meldung.id));
    await component.openInvoice();
    expect(toast.toasts()).toEqual([]);
  });

  it('öffnet bei zentral gemeldetem Fehler keine Rechnung und keinen Feature-Toast', async () => {
    const { component, invoiceService, syncStatus, toast } = erstelleKomponente();
    const error = syncStatus.melde('Erstellen der Rechnung', new Error('offline'));
    invoiceService.generateInvoiceForOrder.mockResolvedValue({
      data: null,
      error,
      created: false,
      reportedBySyncStatus: true,
    } as never);
    await component.openInvoice();
    expect(component.activeInvoice()).toBeNull();
    expect(component.isCreatingInvoice()).toBe(false);
    expect(toast.toasts()).toEqual([]);
  });
});
