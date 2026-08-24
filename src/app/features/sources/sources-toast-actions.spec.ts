import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { Source, Supplier } from '../../core/models/flipbase.models';
import { SourcesService } from '../../core/services/sources.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { SourcesComponent } from './sources.component';

function erstelleKomponente() {
  const toast = new ToastService();
  const sourcesService = {
    createSource: vi.fn(
      async (): Promise<{ data: { id: string } | null; error: Error | null }> => ({
        data: { id: 'source-1' },
        error: null,
      }),
    ),
    updateSource: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    setSourceArchiviert: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    deleteSource: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  };
  const suppliersService = {
    createSupplier: vi.fn(
      async (): Promise<{ data: { id: string } | null; error: Error | null }> => ({
        data: { id: 'supplier-1' },
        error: null,
      }),
    ),
    updateSupplier: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    setSupplierArchiviert: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
    deleteSupplier: vi.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  };
  const komponente = Object.create(SourcesComponent.prototype) as SourcesComponent;

  Object.assign(komponente, {
    dialog: { frage: vi.fn(async () => true) },
    toast,
    syncStatus: { fehler: signal([]) },
    sourcesService,
    suppliersService,
    isAddingSource: signal(true),
    isAddingSupplier: signal(true),
    bearbeiteQuelle: signal<string | null>('source-1'),
    bearbeiteLieferant: signal<string | null>('supplier-1'),
    meldung: signal<string | null>(null),
    sourceForm: new FormGroup({
      name: new FormControl('Flohmarkt', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
    }),
    supplierForm: new FormGroup({
      name: new FormControl('Lieferant GmbH', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      contact_info: new FormControl('mail@example.com'),
      notes: new FormControl('Notiz'),
    }),
    editForm: new FormGroup({
      name: new FormControl('Bearbeiteter Name', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      contact_info: new FormControl('neu@example.com'),
      notes: new FormControl('Neue Notiz'),
    }),
  });

  return { komponente, toast, sourcesService, suppliersService };
}

function erwarteErfolg(toast: ToastService, title: string): void {
  expect(toast.toasts()).toHaveLength(1);
  expect(toast.toasts()[0]).toMatchObject({ type: 'success', title });
}

function erstelleRealeLoeschkette(art: 'quelle' | 'lieferant') {
  const syncStatus = new SyncStatusService();
  const client = {
    from(tabelle: string) {
      if (tabelle !== 'purchases') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      return {
        select: () => ({
          eq: async () => ({ count: null, error: { code: '42501', message: 'denied' } }),
        }),
      };
    },
  };

  if (art === 'quelle') {
    const eintrag: Source = {
      id: 'source-1',
      workspace_id: 'workspace-1',
      name: 'Flohmarkt',
      is_default: false,
      is_active: true,
    };
    const dienst = Object.create(SourcesService.prototype) as SourcesService;
    Object.assign(dienst, {
      supabase: { client },
      syncStatus,
      sources: signal([eintrag]),
      mockStore: { isDemoMode: signal(false), getPurchases: () => [] },
    });
    return { syncStatus, dienst };
  }

  const eintrag: Supplier = {
    id: 'supplier-1',
    workspace_id: 'workspace-1',
    name: 'Händler',
    is_active: true,
  };
  const dienst = Object.create(SuppliersService.prototype) as SuppliersService;
  Object.assign(dienst, {
    supabase: { client },
    syncStatus,
    suppliers: signal([eintrag]),
    mockStore: { isDemoMode: signal(false), getPurchases: () => [] },
  });
  return { syncStatus, dienst };
}

describe('SourcesComponent – zentrale Aktionsmeldungen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bestätigt Anlegen und Speichern einer Quelle erst nach Erfolg', async () => {
    const angelegt = erstelleKomponente();
    await angelegt.komponente.onAddSource();
    expect(angelegt.komponente.isAddingSource()).toBe(false);
    expect(angelegt.komponente.sourceForm.controls.name.value).toBe('');
    erwarteErfolg(angelegt.toast, 'Quelle wurde angelegt.');

    const gespeichert = erstelleKomponente();
    await gespeichert.komponente.speichereQuelle('source-1');
    expect(gespeichert.komponente.bearbeiteQuelle()).toBeNull();
    erwarteErfolg(gespeichert.toast, 'Quelle wurde gespeichert.');
  });

  it.each([
    [true, 'Quelle wurde archiviert.'],
    [false, 'Quelle wurde wiederhergestellt.'],
  ])('bestätigt die Quellen-Archivaktion %s mit „%s“', async (archivieren, title) => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.archiviereQuelle('source-1', archivieren);

    erwarteErfolg(toast, title);
  });

  it('bestätigt das Löschen einer Quelle nach Freigabe und Service-Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onDeleteSource('source-1');

    erwarteErfolg(toast, 'Quelle wurde gelöscht.');
  });

  it('behält das Quellenformular bei einem fachlichen Erstellungsfehler und meldet ihn persistent', async () => {
    const { komponente, toast, sourcesService } = erstelleKomponente();
    sourcesService.createSource.mockResolvedValue({
      data: null,
      error: new Error('Kein aktiver Workspace ausgewählt'),
    });

    await komponente.onAddSource();

    expect(komponente.isAddingSource()).toBe(true);
    expect(komponente.sourceForm.controls.name.value).toBe('Flohmarkt');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Quelle konnte nicht angelegt werden.',
      description: 'Kein aktiver Workspace ausgewählt',
      persistent: true,
    });
  });

  it('behält das Quellenformular auch bei einer geworfenen Ausnahme geöffnet', async () => {
    const { komponente, toast, sourcesService } = erstelleKomponente();
    sourcesService.createSource.mockRejectedValue(new Error('Lokaler Dienst ausgefallen'));

    await komponente.onAddSource();

    expect(komponente.isAddingSource()).toBe(true);
    expect(komponente.sourceForm.controls.name.value).toBe('Flohmarkt');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Quelle konnte nicht angelegt werden.',
      description: 'Lokaler Dienst ausgefallen',
      persistent: true,
    });
  });

  it.each(['quelle', 'lieferant'] as const)(
    'erzeugt beim realen Count-Vorprüffehler für %s keinen zweiten Toast',
    async (art) => {
      const { komponente, toast } = erstelleKomponente();
      const kette = erstelleRealeLoeschkette(art);
      Object.assign(komponente, {
        syncStatus: kette.syncStatus,
        ...(art === 'quelle'
          ? { sourcesService: kette.dienst }
          : { suppliersService: kette.dienst }),
      });

      if (art === 'quelle') await komponente.onDeleteSource('source-1');
      else await komponente.onDeleteSupplier('supplier-1');

      expect(kette.syncStatus.fehler()).toHaveLength(1);
      expect(toast.toasts()).toEqual([]);
    },
  );

  it('bestätigt Anlegen und Speichern eines Lieferanten erst nach Erfolg', async () => {
    const angelegt = erstelleKomponente();
    await angelegt.komponente.onAddSupplier();
    expect(angelegt.komponente.isAddingSupplier()).toBe(false);
    expect(angelegt.komponente.supplierForm.controls.name.value).toBe('');
    erwarteErfolg(angelegt.toast, 'Lieferant wurde angelegt.');

    const gespeichert = erstelleKomponente();
    await gespeichert.komponente.speichereLieferant('supplier-1');
    expect(gespeichert.komponente.bearbeiteLieferant()).toBeNull();
    erwarteErfolg(gespeichert.toast, 'Lieferant wurde gespeichert.');
  });

  it.each([
    [true, 'Lieferant wurde archiviert.'],
    [false, 'Lieferant wurde wiederhergestellt.'],
  ])('bestätigt die Lieferanten-Archivaktion %s mit „%s“', async (archivieren, title) => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.archiviereLieferant('supplier-1', archivieren);

    erwarteErfolg(toast, title);
  });

  it('bestätigt das Löschen eines Lieferanten nach Freigabe und Service-Erfolg', async () => {
    const { komponente, toast } = erstelleKomponente();

    await komponente.onDeleteSupplier('supplier-1');

    erwarteErfolg(toast, 'Lieferant wurde gelöscht.');
  });

  it('behält das Lieferantenformular bei einem fehlgeschlagenen Anlegen geöffnet', async () => {
    const { komponente, toast, suppliersService } = erstelleKomponente();
    suppliersService.createSupplier.mockResolvedValue({
      data: null,
      error: new Error('Kein aktiver Workspace ausgewählt'),
    });

    await komponente.onAddSupplier();

    expect(komponente.isAddingSupplier()).toBe(true);
    expect(komponente.supplierForm.controls.name.value).toBe('Lieferant GmbH');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Lieferant konnte nicht angelegt werden.',
      persistent: true,
    });
  });
});
