import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Invoice } from '../../../core/models/invoice.models';
import { InvoiceService } from '../../../core/services/invoice.service';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { ToastService } from '../toast/toast.service';
import { InvoiceModalComponent } from './invoice-modal.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  const dateien: Record<string, string> = {
    './invoice-modal.component.html':
      'src/app/shared/components/invoice-modal/invoice-modal.component.html',
    './invoice-modal.component.scss':
      'src/app/shared/components/invoice-modal/invoice-modal.component.scss',
  };
  await ɵresolveComponentResources(async (url) => {
    const datei = dateien[url];
    if (!datei) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(datei), { encoding: 'utf8' });
  });
});

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
    prepareConfirmationEmail: vi.fn(
      async (): Promise<{
        success: boolean;
        message: string;
        error: Error | null;
        reportedBySyncStatus: boolean;
      }> => ({
        success: true,
        message: 'Bestätigung wurde für den Versand vorbereitet.',
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
  });
  return { komponente, invoiceService, syncStatus, toast };
}

describe('InvoiceModalComponent – Aktionsmeldungen', () => {
  it('meldet eine nur gespeicherte E-Mail-Bestätigung wahrheitsgemäß als vorbereitet', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.sendEmail();

    expect(komponente.isSendingEmail()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'info',
      title: 'Bestätigung wurde für den E-Mail-Versand vorbereitet.',
    });
  });

  it('behält den Versandzustand bei einem lokalen Fehler zurück und meldet ihn persistent', async () => {
    const { komponente, invoiceService, toast } = erstelleKomponente();
    invoiceService.prepareConfirmationEmail.mockResolvedValue({
      success: false,
      message: '',
      error: new Error('Postfach nicht erreichbar'),
      reportedBySyncStatus: false,
    });

    await komponente.sendEmail();

    expect(komponente.isSendingEmail()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bestätigung konnte nicht vorbereitet werden.',
      persistent: true,
    });
  });

  it('erzeugt für einen zentral gemeldeten E-Mail-Fehler keinen zweiten Toast', async () => {
    const { komponente, invoiceService, syncStatus, toast } = erstelleKomponente();
    const fehler = syncStatus.melde('Speichern der E-Mail-Bestätigung', new Error('offline'));
    invoiceService.prepareConfirmationEmail.mockResolvedValue({
      success: false,
      message: '',
      error: fehler,
      reportedBySyncStatus: true,
    });

    await komponente.sendEmail();

    expect(toast.toasts()).toEqual([]);
  });

  it('zeigt den Versanderfolg ausschließlich als Toast und nicht zusätzlich im Dialog', async () => {
    const invoiceService = {
      prepareConfirmationEmail: vi.fn(async () => ({
        success: true,
        message: 'Bestätigung wurde für den Versand vorbereitet.',
        error: null,
        reportedBySyncStatus: false,
      })),
    };
    await TestBed.configureTestingModule({
      imports: [InvoiceModalComponent],
      providers: [
        { provide: InvoiceService, useValue: invoiceService },
        ToastService,
        SyncStatusService,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InvoiceModalComponent);
    Object.assign(fixture.componentInstance, { invoice: signal(rechnung) });
    fixture.detectChanges();

    await fixture.componentInstance.sendEmail();
    fixture.detectChanges();

    expect(TestBed.inject(ToastService).toasts()[0]?.type).toBe('info');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Bestätigung wurde versendet.',
    );
  });
});
