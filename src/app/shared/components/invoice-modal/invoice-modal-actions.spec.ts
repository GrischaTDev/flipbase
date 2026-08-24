import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Invoice } from '../../../core/models/invoice.models';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { ToastService } from '../toast/toast.service';
import { InvoiceModalComponent } from './invoice-modal.component';

const rechnung: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'RE-2026-0001',
  orderNumber: 'order-1',
  invoiceDate: '2026-08-24',
  deliveryDate: '2026-08-24',
  seller: {
    name: 'Flipbase',
    street: 'Musterstraße 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'DE',
  },
  buyer: {
    name: 'Max Mustermann',
    street: 'Testweg 2',
    postalCode: '10117',
    city: 'Berlin',
    country: 'DE',
    email: 'max@example.test',
  },
  items: [],
  subtotal: 50,
  shippingCost: 0,
  total: 50,
  taxMode: 'diff_25a',
  taxClause: '§ 25a UStG',
  paymentMethod: 'Überweisung',
  paymentStatus: 'paid',
};

function erstelleKomponente() {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const invoiceService = {
    sendConfirmationEmail: vi.fn(
      async (): Promise<{
        success: boolean;
        message: string;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        success: true,
        message: 'Bestätigung wurde versendet.',
        error: null,
        reportedBySyncStatus: false,
      }),
    ),
  };
  const komponente = Object.create(InvoiceModalComponent.prototype) as InvoiceModalComponent;
  Object.assign(komponente, {
    invoiceService,
    toast,
    syncStatus,
    invoice: signal(rechnung),
    isSendingEmail: signal(false),
    emailSentMessage: signal<string | null>(null),
  });
  return { komponente, invoiceService, syncStatus, toast };
}

describe('InvoiceModalComponent – Aktionsmeldungen', () => {
  it('bestätigt den erfolgreichen Versand einer E-Mail', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.sendEmail();

    expect(komponente.isSendingEmail()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bestätigung wurde per E-Mail versendet.',
    });
  });

  it('behält den Versandzustand bei einem lokalen Fehler zurück und meldet ihn persistent', async () => {
    const { komponente, invoiceService, toast } = erstelleKomponente();
    invoiceService.sendConfirmationEmail.mockResolvedValue({
      success: false,
      message: '',
      error: new Error('Postfach nicht erreichbar'),
      reportedBySyncStatus: false,
    });

    await komponente.sendEmail();

    expect(komponente.isSendingEmail()).toBe(false);
    expect(komponente.emailSentMessage()).toBeNull();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bestätigung konnte nicht per E-Mail versendet werden.',
      persistent: true,
    });
  });

  it('erzeugt für einen zentral gemeldeten E-Mail-Fehler keinen zweiten Toast', async () => {
    const { komponente, invoiceService, syncStatus, toast } = erstelleKomponente();
    const fehler = syncStatus.melde('Speichern der E-Mail-Bestätigung', new Error('offline'));
    invoiceService.sendConfirmationEmail.mockResolvedValue({
      success: false,
      message: '',
      error: fehler,
      reportedBySyncStatus: true,
    });

    await komponente.sendEmail();

    expect(toast.toasts()).toEqual([]);
  });
});
