import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { Source, Supplier } from '../models/flipbase.models';
import { SourcesService } from './sources.service';
import { SuppliersService } from './suppliers.service';
import { SyncStatusService } from './sync-status.service';

const quelle: Source = {
  id: 'source-1',
  workspace_id: 'workspace-1',
  name: 'Flohmarkt',
  type: 'flea_market',
  is_default: false,
  is_active: true,
};

const lieferant: Supplier = {
  id: 'supplier-1',
  workspace_id: 'workspace-1',
  name: 'Händler',
  contact_info: null,
  notes: null,
  is_active: true,
};

type Aktion = 'anlegen' | 'ändern' | 'archivieren' | 'löschen';

function fehlerClient(stammdatenTabelle: 'sources' | 'suppliers') {
  return {
    from(tabelle: string) {
      if (tabelle === 'purchases') {
        return {
          select: () => ({
            eq: async () => ({ count: 0, error: null }),
          }),
        };
      }
      if (tabelle !== stammdatenTabelle) throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      const antwort = { data: null, error: { code: '42501', message: 'denied' } };
      return {
        insert: () => ({ select: () => ({ single: async () => antwort }) }),
        update: () => ({ eq: async () => antwort }),
        delete: () => ({ eq: async () => antwort }),
      };
    },
  };
}

function erstelleQuellenDienst() {
  let lokal = [quelle];
  const mockStore = {
    isDemoMode: signal(false),
    getPurchases: () => [],
    getSources: () => lokal,
    saveSource: (wert: Source) => {
      lokal = [...lokal.filter((item) => item.id !== wert.id), wert];
    },
    deleteSource: (id: string) => {
      lokal = lokal.filter((item) => item.id !== id);
    },
  };
  const dienst = Object.create(SourcesService.prototype) as SourcesService;
  Object.assign(dienst, {
    supabase: { client: fehlerClient('sources') },
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
    mockStore,
    sources: signal<Source[]>([quelle]),
    zeigeArchivierte: signal(false),
  });
  return { dienst, lokal: () => lokal };
}

function erstelleLieferantenDienst() {
  let lokal = [lieferant];
  const mockStore = {
    isDemoMode: signal(false),
    getPurchases: () => [],
    getSuppliers: () => lokal,
    saveSupplier: (wert: Supplier) => {
      lokal = [...lokal.filter((item) => item.id !== wert.id), wert];
    },
    deleteSupplier: (id: string) => {
      lokal = lokal.filter((item) => item.id !== id);
    },
  };
  const dienst = Object.create(SuppliersService.prototype) as SuppliersService;
  Object.assign(dienst, {
    supabase: { client: fehlerClient('suppliers') },
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
    mockStore,
    suppliers: signal<Supplier[]>([lieferant]),
    zeigeArchivierte: signal(false),
  });
  return { dienst, lokal: () => lokal };
}

describe('Stammdatenservices – bestätigte lokale Zustände', () => {
  it.each<Aktion>(['anlegen', 'ändern', 'archivieren', 'löschen'])(
    'übernimmt Quellen beim %s erst nach Datenbankerfolg',
    async (aktion) => {
      const { dienst, lokal } = erstelleQuellenDienst();
      const ergebnis =
        aktion === 'anlegen'
          ? await dienst.createSource('Kleinanzeigen')
          : aktion === 'ändern'
            ? await dienst.updateSource(quelle.id, { name: 'Geändert' })
            : aktion === 'archivieren'
              ? await dienst.setSourceArchiviert(quelle.id, false)
              : await dienst.deleteSource(quelle.id);

      expect(ergebnis.error).toBeInstanceOf(Error);
      expect(dienst.sources()).toEqual([quelle]);
      expect(lokal()).toEqual([quelle]);
    },
  );

  it.each<Aktion>(['anlegen', 'ändern', 'archivieren', 'löschen'])(
    'übernimmt Lieferanten beim %s erst nach Datenbankerfolg',
    async (aktion) => {
      const { dienst, lokal } = erstelleLieferantenDienst();
      const ergebnis =
        aktion === 'anlegen'
          ? await dienst.createSupplier('Neu')
          : aktion === 'ändern'
            ? await dienst.updateSupplier(lieferant.id, { name: 'Geändert' })
            : aktion === 'archivieren'
              ? await dienst.setSupplierArchiviert(lieferant.id, false)
              : await dienst.deleteSupplier(lieferant.id);

      expect(ergebnis.error).toBeInstanceOf(Error);
      expect(dienst.suppliers()).toEqual([lieferant]);
      expect(lokal()).toEqual([lieferant]);
    },
  );
});
