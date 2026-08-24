import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemCondition, ItemStatus } from '../../../../core/models/flipbase.models';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ItemCreateModalComponent } from './item-create-modal.component';

const artikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  purchase_id: null,
  title: 'Neuer Artikel',
  condition: 'used',
  status: 'received',
  allocated_purchase_cost: 10,
  created_at: '2026-08-24T10:00:00.000Z',
};

function erstelleKomponente(
  ergebnis: { data: InventoryItem | null; error: Error | null },
  vorhandenerArtikel: InventoryItem | null = null,
) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const created = { emit: vi.fn() };
  const closed = { emit: vi.fn() };
  const komponente = Object.create(ItemCreateModalComponent.prototype) as ItemCreateModalComponent;
  Object.assign(komponente, {
    inventoryService: {
      createItem: vi.fn(async () => ergebnis),
      updateItem: vi.fn(async () => ({ error: ergebnis.error })),
    },
    item: signal<InventoryItem | null>(vorhandenerArtikel),
    form: new FormGroup({
      purchase_id: new FormControl<string | null>(null),
      title: new FormControl('Neuer Artikel', { nonNullable: true }),
      category: new FormControl(''),
      brand: new FormControl(''),
      model: new FormControl(''),
      condition: new FormControl<ItemCondition>('used', { nonNullable: true }),
      status: new FormControl<ItemStatus>('received', { nonNullable: true }),
      sku: new FormControl(''),
      ean: new FormControl(''),
      description: new FormControl(''),
      condition_notes: new FormControl(''),
      allocated_purchase_cost: new FormControl(10, { nonNullable: true }),
      expected_value: new FormControl<number | null>(20),
      anzahl: new FormControl(1, { nonNullable: true }),
    }),
    isSubmitting: signal(false),
    errorMessage: signal<string | null>(null),
    selectedImageFile: signal<File | null>(null),
    mediaService: {
      uploadItemMedia: vi.fn(async () => ({ data: null, error: null })),
    },
    logger: { warn: vi.fn() },
    created,
    closed,
    toast,
    syncStatus,
  });

  return { komponente, toast, syncStatus, created, closed };
}

describe('ItemCreateModalComponent – Toast-Rückmeldung', () => {
  it('meldet einen fehlgeschlagenen Speichervorgang rot und hält den Dialog offen', async () => {
    const { komponente, toast, closed } = erstelleKomponente({
      data: null,
      error: new Error('Speichern fehlgeschlagen'),
    });

    await komponente.onSubmit();

    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht gespeichert werden.',
      description: 'Speichern fehlgeschlagen',
      persistent: true,
    });
  });

  it('bestätigt das erfolgreiche Anlegen grün', async () => {
    const { komponente, toast, created } = erstelleKomponente({ data: artikel, error: null });

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde angelegt.',
    });
  });

  it('bestätigt eine erfolgreiche Artikeländerung und schließt danach', async () => {
    const { komponente, toast, closed } = erstelleKomponente(
      { data: artikel, error: null },
      artikel,
    );

    await komponente.onSubmit();

    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde aktualisiert.',
    });
  });

  it('hält den Dialog bei einer fehlgeschlagenen Artikeländerung offen', async () => {
    const fehler = new Error('Änderung fehlgeschlagen');
    const { komponente, toast, closed } = erstelleKomponente(
      { data: null, error: fehler },
      artikel,
    );

    await komponente.onSubmit();

    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht aktualisiert werden.',
      description: fehler.message,
      persistent: true,
    });
  });

  it('meldet einen Bildfehler nach erfolgreichem Anlegen als Warnung', async () => {
    const { komponente, toast, closed } = erstelleKomponente({ data: artikel, error: null });
    komponente.selectedImageFile.set(new File(['bild'], 'artikel.jpg', { type: 'image/jpeg' }));
    Object.assign(komponente, {
      mediaService: {
        uploadItemMedia: vi.fn(async () => ({
          data: null,
          error: new Error('Upload fehlgeschlagen'),
        })),
      },
    });

    await komponente.onSubmit();

    expect(closed.emit).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: 'Artikel wurde angelegt.',
      description: 'Das Bild konnte nicht hochgeladen werden.',
    });
  });

  it('erzeugt bei einem bereits zentral gemeldeten Speicherfehler keinen zweiten Toast', async () => {
    const { komponente, toast, syncStatus } = erstelleKomponente({ data: null, error: null });
    const zentralerFehler = syncStatus.melde('Erstellen des Artikels', new Error('offline'));
    Object.assign(komponente, {
      inventoryService: {
        createItem: vi.fn(async () => ({ data: null, error: zentralerFehler })),
      },
    });

    await komponente.onSubmit();

    expect(toast.toasts()).toEqual([]);
  });

  it('erzeugt bei einem zentral gemeldeten Bildfehler keine zusätzliche Warnung', async () => {
    const { komponente, toast, syncStatus } = erstelleKomponente({ data: artikel, error: null });
    komponente.selectedImageFile.set(new File(['bild'], 'artikel.jpg', { type: 'image/jpeg' }));
    Object.assign(komponente, {
      mediaService: {
        uploadItemMedia: vi.fn(async () => ({
          data: null,
          error: syncStatus.melde('Hochladen des Bildes', new Error('offline')),
        })),
      },
    });

    await komponente.onSubmit();

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });
});
