import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemMedia } from '../../../../core/models/flipbase.models';
import { SyncFehlerAktion, SyncStatusService } from '../../../../core/services/sync-status.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ItemDetailComponent } from './item-detail.component';

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

const medium: ItemMedia = {
  id: '33333333-3333-4333-8333-333333333333',
  inventory_item_id: artikel.id,
  storage_path: 'artikel/bild.jpg',
  is_primary: false,
  file_name: 'bild.jpg',
  file_size: 4,
  mime_type: 'image/jpeg',
  created_at: '2026-08-24T10:01:00.000Z',
};

function erstelleKomponente(error: Error | null = null) {
  const toast = new ToastService();
  const syncStatus = new SyncStatusService();
  const navigate = vi.fn(async () => true);
  const inventoryService = {
    selectedItem: signal<InventoryItem | null>({ ...artikel }),
    updateItemStatus: vi.fn(async () => ({ error })),
    addItemCost: vi.fn(async () => ({ error })),
    deleteItemCost: vi.fn(async () => ({ error })),
    updateItem: vi.fn(async () => ({ error })),
    deleteItem: vi.fn(async () => ({ error })),
  };
  const mediaService = {
    uploadItemMedia: vi.fn(
      async (
        _itemId: string,
        _file: File,
        _isPrimary: boolean,
      ): Promise<{ data: ItemMedia | null; error: Error | null }> => ({ data: medium, error }),
    ),
    setPrimary: vi.fn(async () => ({ error })),
    deleteMedia: vi.fn(async () => ({ error })),
  };
  const komponente = Object.create(ItemDetailComponent.prototype) as ItemDetailComponent;
  Object.assign(komponente, {
    id: signal(artikel.id),
    inventoryService,
    mediaService,
    mediaList: signal<ItemMedia[]>([]),
    isUploading: signal(false),
    uploadError: signal<string | null>(null),
    isAddingCost: signal(true),
    costForm: new FormGroup({
      type: new FormControl<'repair'>('repair', { nonNullable: true }),
      amount: new FormControl(4, { nonNullable: true }),
      description: new FormControl('Reparatur', { nonNullable: true }),
    }),
    dialog: { frage: vi.fn(async () => true) },
    router: { navigate },
    syncStatus,
    toast,
  });
  return { komponente, inventoryService, mediaService, syncStatus, toast, navigate };
}

function dateiEvent(dateien: File[]): Event {
  return {
    target: { files: dateien, value: 'auswahl' },
  } as unknown as Event;
}

describe('ItemDetailComponent – Aktionsmeldungen', () => {
  it('meldet einen erfolgreichen Medien-Upload', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onFilesSelected(
      dateiEvent([new File(['bild'], 'bild.jpg', { type: 'image/jpeg' })]),
    );

    expect(komponente.mediaList()).toEqual([medium]);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Bild wurde hochgeladen.',
    });
  });

  it('meldet mehrere erfolgreiche Medien-Uploads gemeinsam', async () => {
    const { komponente, mediaService, toast } = erstelleKomponente();
    const zweitesMedium = { ...medium, id: '44444444-4444-4444-8444-444444444444' };
    mediaService.uploadItemMedia
      .mockResolvedValueOnce({ data: medium, error: null })
      .mockResolvedValueOnce({ data: zweitesMedium, error: null });

    await komponente.onFilesSelected(
      dateiEvent([
        new File(['eins'], 'eins.jpg', { type: 'image/jpeg' }),
        new File(['zwei'], 'zwei.jpg', { type: 'image/jpeg' }),
      ]),
    );

    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0].title).toBe('Bilder wurden hochgeladen.');
  });

  it('meldet einen Teil-Upload mit Anzahlen und macht den ersten Erfolg zum Hauptbild', async () => {
    const { komponente, mediaService, toast } = erstelleKomponente();
    let aufruf = 0;
    mediaService.uploadItemMedia.mockImplementation(
      async (_itemId: string, _file: File, isPrimary: boolean) => {
        aufruf++;
        if (aufruf === 1) return { data: null, error: new Error('Erstes Bild fehlgeschlagen') };
        return { data: { ...medium, is_primary: isPrimary }, error: null };
      },
    );

    await komponente.onFilesSelected(
      dateiEvent([
        new File(['eins'], 'eins.jpg', { type: 'image/jpeg' }),
        new File(['zwei'], 'zwei.jpg', { type: 'image/jpeg' }),
      ]),
    );

    expect(komponente.mediaList()).toEqual([{ ...medium, is_primary: true }]);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: '1 von 2 Bildern wurde hochgeladen.',
      description: '1 Bild konnte nicht hochgeladen werden.',
    });
  });

  it('erzeugt bei einem zentral gemeldeten Upload-Teilfehler keinen zweiten Warn-Toast', async () => {
    const { komponente, mediaService, syncStatus, toast } = erstelleKomponente();
    mediaService.uploadItemMedia
      .mockResolvedValueOnce({ data: medium, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: syncStatus.melde('Hochladen des Bildes', new Error('offline')),
      });

    await komponente.onFilesSelected(
      dateiEvent([
        new File(['eins'], 'eins.jpg', { type: 'image/jpeg' }),
        new File(['zwei'], 'zwei.jpg', { type: 'image/jpeg' }),
      ]),
    );

    expect(komponente.mediaList()).toEqual([medium]);
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('übernimmt ein fehlgeschlagenes Bild nicht und meldet einen lokalen Fehler persistent', async () => {
    const fehler = new Error('Datei konnte nicht gelesen werden.');
    const { komponente, toast } = erstelleKomponente(fehler);

    await komponente.onFilesSelected(
      dateiEvent([new File(['bild'], 'bild.jpg', { type: 'image/jpeg' })]),
    );

    expect(komponente.mediaList()).toEqual([]);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bild konnte nicht hochgeladen werden.',
      description: fehler.message,
      persistent: true,
    });
  });

  it('ändert das Hauptbild erst nach erfolgreichem Speichern', async () => {
    const { komponente, toast } = erstelleKomponente();
    komponente.mediaList.set([{ ...medium, is_primary: false }]);

    await komponente.onSetPrimary(medium);

    expect(komponente.mediaList()[0].is_primary).toBe(true);
    expect(toast.toasts()[0].title).toBe('Hauptbild wurde geändert.');
  });

  it('behält das bisherige Hauptbild bei einem Fehler bei', async () => {
    const { komponente, toast } = erstelleKomponente(new Error('Speichern fehlgeschlagen'));
    komponente.mediaList.set([{ ...medium, is_primary: false }]);

    await komponente.onSetPrimary(medium);

    expect(komponente.mediaList()[0].is_primary).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Hauptbild konnte nicht geändert werden.',
      persistent: true,
    });
  });

  it('entfernt ein Bild erst nach erfolgreichem Löschen', async () => {
    const { komponente, toast } = erstelleKomponente();
    komponente.mediaList.set([medium]);

    await komponente.onDeleteMedia(medium);

    expect(komponente.mediaList()).toEqual([]);
    expect(toast.toasts()[0].title).toBe('Bild wurde gelöscht.');
  });

  it('behält ein Bild bei einem Löschfehler bei', async () => {
    const { komponente, toast } = erstelleKomponente(new Error('Löschen fehlgeschlagen'));
    komponente.mediaList.set([medium]);

    await komponente.onDeleteMedia(medium);

    expect(komponente.mediaList()).toEqual([medium]);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bild konnte nicht gelöscht werden.',
      persistent: true,
    });
  });

  it('bestätigt eine Shop-Freigabe', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onTogglePublicStore(true);

    expect(toast.toasts()[0].title).toBe('Artikel wurde im Shop veröffentlicht.');
  });

  it('behält den Shop-Zustand bei einem Fehler bei', async () => {
    const { komponente, inventoryService, toast } = erstelleKomponente(
      new Error('Freigabe fehlgeschlagen'),
    );

    await komponente.onTogglePublicStore(true);

    expect(inventoryService.selectedItem()?.is_public_store).toBe(false);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Shop-Freigabe konnte nicht geändert werden.',
      persistent: true,
    });
  });

  it('bleibt bei einem Datenbankfehler auf der Artikelseite', async () => {
    const { komponente, toast, navigate } = erstelleKomponente(new Error('Löschen fehlgeschlagen'));

    await komponente.onDeleteItem();

    expect(navigate).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Artikel konnte nicht gelöscht werden.',
      description: 'Löschen fehlgeschlagen',
    });
  });

  it('navigiert erst nach erfolgreichem Löschen und bestätigt die Aktion', async () => {
    const { komponente, toast, navigate } = erstelleKomponente();

    await komponente.onDeleteItem();

    expect(navigate).toHaveBeenCalledWith(['/inventory']);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde gelöscht.',
    });
  });

  it('erzeugt bei einem bereits zentral gemeldeten Medienfehler keinen zweiten Toast', async () => {
    const { komponente, mediaService, syncStatus, toast } = erstelleKomponente();
    mediaService.deleteMedia.mockImplementation(async () => ({
      error: syncStatus.melde('Löschen des Bildes', new Error('offline')),
    }));
    komponente.mediaList.set([medium]);

    await komponente.onDeleteMedia(medium);

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('fasst gleiche zentral gemeldete Fehler eines Mehrfachuploads zusammen', async () => {
    const { komponente, mediaService, syncStatus, toast } = erstelleKomponente();
    const meldeMitAktion = syncStatus.melde.bind(syncStatus) as (
      vorgang: string,
      ursache: unknown,
      aktion?: unknown,
    ) => Error;
    mediaService.uploadItemMedia.mockImplementation(
      async (_itemId: string, _file: File, _isPrimary: boolean, aktion?: unknown) => ({
        data: null,
        error: meldeMitAktion('Hochladen des Bildes', new Error('offline'), aktion),
      }),
    );

    await komponente.onFilesSelected(
      dateiEvent([
        new File(['eins'], 'eins.jpg', { type: 'image/jpeg' }),
        new File(['zwei'], 'zwei.jpg', { type: 'image/jpeg' }),
        new File(['drei'], 'drei.jpg', { type: 'image/jpeg' }),
      ]),
    );

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('zählt in einem gemischten Mehrfachupload nur lokale Fehler in der Warnung', async () => {
    const { komponente, mediaService, syncStatus, toast } = erstelleKomponente();
    const meldeMitAktion = syncStatus.melde.bind(syncStatus) as (
      vorgang: string,
      ursache: unknown,
      aktion?: unknown,
    ) => Error;
    mediaService.uploadItemMedia
      .mockResolvedValueOnce({ data: medium, error: null })
      .mockImplementationOnce(
        async (_itemId: string, _file: File, _isPrimary: boolean, aktion?: unknown) => ({
          data: null,
          error: meldeMitAktion('Hochladen des Bildes', new Error('offline'), aktion),
        }),
      )
      .mockImplementationOnce(
        async (_itemId: string, _file: File, _isPrimary: boolean, aktion?: unknown) => ({
          data: null,
          error: meldeMitAktion('Hochladen des Bildes', new Error('offline'), aktion),
        }),
      )
      .mockResolvedValueOnce({ data: null, error: new Error('Datei ist beschädigt') });

    await komponente.onFilesSelected(
      dateiEvent([
        new File(['eins'], 'eins.jpg', { type: 'image/jpeg' }),
        new File(['zwei'], 'zwei.jpg', { type: 'image/jpeg' }),
        new File(['drei'], 'drei.jpg', { type: 'image/jpeg' }),
        new File(['vier'], 'vier.jpg', { type: 'image/jpeg' }),
      ]),
    );

    expect(syncStatus.fehler()).toHaveLength(1);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'warning',
      title: '1 von 4 Bildern wurde hochgeladen.',
      description: '1 Bild konnte nicht hochgeladen werden.',
      persistent: false,
    });
  });

  it('beendet die zentrale Fehleraktion auch bei einem geworfenen Upload-Fehler', async () => {
    const { komponente, mediaService, syncStatus } = erstelleKomponente();
    let aktion: SyncFehlerAktion | undefined;
    mediaService.uploadItemMedia.mockImplementation(
      async (_itemId: string, _file: File, _isPrimary: boolean, batchAktion?: unknown) => {
        aktion = batchAktion as SyncFehlerAktion | undefined;
        syncStatus.melde('Hochladen des Bildes', new Error('offline'), aktion);
        throw new Error('Upload abgebrochen');
      },
    );

    await expect(
      komponente.onFilesSelected(
        dateiEvent([new File(['bild'], 'bild.jpg', { type: 'image/jpeg' })]),
      ),
    ).rejects.toThrow('Upload abgebrochen');

    const syncId = syncStatus.fehler()[0].id;
    syncStatus.verwerfen(syncId);
    syncStatus.melde('Hochladen des Bildes', new Error('offline'), aktion);

    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
