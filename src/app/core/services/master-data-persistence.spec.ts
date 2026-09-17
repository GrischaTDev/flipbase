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
  it('speichert Verkäuferkontakte strukturiert ohne alten Profilverweis', async () => {
    let insertPayload: Record<string, unknown> | null = null;
    const dienst = Object.create(SuppliersService.prototype) as SuppliersService;
    Object.assign(dienst, {
      supabase: {
        client: {
          from: () => ({
            insert: (payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'supplier-new' }, error: null }),
                }),
              };
            },
          }),
        },
      },
      syncStatus: new SyncStatusService(),
      workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
      mockStore: {
        isDemoMode: signal(false),
        saveSupplier: () => undefined,
      },
      suppliers: signal<Supplier[]>([]),
    });

    const result = await dienst.createSupplier({
      seller_type: 'business',
      name: ' Close Vintage ',
      contact_person: ' Ada Beispiel ',
      country_code: 'DE',
      street: '',
      address_extra: '',
      postal_code: '10115',
      city: 'Berlin',
      email: 'mail@example.com',
      phone: '+491701234567',
      website: '',
      notes: '',
    });

    expect(result.error).toBeNull();
    expect(insertPayload).toEqual(
      expect.objectContaining({
        workspace_id: 'workspace-1',
        seller_type: 'business',
        name: 'Close Vintage',
        contact_person: 'Ada Beispiel',
        country_code: 'DE',
        phone: '+491701234567',
      }),
    );
    expect(insertPayload).not.toHaveProperty('contact_info');
    expect(insertPayload).not.toHaveProperty('profile_url');
  });

  it('löscht explizit geleerte strukturierte Kontakt- und Adressfelder', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const strukturierterLieferant: Supplier = {
      ...lieferant,
      seller_type: 'business',
      contact_person: 'Ada Beispiel',
      country_code: 'DE',
      street: 'Musterstraße 1',
      address_extra: 'Hinterhaus',
      postal_code: '10115',
      city: 'Berlin',
      email: 'ada@example.com',
      phone: '+491701234567',
      website: 'https://example.com',
      notes: 'Rückruf vormittags',
    };
    const dienst = Object.create(SuppliersService.prototype) as SuppliersService;
    Object.assign(dienst, {
      supabase: {
        client: {
          from: () => ({
            update: (payload: Record<string, unknown>) => {
              updatePayload = payload;
              return { eq: async () => ({ error: null }) };
            },
          }),
        },
      },
      syncStatus: new SyncStatusService(),
      mockStore: {
        isDemoMode: signal(false),
        saveSupplier: () => undefined,
      },
      suppliers: signal<Supplier[]>([strukturierterLieferant]),
    });

    const result = await dienst.updateSupplier(strukturierterLieferant.id, {
      seller_type: 'business',
      contact_person: null,
      street: null,
      address_extra: null,
      postal_code: null,
      city: null,
      email: null,
      phone: null,
    });

    expect(result.error).toBeNull();
    expect(updatePayload).toEqual(
      expect.objectContaining({
        contact_person: null,
        street: null,
        address_extra: null,
        postal_code: null,
        city: null,
        email: null,
        phone: null,
        country_code: 'DE',
        website: 'https://example.com',
        notes: 'Rückruf vormittags',
      }),
    );
    expect(dienst.suppliers()[0]).toEqual(
      expect.objectContaining({
        contact_person: null,
        street: null,
        address_extra: null,
        postal_code: null,
        city: null,
        email: null,
        phone: null,
      }),
    );
  });

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
