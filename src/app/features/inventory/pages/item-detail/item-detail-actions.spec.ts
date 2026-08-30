import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { readFileSync } from 'node:fs';
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
  const routeId = signal(artikel.id);
  const inventoryService = {
    selectedItem: signal<InventoryItem | null>({ ...artikel }),
    updateItemStatus: vi.fn(async () => ({ error })),
    addItemCost: vi.fn(async () => ({ error })),
    deleteItemCost: vi.fn(async () => ({ error })),
    updateItem: vi.fn(async () => ({ error })),
    deleteItem: vi.fn(async () => ({ error })),
    resolveLegacySoldItem: vi.fn(async () => ({ error })),
  };
  const dialog = { frage: vi.fn(async () => true) };
  const mediaService = {
    loadItemMedia: vi.fn(async (_itemId: string): Promise<ItemMedia[]> => []),
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
  const currentItem = computed<InventoryItem | null>(() => {
    const selectedItem = inventoryService.selectedItem();
    return selectedItem?.id === routeId() ? selectedItem : null;
  });
  const komponente = Object.create(ItemDetailComponent.prototype) as ItemDetailComponent;
  Object.assign(komponente, {
    id: routeId,
    currentItem,
    inventoryService,
    mediaService,
    mediaList: signal<ItemMedia[]>([]),
    isUploading: signal(false),
    uploadError: signal<string | null>(null),
    isAddingCost: signal(true),
    isEditModalOpen: signal(false),
    isLabelModalOpen: signal(false),
    previewModalUrl: signal<string | null>(null),
    costForm: new FormGroup({
      type: new FormControl<'repair'>('repair', { nonNullable: true }),
      amount: new FormControl(4, { nonNullable: true }),
      description: new FormControl('Reparatur', { nonNullable: true }),
    }),
    dialog,
    router: { navigate },
    syncStatus,
    toast,
  });
  return {
    komponente,
    inventoryService,
    mediaService,
    dialog,
    syncStatus,
    toast,
    navigate,
    routeId,
  };
}

function verzoegerteAntwort<T>() {
  let resolve!: (wert: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function dateiEvent(dateien: File[]): Event {
  return {
    target: { files: dateien, value: 'auswahl' },
  } as unknown as Event;
}

describe('ItemDetailComponent – Aktionsmeldungen', () => {
  it('verwirft verspätet geladene Medien einer vorherigen Artikelroute', async () => {
    const { komponente, inventoryService, mediaService, routeId } = erstelleKomponente();
    const zweiterArtikel = {
      ...artikel,
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Zweiter Artikel',
    };
    const zweitesMedium = {
      ...medium,
      id: '55555555-5555-4555-8555-555555555555',
      inventory_item_id: zweiterArtikel.id,
    };
    const ersteAntwort = verzoegerteAntwort<ItemMedia[]>();
    const zweiteAntwort = verzoegerteAntwort<ItemMedia[]>();
    mediaService.loadItemMedia.mockImplementation((itemId: string) =>
      itemId === artikel.id ? ersteAntwort.promise : zweiteAntwort.promise,
    );

    const erstesLaden = komponente.loadMedia(artikel.id);
    routeId.set(zweiterArtikel.id);
    inventoryService.selectedItem.set(zweiterArtikel);
    const zweitesLaden = komponente.loadMedia(zweiterArtikel.id);

    zweiteAntwort.resolve([zweitesMedium]);
    await zweitesLaden;
    ersteAntwort.resolve([medium]);
    await erstesLaden;

    expect(komponente.mediaList()).toEqual([zweitesMedium]);
  });

  it('übernimmt keine Medien, die nicht zum geladenen Artikel gehören', async () => {
    const { komponente, mediaService } = erstelleKomponente();
    const fremdesMedium = {
      ...medium,
      inventory_item_id: '44444444-4444-4444-8444-444444444444',
    };
    mediaService.loadItemMedia.mockResolvedValue([medium, fremdesMedium]);

    await komponente.loadMedia(artikel.id);

    expect(komponente.mediaList()).toEqual([medium]);
  });

  it('schließt artikelbezogene Dialoge und verwirft Formulare beim Route-Wechsel', () => {
    const { komponente } = erstelleKomponente();
    const routeState = komponente as unknown as { resetRouteLocalState(): void };
    komponente.isEditModalOpen.set(true);
    komponente.isLabelModalOpen.set(true);
    komponente.isAddingCost.set(true);
    komponente.previewModalUrl.set('data:image/jpeg;base64,bild');
    komponente.uploadError.set('Alter Fehler');
    komponente.mediaList.set([medium]);
    komponente.costForm.setValue({
      type: 'repair',
      amount: 99,
      description: 'Eingabe für den alten Artikel',
    });

    routeState.resetRouteLocalState();

    expect(komponente.isEditModalOpen()).toBe(false);
    expect(komponente.isLabelModalOpen()).toBe(false);
    expect(komponente.isAddingCost()).toBe(false);
    expect(komponente.previewModalUrl()).toBeNull();
    expect(komponente.uploadError()).toBeNull();
    expect(komponente.mediaList()).toEqual([]);
    expect(komponente.costForm.getRawValue()).toEqual({
      type: 'repair',
      amount: 0,
      description: '',
    });
  });

  it('zeigt verkaufte und ungeklärte Zustände schreibgeschützt statt als Statusauswahl', () => {
    const template = readFileSync(
      'src/app/features/inventory/pages/item-detail/item-detail.component.html',
      'utf8',
    );

    expect(template).toContain('data-item-status-badge');
    expect(template).toContain("item.sale_state === 'legacy_sold_unverified'");
    expect(template).toContain("item.sale_state === 'legacy_sale_header_without_line'");
    expect(template).toContain('Korrektur erforderlich');
    expect(template).toContain('Verkaufsstatus klären');
    expect(template).toContain('Artikel ist noch vorhanden');
    expect(template).toContain('Verkauf nachtragen');
    expect(template).not.toContain('Altdaten prüfen');
    expect(template).not.toContain('Prüfgrund');
    expect(template).not.toMatch(/<input[^>]+legacy-reason/);
  });

  it('nimmt einen ungeklärten Artikel nur nach Bestätigung wieder in den Bestand auf', async () => {
    const { komponente, inventoryService, dialog, toast } = erstelleKomponente();
    inventoryService.selectedItem.set({
      ...artikel,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
    dialog.frage.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await komponente.onRestoreLegacySoldItem();

    expect(inventoryService.resolveLegacySoldItem).not.toHaveBeenCalled();

    await komponente.onRestoreLegacySoldItem();

    expect(dialog.frage).toHaveBeenCalledTimes(2);
    expect(dialog.frage).toHaveBeenCalledWith(
      expect.objectContaining({
        titel: 'Artikel wieder in Bestand nehmen?',
        bestaetigenText: 'Artikel ist noch vorhanden',
      }),
    );
    expect(inventoryService.resolveLegacySoldItem).toHaveBeenCalledWith(artikel.id);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Artikel wurde wieder in den Bestand aufgenommen.',
    });
  });

  it('trägt einen ungeklärten Verkauf mit explizitem Legacy-Route-State nach', () => {
    const { komponente, inventoryService, navigate } = erstelleKomponente();
    inventoryService.selectedItem.set({
      ...artikel,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
    const legacyActions = komponente as unknown as { openLegacySaleReconciliation(): void };

    legacyActions.openLegacySaleReconciliation();

    expect(navigate).toHaveBeenCalledWith(['/sales'], {
      state: {
        legacyReconciliation: {
          kind: 'legacy_sold_unverified',
          inventoryItemId: artikel.id,
        },
        saleTarget: {
          kind: 'inventory_item',
          inventoryItemId: artikel.id,
          title: artikel.title,
        },
      },
    });
  });

  it('führt für einen veralteten Artikel weder Bestandsrücknahme noch Verkaufsnachtrag aus', async () => {
    const { komponente, inventoryService, dialog, navigate, routeId } = erstelleKomponente();
    const staleItem = {
      ...artikel,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Alter Artikel',
      status: 'sold' as const,
      sale_state: 'legacy_sold_unverified' as const,
    };
    routeId.set('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    inventoryService.selectedItem.set(staleItem);

    await komponente.onRestoreLegacySoldItem();
    komponente.openLegacySaleReconciliation();

    expect(dialog.frage).not.toHaveBeenCalled();
    expect(inventoryService.resolveLegacySoldItem).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('prüft nach einer Bestätigung erneut Route, Artikel-ID und Verkaufsstatus', async () => {
    const { komponente, inventoryService, dialog, routeId } = erstelleKomponente();
    inventoryService.selectedItem.set({
      ...artikel,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
    let bestaetigen: (wert: boolean) => void = () => undefined;
    dialog.frage.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          bestaetigen = resolve;
        }),
    );

    const ruecknahme = komponente.onRestoreLegacySoldItem();

    expect(dialog.frage).toHaveBeenCalledOnce();
    routeId.set('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    inventoryService.selectedItem.set({
      ...artikel,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Neuer Artikel',
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
    bestaetigen(true);
    await ruecknahme;

    expect(inventoryService.resolveLegacySoldItem).not.toHaveBeenCalled();
  });

  it.each([
    ['sold', 'sold'],
    ['legacy sold', 'legacy_sold_unverified'],
    ['header without line', 'legacy_sale_header_without_line'],
    ['status conflict', 'sale_status_conflict'],
    ['multiple sales', 'multiple_active_sales'],
  ] as const)('blockiert direkte Mutationshandler für %s', async (_label, saleState) => {
    const { komponente, inventoryService, dialog, navigate, toast } = erstelleKomponente();
    inventoryService.selectedItem.set({
      ...artikel,
      status: 'sold',
      sale_state: saleState,
    });

    await komponente.onChangeStatus('ready');
    await komponente.onTogglePublicStore(true);
    await komponente.onDeleteItem();

    expect(inventoryService.updateItemStatus).not.toHaveBeenCalled();
    expect(inventoryService.updateItem).not.toHaveBeenCalled();
    expect(inventoryService.deleteItem).not.toHaveBeenCalled();
    expect(dialog.frage).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });
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

  it('bearbeitet kein Medium eines anderen Artikels', async () => {
    const { komponente, mediaService, toast } = erstelleKomponente();
    const fremdesMedium = {
      ...medium,
      inventory_item_id: '44444444-4444-4444-8444-444444444444',
    };
    komponente.mediaList.set([fremdesMedium]);

    await komponente.onSetPrimary(fremdesMedium);
    await komponente.onDeleteMedia(fremdesMedium);

    expect(mediaService.setPrimary).not.toHaveBeenCalled();
    expect(mediaService.deleteMedia).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('ändert nach einem Route-Wechsel keinen Medienzustand der neuen Seite', async () => {
    const { komponente, inventoryService, mediaService, routeId, toast } = erstelleKomponente();
    const antwort = verzoegerteAntwort<{ error: Error | null }>();
    mediaService.setPrimary.mockReturnValue(antwort.promise);
    komponente.mediaList.set([{ ...medium, is_primary: false }]);

    const aenderung = komponente.onSetPrimary(medium);
    const zweiterArtikel = {
      ...artikel,
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Zweiter Artikel',
    };
    routeId.set(zweiterArtikel.id);
    inventoryService.selectedItem.set(zweiterArtikel);
    komponente.mediaList.set([]);
    antwort.resolve({ error: null });
    await aenderung;

    expect(komponente.mediaList()).toEqual([]);
    expect(toast.toasts()).toEqual([]);
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

  it('fängt einen geworfenen Upload-Fehler ab und setzt den Upload-Lifecycle zurück', async () => {
    const { komponente, mediaService, syncStatus, toast } = erstelleKomponente();
    let aktion: SyncFehlerAktion | undefined;
    mediaService.uploadItemMedia.mockImplementation(
      async (_itemId: string, _file: File, _isPrimary: boolean, batchAktion?: unknown) => {
        aktion = batchAktion as SyncFehlerAktion | undefined;
        syncStatus.melde('Hochladen des Bildes', new Error('offline'), aktion);
        throw new Error('Upload abgebrochen');
      },
    );

    const event = dateiEvent([new File(['bild'], 'bild.jpg', { type: 'image/jpeg' })]);
    await expect(komponente.onFilesSelected(event)).resolves.toBeUndefined();

    expect(komponente.isUploading()).toBe(false);
    expect(komponente.uploadError()).toBe('Upload abgebrochen');
    expect((event.target as HTMLInputElement).value).toBe('');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Bild konnte nicht hochgeladen werden.',
      description: 'Upload abgebrochen',
      persistent: true,
    });

    const syncId = syncStatus.fehler()[0].id;
    syncStatus.verwerfen(syncId);
    syncStatus.melde('Hochladen des Bildes', new Error('offline'), aktion);

    expect(syncStatus.fehler()).toHaveLength(1);
  });
});
