import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemCondition, ItemStatus } from '../../../../core/models/flipbase.models';
import { SyncFehlerAktion, SyncStatusService } from '../../../../core/services/sync-status.service';
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
  const inventoryService = {
    createItem: vi.fn(async (_payload?: unknown, _aktion?: unknown) => ergebnis),
    updateItem: vi.fn(async () => ({ error: ergebnis.error })),
  };
  const mediaService = {
    uploadItemMedia: vi.fn(async () => ({ data: null, error: null })),
  };
  const komponente = Object.create(ItemCreateModalComponent.prototype) as ItemCreateModalComponent;
  Object.assign(komponente, {
    inventoryService,
    item: signal<InventoryItem | null>(vorhandenerArtikel),
    form: new FormGroup({
      purchase_id: new FormControl<string | null>(null),
      title: new FormControl('Neuer Artikel', { nonNullable: true }),
      category_id: new FormControl<string | null>(null),
      brand_id: new FormControl<string | null>(null),
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
    categorySuggestion: signal<string | null>(null),
    brandSuggestion: signal<string | null>(null),
    selectedImageFile: signal<File | null>(null),
    mediaService,
    logger: { warn: vi.fn() },
    created,
    closed,
    toast,
    syncStatus,
  });

  return { komponente, inventoryService, mediaService, toast, syncStatus, created, closed };
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

  it('schließt nach partiellem Mehrfachanlegen mit genauen Anzahlen und ohne Bild-Upload', async () => {
    const { komponente, inventoryService, mediaService, toast, created, closed } =
      erstelleKomponente({ data: artikel, error: null });
    const zweiterArtikel = { ...artikel, id: '55555555-5555-4555-8555-555555555555' };
    inventoryService.createItem
      .mockResolvedValueOnce({ data: artikel, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Zweiter Artikel fehlgeschlagen') })
      .mockResolvedValueOnce({ data: zweiterArtikel, error: null });
    komponente.form.controls.anzahl.setValue(3);
    komponente.selectedImageFile.set(new File(['bild'], 'artikel.jpg', { type: 'image/jpeg' }));

    await komponente.onSubmit();

    expect(created.emit).toHaveBeenCalledOnce();
    expect(closed.emit).toHaveBeenCalledOnce();
    expect(mediaService.uploadItemMedia).not.toHaveBeenCalled();
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: '2 von 3 Artikeln wurden angelegt.',
      description: '1 Artikel konnte nicht angelegt werden. Das Bild wurde nicht hochgeladen.',
    });
  });

  it('erzeugt bei einem zentral gemeldeten Teilfehler keinen zweiten Warn-Toast', async () => {
    const { komponente, inventoryService, syncStatus, toast, closed } = erstelleKomponente({
      data: artikel,
      error: null,
    });
    inventoryService.createItem
      .mockResolvedValueOnce({ data: artikel, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: syncStatus.melde('Speichern des Artikels', new Error('offline')),
      });
    komponente.form.controls.anzahl.setValue(2);

    await komponente.onSubmit();

    expect(closed.emit).toHaveBeenCalledOnce();
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('fasst gleiche zentral gemeldete Fehler eines Mehrfachanlegens zusammen', async () => {
    const { komponente, inventoryService, syncStatus, toast } = erstelleKomponente({
      data: null,
      error: null,
    });
    const meldeMitAktion = syncStatus.melde.bind(syncStatus) as (
      vorgang: string,
      ursache: unknown,
      aktion?: unknown,
    ) => Error;
    inventoryService.createItem.mockImplementation(async (_payload: unknown, aktion?: unknown) => ({
      data: null,
      error: meldeMitAktion('Speichern des Artikels', new Error('offline'), aktion),
    }));
    komponente.form.controls.anzahl.setValue(3);

    await komponente.onSubmit();

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('zählt in einem gemischten Mehrfachanlegen nur lokale Fehler in der Warnung', async () => {
    const { komponente, inventoryService, syncStatus, toast } = erstelleKomponente({
      data: artikel,
      error: null,
    });
    const meldeMitAktion = syncStatus.melde.bind(syncStatus) as (
      vorgang: string,
      ursache: unknown,
      aktion?: unknown,
    ) => Error;
    inventoryService.createItem
      .mockResolvedValueOnce({ data: artikel, error: null })
      .mockImplementationOnce(async (_payload: unknown, aktion?: unknown) => ({
        data: null,
        error: meldeMitAktion('Speichern des Artikels', new Error('offline'), aktion),
      }))
      .mockImplementationOnce(async (_payload: unknown, aktion?: unknown) => ({
        data: null,
        error: meldeMitAktion('Speichern des Artikels', new Error('offline'), aktion),
      }))
      .mockResolvedValueOnce({ data: null, error: new Error('Titel ist ungültig') });
    komponente.form.controls.anzahl.setValue(4);

    await komponente.onSubmit();

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: '1 von 4 Artikeln wurde angelegt.',
      description: '1 Artikel konnte nicht angelegt werden.',
      persistent: false,
    });
  });

  it('fängt einen geworfenen Create-Fehler ab und setzt den Dialog-Lifecycle zurück', async () => {
    const { komponente, inventoryService, syncStatus, toast, closed } = erstelleKomponente({
      data: null,
      error: null,
    });
    let aktion: SyncFehlerAktion | undefined;
    inventoryService.createItem.mockImplementation(
      async (_payload: unknown, batchAktion?: unknown) => {
        aktion = batchAktion as SyncFehlerAktion | undefined;
        syncStatus.melde('Speichern des Artikels', new Error('offline'), aktion);
        throw new Error('Create abgebrochen');
      },
    );

    await expect(komponente.onSubmit()).resolves.toBeUndefined();

    expect(komponente.isSubmitting()).toBe(false);
    expect(komponente.errorMessage()).toBe('Create abgebrochen');
    expect(closed.emit).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht gespeichert werden.',
      description: 'Create abgebrochen',
      persistent: true,
    });

    const syncId = syncStatus.fehler()[0].id;
    syncStatus.verwerfen(syncId);
    syncStatus.melde('Speichern des Artikels', new Error('offline'), aktion);

    expect(syncStatus.fehler()).toHaveLength(1);
  });
});

describe('Paketinhalt bearbeiten', () => {
  it.each([null, 0])(
    'speichert Kosten %s unverändert und behält die Herkunft bei',
    async (cost) => {
      const content = {
        ...artikel,
        allocated_purchase_cost: cost,
        purchase_id: 'purchase',
        source_package_line_id: 'package',
      };
      const { komponente, inventoryService } = erstelleKomponente(
        { data: content, error: null },
        content,
      );
      komponente.form.patchValue({
        allocated_purchase_cost: cost,
        purchase_id: 'other',
        title: 'Bearbeiteter Schuh',
      });
      await komponente.onSubmit();
      expect(inventoryService.updateItem).toHaveBeenCalledWith(
        content.id,
        expect.objectContaining({
          title: 'Bearbeiteter Schuh',
          allocated_purchase_cost: cost,
          purchase_id: 'purchase',
        }),
      );
      expect(inventoryService.createItem).not.toHaveBeenCalled();
    },
  );
});

describe('ItemCreateModalComponent – Kategorie und Marke', () => {
  it('speichert beim Anlegen die gewählten Verweise', async () => {
    const { komponente, inventoryService } = erstelleKomponente({ data: artikel, error: null });
    komponente.form.patchValue({ category_id: 'el-6-6', brand_id: 'brand-1' });

    await komponente.onSubmit();

    expect(inventoryService.createItem.mock.calls[0][0]).toMatchObject({
      categoryId: 'el-6-6',
      brandId: 'brand-1',
    });
  });

  it('leert beim Bearbeiten entfernte Verweise ausdrücklich', async () => {
    const { komponente, inventoryService } = erstelleKomponente(
      { data: artikel, error: null },
      {
        ...artikel,
        category_id: 'el-6-6',
        brand_id: 'brand-1',
      },
    );

    await komponente.onSubmit();

    expect(inventoryService.updateItem).toHaveBeenCalledWith(
      artikel.id,
      expect.objectContaining({ categoryId: null, brandId: null }),
    );
  });

  it('gibt erkannte Texte nur als Vorschlag weiter', async () => {
    const { komponente } = erstelleKomponente({ data: artikel, error: null });
    Object.assign(komponente, {
      isAiLoading: signal(false),
      aiService: {
        identifyProduct: vi.fn(async () => ({
          cleanTitle: 'Nintendo Switch',
          brand: 'Nintendo',
          model: null,
          category: 'Gaming & Konsolen',
          condition: 'used',
        })),
      },
    });

    await komponente.onAiAutofill();

    expect(komponente.categorySuggestion()).toBe('Gaming & Konsolen');
    expect(komponente.brandSuggestion()).toBe('Nintendo');
    expect(komponente.form.getRawValue()).toMatchObject({ category_id: null, brand_id: null });
  });
});
