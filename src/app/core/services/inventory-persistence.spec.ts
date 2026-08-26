import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { InventoryItem, ItemCost, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { MockDataStoreService } from './mock-data-store.service';
import { ProfitEngineService } from './profit-engine.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  currency: 'EUR',
  min_roi_percent: 30,
  min_profit_amount: 15,
  created_at: '2026-08-24T10:00:00.000Z',
};

const gespeicherterArtikel: InventoryItem = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspace.id,
  purchase_id: '33333333-3333-4333-8333-333333333333',
  title: 'Testartikel',
  condition: 'used',
  status: 'received',
  sku: null,
  category: null,
  brand: null,
  model: null,
  ean: null,
  description: null,
  allocated_purchase_cost: 0,
  expected_value: 20,
  created_at: '2026-08-24T10:01:00.000Z',
};

interface SupabaseAntwort {
  readonly data: InventoryItem | null;
  readonly error: { code: string; message: string } | null;
}

function injiziereDienst(client: unknown) {
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(false);
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      ProfitEngineService,
      { provide: SupabaseService, useValue: { client } },
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: SyncStatusService, useValue: syncStatus },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspace) } },
    ],
  });

  return {
    dienst: runInInjectionContext(injector, () => new InventoryService()),
    syncStatus,
  };
}

function erstelleDienst(artikelAntwort: SupabaseAntwort) {
  const aufrufe: { tabelle: string; payload: unknown }[] = [];

  const client = {
    from(tabelle: string) {
      if (tabelle === 'inventory_items') {
        return {
          insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            return {
              select() {
                return { single: async () => artikelAntwort };
              },
            };
          },
        };
      }

      if (tabelle === 'activity_logs') {
        return {
          async insert(payload: unknown) {
            aufrufe.push({ tabelle, payload });
            return { error: null };
          },
        };
      }

      throw new Error(`Unerwartete Tabelle: ${tabelle}`);
    },
  };

  const { dienst, syncStatus } = injiziereDienst(client);

  return {
    dienst,
    aufrufe,
    syncStatus,
  };
}

describe('InventoryService – abhängige Schreibvorgänge', () => {
  it('veröffentlicht einen neuen Artikel nicht während das Datenbank-Insert noch offen ist', async () => {
    let insertAbschliessen!: (antwort: SupabaseAntwort) => void;
    const offeneAntwort = new Promise<SupabaseAntwort>((resolve) => {
      insertAbschliessen = resolve;
    });
    const client = {
      from(tabelle: string) {
        if (tabelle === 'inventory_items') {
          return {
            insert() {
              return {
                select() {
                  return { single: () => offeneAntwort };
                },
              };
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst } = injiziereDienst(client);

    const ergebnisPromise = dienst.createItem({
      title: 'Testartikel',
      condition: 'used',
      allocated_purchase_cost: 0,
    });

    expect(dienst.items()).toEqual([]);
    insertAbschliessen({ data: gespeicherterArtikel, error: null });
    await ergebnisPromise;
    expect(dienst.items()).toEqual([expect.objectContaining({ id: gespeicherterArtikel.id })]);
  });

  it('speichert den Artikel vor dem Aktivitätsprotokoll und verwendet dessen echte ID', async () => {
    const { dienst, aufrufe, syncStatus } = erstelleDienst({
      data: gespeicherterArtikel,
      error: null,
    });

    const ergebnis = await dienst.createItem({
      purchase_id: gespeicherterArtikel.purchase_id,
      title: 'Testartikel',
      condition: 'used',
      allocated_purchase_cost: 0,
      expected_value: 20,
    });

    expect(ergebnis.error).toBeNull();
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['inventory_items', 'activity_logs']);
    expect(aufrufe[1].payload).toMatchObject({
      inventory_item_id: gespeicherterArtikel.id,
    });
    expect(dienst.items().map(({ id }) => id)).toEqual([gespeicherterArtikel.id]);
    expect(syncStatus.hatFehler()).toBe(false);
  });

  it('entfernt den vorläufigen Artikel und schreibt kein Protokoll, wenn der Artikel fehlschlägt', async () => {
    const { dienst, aufrufe } = erstelleDienst({
      data: null,
      error: { code: '23503', message: 'purchase missing' },
    });

    const ergebnis = await dienst.createItem({
      purchase_id: gespeicherterArtikel.purchase_id,
      title: 'Testartikel',
      condition: 'used',
      allocated_purchase_cost: 0,
    });

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['inventory_items']);
    expect(dienst.items()).toEqual([]);
    expect(dienst.activityLogs()).toEqual([]);
  });

  it('protokolliert einen Statuswechsel erst nach erfolgreicher Datenbankänderung', async () => {
    const aufrufe: string[] = [];
    const client = {
      from(tabelle: string) {
        if (tabelle === 'inventory_items') {
          return {
            update() {
              aufrufe.push('inventory_items');
              return {
                async eq() {
                  return { error: { code: '42501', message: 'denied' } };
                },
              };
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return {
            async insert() {
              aufrufe.push('activity_logs');
              return { error: null };
            },
          };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);

    const ergebnis = await dienst.updateItemStatus(gespeicherterArtikel.id, 'ready');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(aufrufe).toEqual(['inventory_items']);
    expect(dienst.items()[0].status).toBe('received');
    expect(dienst.activityLogs()).toEqual([]);
  });

  it('übernimmt Artikeländerungen erst nach erfolgreicher Datenbankänderung', async () => {
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'inventory_items') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        return {
          update() {
            return {
              async eq() {
                return { error: { code: '42501', message: 'denied' } };
              },
            };
          },
        };
      },
    };
    const { dienst } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);
    dienst.selectedItem.set(gespeicherterArtikel);

    const ergebnis = await dienst.updateItem(gespeicherterArtikel.id, {
      is_public_store: true,
    });

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.items()[0].is_public_store).toBeUndefined();
    expect(dienst.selectedItem()?.is_public_store).toBeUndefined();
  });

  it('behandelt Updates ohne betroffene Artikelzeile als Fehler', async () => {
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'inventory_items') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        return {
          update(_payload: unknown, optionen?: { count?: string }) {
            return {
              eq: async () => ({
                error: null,
                count: optionen?.count === 'exact' ? 0 : undefined,
              }),
            };
          },
        };
      },
    };
    const { dienst, syncStatus } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);
    dienst.selectedItem.set(gespeicherterArtikel);

    const artikelErgebnis = await dienst.updateItem(gespeicherterArtikel.id, {
      is_public_store: true,
    });
    const statusErgebnis = await dienst.updateItemStatus(gespeicherterArtikel.id, 'ready');

    expect(artikelErgebnis.error).toBeInstanceOf(Error);
    expect(statusErgebnis.error).toBeInstanceOf(Error);
    expect(dienst.items()[0]).toMatchObject({ status: 'received' });
    expect(dienst.items()[0].is_public_store).toBeUndefined();
    expect(syncStatus.fehler()).toHaveLength(2);
  });

  it('übernimmt bei Artikelkosten die Datenbank-ID und protokolliert danach', async () => {
    const gespeicherteKosten: ItemCost = {
      id: '44444444-4444-4444-8444-444444444444',
      inventory_item_id: gespeicherterArtikel.id,
      type: 'repair',
      amount: 4.5,
      description: 'Schalter',
      created_at: '2026-08-24T10:02:00.000Z',
    };
    const aufrufe: string[] = [];
    const client = {
      from(tabelle: string) {
        if (tabelle === 'item_costs') {
          return {
            insert() {
              aufrufe.push('item_costs');
              return {
                select() {
                  return { single: async () => ({ data: gespeicherteKosten, error: null }) };
                },
              };
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return {
            async insert() {
              aufrufe.push('activity_logs');
              return { error: null };
            },
          };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);

    const ergebnis = await dienst.addItemCost(gespeicherterArtikel.id, 'repair', 4.5, 'Schalter');

    expect(ergebnis.error).toBeNull();
    expect(aufrufe).toEqual(['item_costs', 'activity_logs']);
    expect(dienst.itemCosts().map(({ id }) => id)).toEqual([gespeicherteKosten.id]);
  });

  it('bricht bei leerer Artikelkosten-Antwort vor lokalem Erfolg und Aktivitätsprotokoll ab', async () => {
    const client = {
      from(tabelle: string) {
        if (tabelle === 'item_costs') {
          return {
            insert() {
              return {
                select() {
                  return { single: async () => ({ data: null, error: null }) };
                },
              };
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst, syncStatus } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);

    const ergebnis = await dienst.addItemCost(gespeicherterArtikel.id, 'repair', 4.5, 'Schalter');

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.itemCosts()).toEqual([]);
    expect(dienst.activityLogs()).toEqual([]);
    expect(syncStatus.hatFehler()).toBe(true);
  });

  it('behält Artikelkosten bei, wenn das Löschen in der Datenbank fehlschlägt', async () => {
    const kosten: ItemCost = {
      id: '44444444-4444-4444-8444-444444444444',
      inventory_item_id: gespeicherterArtikel.id,
      type: 'repair',
      amount: 4.5,
      description: null,
      created_at: '2026-08-24T10:02:00.000Z',
    };
    let geloeschteId = '';
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'item_costs') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        return {
          delete() {
            return {
              async eq(_spalte: string, id: string) {
                geloeschteId = id;
                return { error: { code: '42501', message: 'denied' } };
              },
            };
          },
        };
      },
    };
    const { dienst } = injiziereDienst(client);
    dienst.itemCosts.set([kosten]);
    dienst.items.set([{ ...gespeicherterArtikel, costs: [kosten] }]);

    const ergebnis = await dienst.deleteItemCost(gespeicherterArtikel.id, kosten.id!);

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(geloeschteId).toBe(kosten.id!);
    expect(dienst.itemCosts()).toEqual([kosten]);
    expect(dienst.items()[0].costs).toEqual([kosten]);
  });

  it('behält einen Artikel bei, wenn das Löschen in der Datenbank fehlschlägt', async () => {
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'inventory_items') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        return {
          delete() {
            return {
              async eq() {
                return { error: { code: '42501', message: 'denied' } };
              },
            };
          },
        };
      },
    };
    const { dienst } = injiziereDienst(client);
    dienst.items.set([gespeicherterArtikel]);
    dienst.selectedItem.set(gespeicherterArtikel);

    const ergebnis = await dienst.deleteItem(gespeicherterArtikel.id);

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.items()).toEqual([gespeicherterArtikel]);
    expect(dienst.selectedItem()).toEqual(gespeicherterArtikel);
  });

  it('behandelt Löschvorgänge ohne betroffene Zeile als Fehler', async () => {
    const kosten: ItemCost = {
      id: '44444444-4444-4444-8444-444444444444',
      inventory_item_id: gespeicherterArtikel.id,
      type: 'repair',
      amount: 4.5,
      description: null,
      created_at: '2026-08-24T10:02:00.000Z',
    };
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'item_costs' && tabelle !== 'inventory_items') {
          throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        }
        return {
          delete(optionen?: { count?: string }) {
            return {
              eq: async () => ({
                error: null,
                count: optionen?.count === 'exact' ? 0 : undefined,
              }),
            };
          },
        };
      },
    };
    const { dienst, syncStatus } = injiziereDienst(client);
    dienst.itemCosts.set([kosten]);
    dienst.items.set([{ ...gespeicherterArtikel, costs: [kosten] }]);
    dienst.selectedItem.set(gespeicherterArtikel);

    const kostenErgebnis = await dienst.deleteItemCost(gespeicherterArtikel.id, kosten.id!);
    const artikelErgebnis = await dienst.deleteItem(gespeicherterArtikel.id);

    expect(kostenErgebnis.error).toBeInstanceOf(Error);
    expect(artikelErgebnis.error).toBeInstanceOf(Error);
    expect(dienst.itemCosts()).toEqual([kosten]);
    expect(dienst.items()).toHaveLength(1);
    expect(dienst.selectedItem()).toEqual(gespeicherterArtikel);
    expect(syncStatus.fehler()).toHaveLength(2);
  });
});
