import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Sale } from '../../core/models/flipbase.models';
import { ReturnRecord } from '../../core/models/return.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SalesComponent } from './sales.component';

const artikel: InventoryItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  title: 'Testartikel',
  condition: 'used',
  status: 'sold',
  allocated_purchase_cost: 20,
};

const verkauf: Sale = {
  id: 'sale-1',
  workspace_id: 'workspace-1',
  inventory_item_id: artikel.id,
  platform: 'kleinanzeigen',
  sale_price: 50,
  sale_date: '2026-08-24',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 30,
  roi: 150,
  inventory_item: artikel,
};

const retoure: ReturnRecord = {
  id: 'return-1',
  workspace_id: 'workspace-1',
  sale_id: verkauf.id,
  inventory_item_id: artikel.id,
  credit_note_number: 'GS-2026-0001',
  return_date: '2026-08-24',
  reason: 'buyer_remorse',
  refund_amount: 50,
  is_full_refund: true,
  restock_action: 'restock_ready',
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente() {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const salesService = {
    sales: signal([verkauf]),
    deleteSale: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    recordReturn: vi.fn<
      () => Promise<{ data: Sale | null; error: Error | null; reportedBySyncStatus: boolean }>
    >(async () => ({
      data: { ...verkauf, returned_at: '2026-08-24T12:00:00.000Z', refund_amount: 50 },
      error: null,
      reportedBySyncStatus: false,
    })),
  };
  const returnService = {
    returns: signal<ReturnRecord[]>([]),
    materializeConfirmedReturn: vi.fn(() => retoure),
  };
  const komponente = Object.create(SalesComponent.prototype) as SalesComponent;
  const invoiceService = {
    generateInvoiceForSale: vi.fn(async () => ({
      data: { id: 'invoice-1' },
      error: null,
      created: true,
      reportedBySyncStatus: false,
    })),
  };
  Object.assign(komponente, {
    dialog: { frage: vi.fn(async () => true) },
    salesService,
    returnService,
    toast,
    syncStatus,
    invoiceService,
    selectedSaleForReturn: signal(verkauf),
    isReturnModalOpen: signal(true),
    isProcessingReturn: signal(false),
    isCreatingInvoice: signal(false),
    activeInvoice: signal(null),
    returnForm: new FormGroup({
      reason: new FormControl('buyer_remorse', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      refundAmount: new FormControl(50, { nonNullable: true, validators: [Validators.required] }),
      isFullRefund: new FormControl(true, { nonNullable: true }),
      restockAction: new FormControl('restock_ready', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      notes: new FormControl(''),
    }),
  });
  return { komponente, invoiceService, returnService, salesService, syncStatus, toast };
}

describe('SalesComponent – Aktionsmeldungen', () => {
  it('startet bei einem Doppelklick nur eine Rechnungserstellung', async () => {
    const { komponente, invoiceService } = erstelleKomponente();
    let resolve!: (value: {
      data: { id: string };
      error: null;
      created: boolean;
      reportedBySyncStatus: boolean;
    }) => void;
    invoiceService.generateInvoiceForSale.mockImplementation(
      () =>
        new Promise((resolver) => {
          resolve = resolver;
        }),
    );

    const first = komponente.openInvoiceForSale(verkauf);
    const second = komponente.openInvoiceForSale(verkauf);

    expect(invoiceService.generateInvoiceForSale).toHaveBeenCalledOnce();
    resolve({
      data: { id: 'invoice-1' },
      error: null,
      created: true,
      reportedBySyncStatus: false,
    });
    await Promise.all([first, second]);
  });

  it('öffnet eine Rechnung erst nach bestätigter Erstellung und bestätigt nur die Neuerstellung', async () => {
    const { komponente, invoiceService, toast } = erstelleKomponente();

    await komponente.openInvoiceForSale(verkauf);

    expect(komponente.activeInvoice()).toMatchObject({ id: 'invoice-1' });
    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Rechnung wurde erstellt.' });

    invoiceService.generateInvoiceForSale.mockResolvedValue({
      data: { id: 'invoice-1' },
      error: null,
      created: false,
      reportedBySyncStatus: false,
    } as never);
    toast.toasts().forEach((meldung) => toast.dismiss(meldung.id));
    await komponente.openInvoiceForSale(verkauf);
    expect(toast.toasts()).toEqual([]);
  });

  it('öffnet bei fehlgeschlagener Rechnungserstellung keinen Dialog und dedupliziert Sync-Fehler', async () => {
    const { komponente, invoiceService, syncStatus, toast } = erstelleKomponente();
    const fehler = syncStatus.melde('Erstellen der Rechnung', new Error('offline'));
    invoiceService.generateInvoiceForSale.mockResolvedValue({
      data: null,
      error: fehler,
      created: false,
      reportedBySyncStatus: true,
    } as never);

    await komponente.openInvoiceForSale(verkauf);

    expect(komponente.activeInvoice()).toBeNull();
    expect(toast.toasts()).toEqual([]);
  });
  it('bestätigt eine erfolgreich erfasste Retoure und schließt den Dialog erst dann', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onSubmitReturn();

    expect(komponente.isReturnModalOpen()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Retoure wurde erfasst.' });
  });

  it('behält den Retourendialog bei einem lokalen Fehler geöffnet und meldet ihn persistent', async () => {
    const { komponente, salesService, toast } = erstelleKomponente();
    salesService.recordReturn.mockResolvedValue({
      data: null,
      error: new Error('Retoure konnte nicht gespeichert werden'),
      reportedBySyncStatus: false,
    });

    await komponente.onSubmitReturn();

    expect(komponente.isReturnModalOpen()).toBe(true);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Retoure konnte nicht erfasst werden.',
      persistent: true,
    });
  });

  it('bestätigt das Löschen eines Verkaufs erst nach Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onDeleteSale(verkauf);

    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Verkauf wurde gelöscht.' });
  });

  it('navigiert nach fehlgeschlagenem Löschen nicht weiter und meldet keinen Erfolg', async () => {
    const { komponente, salesService, toast } = erstelleKomponente();
    salesService.deleteSale.mockResolvedValue({ error: new Error('Löschen fehlgeschlagen') });

    await komponente.onDeleteSale(verkauf);

    expect(toast.toasts().some((meldung) => meldung.type === 'success')).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ type: 'error', persistent: true });
  });

  it('bucht bei zwei sofort parallelen Retourenaufrufen nur einmal', async () => {
    const { komponente, returnService, salesService } = erstelleKomponente();
    let resolveReturn!: (value: {
      data: Sale | null;
      error: Error | null;
      reportedBySyncStatus: boolean;
    }) => void;
    salesService.recordReturn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReturn = resolve;
        }),
    );

    const first = komponente.onSubmitReturn();
    const second = komponente.onSubmitReturn();
    resolveReturn({
      data: { ...verkauf, returned_at: '2026-08-24T12:00:00.000Z', refund_amount: 50 },
      error: null,
      reportedBySyncStatus: false,
    });
    await Promise.all([first, second]);

    expect(salesService.recordReturn).toHaveBeenCalledOnce();
    expect(returnService.materializeConfirmedReturn).toHaveBeenCalledOnce();
    expect(komponente.isReturnModalOpen()).toBe(false);
  });
});
