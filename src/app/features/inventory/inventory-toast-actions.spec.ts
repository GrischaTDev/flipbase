import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemStatus } from '../../core/models/flipbase.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { InventoryComponent } from './inventory.component';

const artikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  purchase_id: null,
  title: 'Testartikel',
  condition: 'used',
  status: 'received',
  is_public_store: false,
  allocated_purchase_cost: 10,
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente(ergebnis: { readonly error: Error | null }) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const inventoryService = {
    items: signal<InventoryItem[]>([{ ...artikel }]),
    updateItemStatus: vi.fn(async (_id: string, _status: ItemStatus) => ergebnis),
    updateItem: vi.fn(async () => ergebnis),
  };
  const komponente = Object.create(InventoryComponent.prototype) as InventoryComponent;
  Object.assign(komponente, { inventoryService, toast, syncStatus });

  return { komponente, inventoryService, syncStatus, toast };
}

function klickEvent(): Event {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as Event;
}

describe('InventoryComponent – Aktionsmeldungen', () => {
  it('bestätigt einen erfolgreichen Statuswechsel', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onChangeItemStatus({ ...artikel }, 'ready');

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikelstatus wurde geändert.',
    });
  });

  it('bestätigt eine erfolgreiche Shop-Freigabe', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onTogglePublicStore({ ...artikel }, klickEvent());

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde im Shop veröffentlicht.',
    });
  });

  it('meldet das Entfernen aus dem Shop', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.onTogglePublicStore({ ...artikel, is_public_store: true }, klickEvent());

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde aus dem Shop entfernt.',
    });
  });

  it('behält die Shop-Freigabe bei einem lokalen Fehler bei und meldet ihn persistent', async () => {
    const fehler = new Error('Freigabe nicht möglich');
    const { komponente, toast } = erstelleKomponente({ error: fehler });
    const unveroeffentlicht = { ...artikel };

    await komponente.onTogglePublicStore(unveroeffentlicht, klickEvent());

    expect(unveroeffentlicht.is_public_store).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Shop-Freigabe konnte nicht geändert werden.',
      description: fehler.message,
      persistent: true,
    });
  });

  it('erzeugt bei einem bereits zentral gemeldeten Statusfehler keinen zweiten Toast', async () => {
    const { komponente, inventoryService, syncStatus, toast } = erstelleKomponente({
      error: null,
    });
    inventoryService.updateItemStatus.mockImplementation(async () => ({
      error: syncStatus.melde('Aktualisieren des Artikelstatus', new Error('offline')),
    }));

    await komponente.onChangeItemStatus({ ...artikel }, 'ready');

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });
});
