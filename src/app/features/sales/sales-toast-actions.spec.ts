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
  };
  const returnService = {
    returns: signal<ReturnRecord[]>([]),
    processReturn: vi.fn(
      async (): Promise<{
        status: 'success' | 'partial' | 'error';
        data: ReturnRecord | null;
        error: Error | null;
        reportedBySyncStatus: boolean;
        problems?: readonly {
          kind: 'inventory_status' | 'sale_return_status';
          error: Error;
          reportedBySyncStatus: boolean;
        }[];
      }> => ({
        status: 'success',
        data: retoure,
        error: null,
        reportedBySyncStatus: false,
      }),
    ),
  };
  const komponente = Object.create(SalesComponent.prototype) as SalesComponent;
  Object.assign(komponente, {
    dialog: { frage: vi.fn(async () => true) },
    salesService,
    returnService,
    toast,
    syncStatus,
    selectedSaleForReturn: signal(verkauf),
    isReturnModalOpen: signal(true),
    isProcessingReturn: signal(false),
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
  return { komponente, returnService, salesService, syncStatus, toast };
}

describe('SalesComponent – Aktionsmeldungen', () => {
  it('bestätigt eine erfolgreich erfasste Retoure und schließt den Dialog erst dann', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onSubmitReturn();

    expect(komponente.isReturnModalOpen()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({ type: 'success', title: 'Retoure wurde erfasst.' });
  });

  it('behält den Retourendialog bei einem lokalen Fehler geöffnet und meldet ihn persistent', async () => {
    const { komponente, returnService, toast } = erstelleKomponente();
    returnService.processReturn.mockResolvedValue({
      status: 'error',
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

  it('schließt eine persistierte Teilretoure und verhindert eine zweite Gutschrift', async () => {
    const { komponente, returnService, toast } = erstelleKomponente();
    returnService.processReturn.mockResolvedValue({
      status: 'partial',
      data: retoure,
      error: new Error('Retourenvermerk fehlt'),
      reportedBySyncStatus: false,
      problems: [
        {
          kind: 'sale_return_status',
          error: new Error('Retourenvermerk fehlt'),
          reportedBySyncStatus: false,
        },
      ],
    });

    await komponente.onSubmitReturn();
    await komponente.onSubmitReturn();

    expect(returnService.processReturn).toHaveBeenCalledOnce();
    expect(komponente.isReturnModalOpen()).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Retoure wurde mit Einschränkungen erfasst.',
      description: 'Der Retourenvermerk wird automatisch nachgeholt.',
      persistent: false,
    });
  });
});
