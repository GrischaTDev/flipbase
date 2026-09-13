import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  InventoryItem,
  InventoryItemSaleState,
  ItemStatus,
} from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { ListingStudioService } from '../../core/services/listing-studio.service';
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
  it('stellt dieselbe vollständige Verkaufbarkeitsmatrix wie der Verkaufsdialog bereit', () => {
    const statuses: readonly ItemStatus[] = [
      'received',
      'needs_review',
      'researched',
      'ready',
      'listed',
      'reserved',
      'sold',
      'defective',
      'returned',
      'archived',
    ];
    const states: readonly (InventoryItemSaleState | undefined)[] = [
      'no_active_sale',
      'sold',
      'legacy_sold_unverified',
      'legacy_sale_header_without_line',
      'sale_status_conflict',
      'multiple_active_sales',
      undefined,
    ];
    const items = statuses.flatMap((status) =>
      states.map((saleState) => ({
        ...artikel,
        id: `${status}-${saleState ?? 'missing'}`,
        status,
        sale_state: saleState,
      })),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: InventoryService, useValue: { items: signal(items) } },
        { provide: ListingStudioService, useValue: {} },
        { provide: SyncStatusService, useValue: new SyncStatusService() },
        { provide: ToastService, useValue: new ToastService() },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new ListingsComponent());

    try {
      expect(component.availableItems().map(({ id }) => id)).toEqual([
        'ready-no_active_sale',
        'listed-no_active_sale',
      ]);
    } finally {
      TestBed.resetTestingModule();
    }
  });

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

describe('Paketinhalt ohne Preisvorgabe', () => {
  it('verlangt einen Verkaufspreis vor dem Listen oder Veröffentlichen', async () => {
    const { komponente, listingStudio, toast } = erstelleKomponente({ error: null });
    Object.assign(komponente, {
      selectedItem: signal({ ...artikel, allocated_purchase_cost: null, expected_value: null }),
      customPrice: signal<number | null>(null),
    });
    await komponente.markAsListed();
    await komponente.publishToStore();
    expect(listingStudio.markItemAsListed).not.toHaveBeenCalled();
    expect(listingStudio.publishToCustomStore).not.toHaveBeenCalled();
    expect(toast.toasts()[0].title).toBe('Verkaufspreis fehlt.');
  });
  it('erlaubt einen ausdrücklich gewählten Verkaufspreis von null Euro', async () => {
    const { komponente, listingStudio } = erstelleKomponente({ error: null });
    Object.assign(komponente, {
      selectedItem: signal({ ...artikel, allocated_purchase_cost: null }),
      customPrice: signal(0),
    });
    await komponente.markAsListed();
    expect(listingStudio.markItemAsListed).toHaveBeenCalledWith(artikel.id, 'kleinanzeigen', 0);
  });
});
