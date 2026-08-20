import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { SourcesService } from './sources.service';
import { SuppliersService } from './suppliers.service';
import { Source, Supplier } from '../models/reflip.models';
import { nurAktive, istArchiviert } from './stammdaten-filter';

/**
 * Quellen und Lieferanten werden archiviert statt geloescht.
 *
 * Hintergrund: `purchases.source_id` und `purchases.supplier_id` verweisen mit
 * ON DELETE SET NULL auf diese Tabellen. Beim Loeschen bleibt der Einkauf zwar
 * bestehen, verliert aber stillschweigend die Angabe seiner Herkunft - und das
 * unwiederbringlich, ausser ueber die Sicherung.
 *
 * Diese Tests sichern genau das ab: dass endgueltiges Loeschen verweigert wird,
 * solange Einkaeufe verweisen.
 *
 * Die Dienste werden wie anderswo im Projekt ueber Object.create erzeugt und
 * mit Attrappen bestueckt - so laesst sich die Entscheidungslogik pruefen,
 * ohne Datenbank und Injektionskontext.
 */

interface Attrappen {
  demoModus: boolean;
  gespeicherteQuellen: Source[];
  gespeicherteLieferanten: Supplier[];
}

function baueSourcesService(zustand: Attrappen, verknuepfteEinkaeufe: number): SourcesService {
  const dienst = Object.create(SourcesService.prototype) as SourcesService;

  Object.assign(dienst, {
    sources: signal<Source[]>(zustand.gespeicherteQuellen),
    isLoading: signal(false),
    zeigeArchivierte: signal(false),
    mockStore: {
      isDemoMode: () => zustand.demoModus,
      saveSource: vi.fn(),
      deleteSource: vi.fn(),
      getPurchases: () => [],
    },
    syncStatus: { melde: (_v: string, e: unknown) => e as Error },
    supabase: { client: {} },
    workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
  });

  // Die Zaehlung selbst braucht eine Datenbank - hier durch einen festen Wert
  // ersetzt, damit die Entscheidung darum herum pruefbar bleibt.
  dienst.zaehleVerknuepfteEinkaeufe = async () => verknuepfteEinkaeufe;

  return dienst;
}

function baueSuppliersService(zustand: Attrappen, verknuepfteEinkaeufe: number): SuppliersService {
  const dienst = Object.create(SuppliersService.prototype) as SuppliersService;

  Object.assign(dienst, {
    suppliers: signal<Supplier[]>(zustand.gespeicherteLieferanten),
    isLoading: signal(false),
    zeigeArchivierte: signal(false),
    mockStore: {
      isDemoMode: () => zustand.demoModus,
      saveSupplier: vi.fn(),
      deleteSupplier: vi.fn(),
      getPurchases: () => [],
    },
    syncStatus: { melde: (_v: string, e: unknown) => e as Error },
    supabase: { client: {} },
    workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
  });

  dienst.zaehleVerknuepfteEinkaeufe = async () => verknuepfteEinkaeufe;

  return dienst;
}

describe('Gemeinsamer Filter fuer Stammdaten', () => {
  it('behandelt Eintraege ohne das Feld als aktiv', () => {
    // Datensaetze aus der Zeit vor der Spalte duerfen nicht stillschweigend
    // aus allen Auswahllisten verschwinden.
    expect(nurAktive([{ name: 'ohne Feld' } as never])).toHaveLength(1);
    expect(istArchiviert({})).toBe(false);
  });

  it('erkennt nur ausdrueckliches false als archiviert', () => {
    expect(istArchiviert({ is_active: false })).toBe(true);
    expect(istArchiviert({ is_active: true })).toBe(false);
  });
});

describe('Stammdaten archivieren statt loeschen', () => {
  let zustand: Attrappen;

  beforeEach(() => {
    zustand = {
      demoModus: true,
      gespeicherteQuellen: [
        { id: 'q-1', workspace_id: 'ws-1', name: 'Flohmarkt', is_default: false, is_active: true },
        { id: 'q-2', workspace_id: 'ws-1', name: 'eBay', is_default: false, is_active: true },
      ],
      gespeicherteLieferanten: [
        { id: 'l-1', workspace_id: 'ws-1', name: 'Grosshaendler Nord', is_active: true },
      ],
    };
  });

  describe('Quellen', () => {
    it('verweigert das Loeschen, solange Einkaeufe daran haengen', async () => {
      const dienst = baueSourcesService(zustand, 2);

      const { error } = await dienst.deleteSource('q-1');

      expect(error).toBeTruthy();
      expect(error?.message).toContain('2 Einkäufe');
      expect(error?.message).toContain('Archiviere');
      // Und der Eintrag ist noch da.
      expect(dienst.sources().some((s) => s.id === 'q-1')).toBe(true);
    });

    it('nennt die Einzahl richtig, wenn genau ein Einkauf haengt', async () => {
      const dienst = baueSourcesService(zustand, 1);

      const { error } = await dienst.deleteSource('q-1');

      expect(error?.message).toContain('hängt 1 Einkauf');
    });

    it('loescht endgueltig, wenn kein Einkauf verweist', async () => {
      const dienst = baueSourcesService(zustand, 0);

      const { error } = await dienst.deleteSource('q-1');

      expect(error).toBeNull();
      expect(dienst.sources().some((s) => s.id === 'q-1')).toBe(false);
    });

    it('verweigert das Loeschen, wenn sich die Verknuepfungen nicht pruefen liessen', async () => {
      // Im Zweifel nicht loeschen - eine verlorene Herkunftsangabe waere
      // schlimmer als eine verweigerte Aktion.
      const dienst = baueSourcesService(zustand, -1);

      const { error } = await dienst.deleteSource('q-1');

      expect(error).toBeTruthy();
      expect(dienst.sources().some((s) => s.id === 'q-1')).toBe(true);
    });

    it('nimmt eine archivierte Quelle aus der Liste, ohne sie zu loeschen', async () => {
      const dienst = baueSourcesService(zustand, 5);

      const { error } = await dienst.setSourceArchiviert('q-1', true);

      expect(error).toBeNull();
      // Aus der Ansicht verschwunden, weil archivierte ausgeblendet sind ...
      expect(dienst.sources().some((s) => s.id === 'q-1')).toBe(false);
      // ... und das trotz fuenf verknuepfter Einkaeufe: Archivieren ist immer
      // erlaubt, gerade weil die Verweise erhalten bleiben.
    });

    it('behaelt archivierte Eintraege sichtbar, wenn sie eingeblendet sind', async () => {
      const dienst = baueSourcesService(zustand, 0);
      dienst.zeigeArchivierte.set(true);

      await dienst.setSourceArchiviert('q-1', true);

      const eintrag = dienst.sources().find((s) => s.id === 'q-1');
      expect(eintrag).toBeTruthy();
      expect(eintrag?.is_active).toBe(false);
    });

    it('sichert den archivierten Zustand im lokalen Speicher', async () => {
      // Ohne dieses Sichern galt das Archivieren im Demo-Modus nur bis zum
      // naechsten Laden - der Eintrag war danach wieder aktiv. Im Browser
      // aufgefallen, nicht durch den Compiler.
      const dienst = baueSourcesService(zustand, 0);
      const gespeichert = (
        dienst as unknown as { mockStore: { saveSource: ReturnType<typeof vi.fn> } }
      ).mockStore.saveSource;

      await dienst.setSourceArchiviert('q-1', true);

      expect(gespeichert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'q-1', is_active: false }),
      );
    });

    it('holt eine archivierte Quelle zurueck', async () => {
      const dienst = baueSourcesService(zustand, 0);
      dienst.zeigeArchivierte.set(true);

      await dienst.setSourceArchiviert('q-1', true);
      await dienst.setSourceArchiviert('q-1', false);

      expect(dienst.sources().find((s) => s.id === 'q-1')?.is_active).toBe(true);
    });

    it('aendert den Namen und laesst die Kennung unangetastet', async () => {
      const dienst = baueSourcesService(zustand, 3);

      const { error } = await dienst.updateSource('q-1', { name: '  Flohmarkt Bielefeld  ' });

      expect(error).toBeNull();
      const eintrag = dienst.sources().find((s) => s.id === 'q-1');
      expect(eintrag?.name).toBe('Flohmarkt Bielefeld');
      expect(eintrag?.id).toBe('q-1');
    });

    it('weist einen leeren Namen ab', async () => {
      const dienst = baueSourcesService(zustand, 0);

      const { error } = await dienst.updateSource('q-1', { name: '   ' });

      expect(error?.message).toContain('darf nicht leer sein');
      expect(dienst.sources().find((s) => s.id === 'q-1')?.name).toBe('Flohmarkt');
    });

    it('blendet archivierte Eintraege aus den Auswahllisten aus', () => {
      const quellen: Source[] = [
        { id: 'q-1', workspace_id: 'ws-1', name: 'Aktiv', is_default: false, is_active: true },
        {
          id: 'q-2',
          workspace_id: 'ws-1',
          name: 'Archiviert',
          is_default: false,
          is_active: false,
        },
      ];

      expect(nurAktive(quellen).map((s) => s.name)).toEqual(['Aktiv']);
    });
  });

  describe('Lieferanten', () => {
    it('verweigert das Loeschen, solange Einkaeufe daran haengen', async () => {
      const dienst = baueSuppliersService(zustand, 4);

      const { error } = await dienst.deleteSupplier('l-1');

      expect(error?.message).toContain('4 Einkäufe');
      expect(dienst.suppliers().some((s) => s.id === 'l-1')).toBe(true);
    });

    it('loescht endgueltig, wenn kein Einkauf verweist', async () => {
      const dienst = baueSuppliersService(zustand, 0);

      const { error } = await dienst.deleteSupplier('l-1');

      expect(error).toBeNull();
      expect(dienst.suppliers()).toHaveLength(0);
    });

    it('archiviert statt zu loeschen', async () => {
      const dienst = baueSuppliersService(zustand, 9);
      dienst.zeigeArchivierte.set(true);

      const { error } = await dienst.setSupplierArchiviert('l-1', true);

      expect(error).toBeNull();
      expect(dienst.suppliers().find((s) => s.id === 'l-1')?.is_active).toBe(false);
    });

    it('aendert Name und Kontaktangaben', async () => {
      const dienst = baueSuppliersService(zustand, 0);

      await dienst.updateSupplier('l-1', {
        name: 'Grosshaendler Sued',
        contact_info: 'info@example.org',
      });

      const eintrag = dienst.suppliers().find((s) => s.id === 'l-1');
      expect(eintrag?.name).toBe('Grosshaendler Sued');
      expect(eintrag?.contact_info).toBe('info@example.org');
    });

    it('blendet archivierte Eintraege aus den Auswahllisten aus', () => {
      const lieferanten: Supplier[] = [
        { id: 'l-1', workspace_id: 'ws-1', name: 'Aktiv', is_active: true },
        { id: 'l-2', workspace_id: 'ws-1', name: 'Archiviert', is_active: false },
      ];

      expect(nurAktive(lieferanten).map((s) => s.name)).toEqual(['Aktiv']);
    });
  });
});
