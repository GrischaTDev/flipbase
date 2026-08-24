import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem } from '../../core/models/flipbase.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ListingsComponent } from './listings.component';

const artikel: InventoryItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  purchase_id: null,
  title: 'Testartikel',
  condition: 'used',
  status: 'ready',
  is_public_store: false,
  allocated_purchase_cost: 10,
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente(ergebnis: { readonly error: Error | null }) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const listingStudio = {
    markItemAsListed: vi.fn(async () => ergebnis),
    publishToCustomStore: vi.fn(async () => ergebnis),
  };
  const komponente = Object.create(ListingsComponent.prototype) as ListingsComponent;
  Object.assign(komponente, {
    listingStudio,
    syncStatus,
    toast,
    selectedItem: signal(artikel),
    selectedPlatform: signal('kleinanzeigen'),
    customPrice: signal(25),
    isMarkingListed: signal(false),
  });

  return { komponente, listingStudio, syncStatus, toast };
}

describe('ListingsComponent – Aktionsmeldungen', () => {
  it('bestätigt das Markieren als gelistet erst nach Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.markAsListed();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde als gelistet markiert.',
    });
  });

  it('ersetzt das lokale Veröffentlichungsbanner durch einen Toast', async () => {
    const { komponente, toast } = erstelleKomponente({ error: null });

    await komponente.publishToStore();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde im Shop veröffentlicht.',
    });
    expect('publishSuccessMsg' in komponente).toBe(false);
  });

  it('meldet einen lokalen Veröffentlichungsfehler persistent', async () => {
    const fehler = new Error('Speichern fehlgeschlagen');
    const { komponente, toast } = erstelleKomponente({ error: fehler });

    await komponente.publishToStore();

    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht im Shop veröffentlicht werden.',
      description: fehler.message,
      persistent: true,
    });
  });

  it('dupliziert keinen zentral gemeldeten Fehler', async () => {
    const { komponente, listingStudio, syncStatus, toast } = erstelleKomponente({ error: null });
    listingStudio.markItemAsListed.mockResolvedValue({
      error: syncStatus.melde('Aktualisieren des Artikels', new Error('offline')),
    });

    await komponente.markAsListed();

    expect(toast.toasts()).toEqual([]);
  });
});
