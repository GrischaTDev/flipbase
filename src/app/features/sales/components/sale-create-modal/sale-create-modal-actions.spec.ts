import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Sale } from '../../../../core/models/flipbase.models';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SaleCreateModalComponent } from './sale-create-modal.component';

const artikel: InventoryItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  title: 'Testartikel',
  condition: 'used',
  status: 'ready',
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
};

function erstelleKomponente(bestehenderVerkauf: Sale | null = null) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const created = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  const salesService = {
    createSale: vi.fn(
      async (): Promise<{
        data: Sale | null;
        error: Error | null;
        status?: 'success' | 'partial' | 'error';
        problems?: readonly {
          kind: 'inventory_status' | 'sale_return_status';
          error: Error;
          reportedBySyncStatus: boolean;
        }[];
      }> => ({ data: verkauf, error: null }),
    ),
    updateSale: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  };
  const komponente = Object.create(SaleCreateModalComponent.prototype) as SaleCreateModalComponent;
  Object.assign(komponente, {
    salesService,
    inventoryService: { items: signal([artikel]) },
    profitEngine: {
      calculateProfit: vi.fn(() => 30),
      calculateRoi: vi.fn(() => 150),
      calculateHoldingDurationDays: vi.fn(() => 0),
    },
    toast,
    syncStatus,
    sale: signal(bestehenderVerkauf),
    isSubmitting: signal(false),
    isPersisted: signal(false),
    errorMessage: signal<string | null>(null),
    created,
    closed,
    form: new FormGroup({
      inventory_item_id: new FormControl(artikel.id, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      platform: new FormControl('kleinanzeigen', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      sale_price: new FormControl(50, { nonNullable: true, validators: [Validators.required] }),
      sale_date: new FormControl('2026-08-24', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      platform_fee: new FormControl(0, { nonNullable: true }),
      shipping_cost: new FormControl(0, { nonNullable: true }),
      packaging_cost: new FormControl(0, { nonNullable: true }),
      other_costs: new FormControl(0, { nonNullable: true }),
      external_order_id: new FormControl(''),
      buyer_notes: new FormControl(''),
    }),
  });

  return { komponente, created, closed, salesService, syncStatus, toast };
}

describe('SaleCreateModalComponent – Aktionsmeldungen', () => {
  it('bestätigt einen abgeschlossenen Verkauf erst nach Service-Erfolg', async () => {
    const { komponente, created, closed, toast } = erstelleKomponente();

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Verkauf wurde abgeschlossen.',
    });
  });

  it('behält den Dialog bei einem lokalen Speicherfehler offen und meldet ihn persistent', async () => {
    const { komponente, closed, salesService, toast } = erstelleKomponente();
    salesService.createSale.mockResolvedValue({
      data: null,
      error: new Error('Speichern fehlgeschlagen'),
    });

    await komponente.onSubmit();

    expect(komponente.errorMessage()).toBe('Speichern fehlgeschlagen');
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Verkauf konnte nicht abgeschlossen werden.',
      description: 'Speichern fehlgeschlagen',
      persistent: true,
    });
  });

  it('erzeugt für einen zentral gemeldeten Speicherfehler keinen zweiten Toast', async () => {
    const { komponente, salesService, syncStatus, toast } = erstelleKomponente();
    const fehler = syncStatus.melde('Speichern des Verkaufs', new Error('offline'));
    salesService.createSale.mockResolvedValue({ data: null, error: fehler });

    await komponente.onSubmit();

    expect(toast.toasts()).toEqual([]);
  });

  it('bestätigt das Bearbeiten eines Verkaufs mit einem eigenen Erfolgstitel', async () => {
    const { komponente, toast } = erstelleKomponente(verkauf);

    await komponente.onSubmit();

    expect(toast.toasts()[0].title).toBe('Verkauf wurde gespeichert.');
  });

  it('schließt nach einem persistierten Teilabschluss und verhindert ein zweites Anlegen', async () => {
    const { komponente, closed, created, salesService, toast } = erstelleKomponente();
    salesService.createSale.mockResolvedValue({
      data: verkauf,
      error: new Error('Artikelstatus konnte nicht aktualisiert werden'),
      status: 'partial',
      problems: [
        {
          kind: 'inventory_status',
          error: new Error('Artikelstatus konnte nicht aktualisiert werden'),
          reportedBySyncStatus: false,
        },
      ],
    });

    await komponente.onSubmit();
    await komponente.onSubmit();

    expect(salesService.createSale).toHaveBeenCalledOnce();
    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Verkauf wurde mit Einschränkungen abgeschlossen.',
      description: 'Der Artikelstatus wird automatisch nachgeholt.',
      persistent: false,
    });
  });
});
