import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
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

  it('erzeugt für einen bereits zentral gemeldeten Quellenfehler keinen zweiten Toast', async () => {
    const { komponente, toast, sourcesService } = erstelleKomponente();
    const error = new Error(
      'Archivieren der Quelle fehlgeschlagen: Keine Berechtigung für diesen Workspace.',
    );
    Object.assign(komponente, {
      syncStatus: {
        fehler: signal([
          {
            id: 1,
            vorgang: 'Archivieren der Quelle',
            meldung: 'Keine Berechtigung für diesen Workspace.',
            zeitpunkt: '2026-08-24T10:00:00.000Z',
          },
        ]),
      },
    });
    sourcesService.setSourceArchiviert.mockResolvedValue({ error });

    await komponente.archiviereQuelle('source-1', true);

    expect(toast.toasts()).toEqual([]);
  });

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
