import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemCost, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
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
  sale_state: 'no_active_sale',
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
  const syncStatus = new SyncStatusService();
  const injector = Injector.create({
    providers: [
      ProfitEngineService,
      { provide: SupabaseService, useValue: { client } },
      { provide: SyncStatusService, useValue: syncStatus },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspace) } },
    ],
  });

  return {
    dienst: runInInjectionContext(injector, () => new InventoryService()),
    syncStatus,
  };
}

function verzoegerteAntwort<T>() {
  let resolve!: (wert: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('Archivmetadaten im geladenen Inventar', () => {
  it('aktualisiert Liste und Detail ohne Buchungsdaten anzutasten und ignoriert fremde Workspaces', () => {
    const { dienst } = injiziereDienst({});
    const sold: InventoryItem = {
      ...gespeicherterArtikel,
      status: 'sold',
      sale_state: 'sold',
      allocated_purchase_cost: 12,
    };
    dienst.items.set([sold]);
    dienst.selectedItem.set(sold);
    dienst.applyArchiveMetadata('fremd', sold.id, { archived_at: 'wrong', archived_by: 'wrong' });
    expect(dienst.items()).toEqual([sold]);
    dienst.applyArchiveMetadata(workspace.id, sold.id, {
      archived_at: '2026-09-05T12:00:00Z',
      archived_by: 'actor',
    });
    expect(dienst.items()[0]).toEqual({
      ...sold,
      archived_at: '2026-09-05T12:00:00Z',
      archived_by: 'actor',
    });
    expect(dienst.selectedItem()).toEqual(dienst.items()[0]);
    dienst.applyArchiveMetadata(workspace.id, sold.id, { archived_at: null, archived_by: null });
    expect(dienst.selectedItem()).toEqual({ ...sold, archived_at: null, archived_by: null });
  });
});

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
  it('lässt bei überlappenden Detailaufrufen nur den neuesten Artikel samt Kosten und Verlauf gewinnen', async () => {
    const artikelA = {
      ...gespeicherterArtikel,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Artikel A',
      costs: [{ id: 'kosten-a', type: 'repair', amount: 11 }],
    };
    const artikelB = {
      ...gespeicherterArtikel,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Artikel B',
      costs: [{ id: 'kosten-b', type: 'cleaning', amount: 22 }],
    };
    const antwortA = verzoegerteAntwort<{ data: typeof artikelA; error: null }>();
    const antwortB = verzoegerteAntwort<{ data: typeof artikelB; error: null }>();
    const antworten = new Map([
      [artikelA.id, antwortA],
      [artikelB.id, antwortB],
    ]);
    const client = {
      from(tabelle: string) {
        if (tabelle === 'inventory_items') {
          return {
            select() {
              let itemId = '';
              const query = {
                eq(spalte: string, wert: string) {
                  if (spalte === 'id') itemId = wert;
                  return query;
                },
                single: () => antworten.get(itemId)?.promise,
              };
              return query;
            },
          };
        }
        if (tabelle === 'inventory_item_sale_states') {
          return {
            select() {
              let itemId = '';
              const query = {
                eq(spalte: string, wert: string) {
                  if (spalte === 'inventory_item_id') itemId = wert;
                  return query;
                },
                then(resolve: (value: unknown) => void) {
                  resolve({
                    data: [
                      {
                        inventory_item_id: itemId,
                        workspace_id: workspace.id,
                        sale_state: 'no_active_sale',
                        active_sale_count: 0,
                        active_sale_id: null,
                      },
                    ],
                    error: null,
                  });
                },
              };
              return query;
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return {
            select() {
              let itemId = '';
              const query = {
                eq(spalte: string, wert: string) {
                  if (spalte === 'inventory_item_id') itemId = wert;
                  return query;
                },
                order: async () => ({
                  data: [
                    {
                      id: `verlauf-${itemId}`,
                      workspace_id: workspace.id,
                      inventory_item_id: itemId,
                      action: `Verlauf ${itemId}`,
                      created_at: '2026-08-30T12:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              };
              return query;
            },
          };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst } = injiziereDienst(client);

    const ladenA = dienst.getItemById(artikelA.id);
    const ladenB = dienst.getItemById(artikelB.id);
    antwortB.resolve({ data: artikelB, error: null });
    await ladenB;
    antwortA.resolve({ data: artikelA, error: null });
    await ladenA;

    expect(dienst.selectedItem()?.id).toBe(artikelB.id);
    expect(dienst.itemCosts()).toEqual(artikelB.costs);
    expect(dienst.activityLogs()).toEqual([
      expect.objectContaining({ inventory_item_id: artikelB.id }),
    ]);
  });

  it('merged den bestandswirksamen View-Zustand anhand der Artikel-ID', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const client = {
      from(tabelle: string) {
        if (tabelle === 'inventory_items') {
          return {
            select() {
              return {
                eq() {
                  return {
                    order: async () => ({ data: [gespeicherterArtikel], error: null }),
                  };
                },
              };
            },
            update(payload: unknown) {
              updatePayload = payload as Record<string, unknown>;
              return { eq: async () => ({ error: null, count: 1 }) };
            },
          };
        }
        if (tabelle === 'inventory_item_sale_states') {
          return {
            select() {
              return {
                eq: async () => ({
                  data: [
                    {
                      inventory_item_id: gespeicherterArtikel.id,
                      workspace_id: workspace.id,
                      sale_state: 'legacy_sold_unverified',
                      active_sale_count: 0,
                      active_sale_id: null,
                    },
                  ],
                  error: null,
                }),
              };
            },
          };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst } = injiziereDienst(client);

    await dienst.loadInventory(workspace.id);

    expect(dienst.items()[0]).toMatchObject({
      id: gespeicherterArtikel.id,
      sale_state: 'legacy_sold_unverified',
      active_sale_count: 0,
      active_sale_id: null,
    });
    expect(dienst.items()[0]).not.toHaveProperty('inventory_item_id');

    const sellableItem = {
      ...dienst.items()[0],
      status: 'ready' as const,
      sale_state: 'no_active_sale' as const,
    };
    dienst.items.set([sellableItem]);
    await dienst.updateItem(gespeicherterArtikel.id, sellableItem);

    expect(updatePayload).not.toHaveProperty('inventory_item_id');
    expect(updatePayload).not.toHaveProperty('sale_state');
    expect(updatePayload).not.toHaveProperty('active_sale_count');
    expect(updatePayload).not.toHaveProperty('active_sale_id');
  });

  it('blockiert generische Service-Mutationen für verkaufte und widersprüchliche Artikel', async () => {
    const { dienst } = injiziereDienst({
      from: () => {
        throw new Error('Datenbankzugriff darf nicht stattfinden');
      },
    });
    const lockedItem: InventoryItem = {
      ...gespeicherterArtikel,
      status: 'sold',
      sale_state: 'multiple_active_sales',
    };
    dienst.items.set([lockedItem]);
    dienst.selectedItem.set(lockedItem);

    const results = await Promise.all([
      dienst.updateItem(lockedItem.id, { title: 'Manipuliert' }),
      dienst.updateItemStatus(lockedItem.id, 'ready'),
      dienst.addItemCost(lockedItem.id, 'other', 1),
      dienst.deleteItemCost(lockedItem.id, 'cost-1'),
      dienst.deleteItem(lockedItem.id),
    ]);

    expect(results.every(({ error }) => error?.message.includes('Korrekturvorgang'))).toBe(true);
    expect(dienst.items()[0]).toEqual(lockedItem);
  });

  it('blockiert generische Service-Mutationen auch bei fehlendem Verkaufszustand', async () => {
    const { dienst } = injiziereDienst({
      from: () => {
        throw new Error('Datenbankzugriff darf nicht stattfinden');
      },
    });
    const lockedItem: InventoryItem = {
      ...gespeicherterArtikel,
      status: 'ready',
      sale_state: undefined,
    };
    dienst.items.set([lockedItem]);
    dienst.selectedItem.set(lockedItem);

    const results = await Promise.all([
      dienst.updateItem(lockedItem.id, { title: 'Manipuliert' }),
      dienst.updateItemStatus(lockedItem.id, 'listed'),
      dienst.addItemCost(lockedItem.id, 'other', 1),
      dienst.deleteItemCost(lockedItem.id, 'cost-1'),
      dienst.deleteItem(lockedItem.id),
    ]);

    expect(results.every(({ error }) => error?.message.includes('Korrekturvorgang'))).toBe(true);
    expect(dienst.items()[0]).toEqual(lockedItem);
  });

  it.each([
    ['ungeklärten Altbestand', 'legacy_sold_unverified', 'sold', 0, null],
    [
      'Legacy-Verkaufskopf ohne Position',
      'legacy_sale_header_without_line',
      'sold',
      1,
      '55555555-5555-4555-8555-555555555551',
    ],
    ['mehrere aktive Verkäufe', 'multiple_active_sales', 'sold', 2, null],
    ['Statuskonflikt', 'sale_status_conflict', 'ready', 1, '55555555-5555-4555-8555-555555555552'],
  ] as const)(
    'merged beim kalten Supabase-Detailaufruf %s und blockiert generische Mutationen',
    async (_label, saleState, status, activeSaleCount, activeSaleId) => {
      const rawItem: InventoryItem = { ...gespeicherterArtikel, status };
      const client = {
        from(tabelle: string) {
          if (tabelle === 'inventory_items') {
            return {
              select() {
                const query = {
                  eq: () => query,
                  single: async () => ({ data: rawItem, error: null }),
                };
                return query;
              },
              update() {
                return { eq: async () => ({ error: null, count: 1 }) };
              },
            };
          }
          if (tabelle === 'inventory_item_sale_states') {
            return {
              select() {
                const query = {
                  eq: () => query,
                  then: (
                    onfulfilled: (value: {
                      data: {
                        inventory_item_id: string;
                        workspace_id: string;
                        sale_state: typeof saleState;
                        active_sale_count: number;
                        active_sale_id: string | null;
                      }[];
                      error: null;
                    }) => unknown,
                  ) =>
                    Promise.resolve({
                      data: [
                        {
                          inventory_item_id: rawItem.id,
                          workspace_id: workspace.id,
                          sale_state: saleState,
                          active_sale_count: activeSaleCount,
                          active_sale_id: activeSaleId,
                        },
                      ],
                      error: null,
                    }).then(onfulfilled),
                };
                return query;
              },
            };
          }
          if (tabelle === 'activity_logs') {
            return {
              select() {
                const query = {
                  eq: () => query,
                  order: async () => ({ data: [], error: null }),
                };
                return query;
              },
              insert: async () => ({ error: null }),
            };
          }
          throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        },
      };
      const { dienst } = injiziereDienst(client);

      const detail = await dienst.getItemById(rawItem.id);
      const mutation = await dienst.updateItemStatus(rawItem.id, 'ready');

      expect(detail).toMatchObject({
        id: rawItem.id,
        sale_state: saleState,
        active_sale_count: activeSaleCount,
        active_sale_id: activeSaleId,
      });
      expect(dienst.selectedItem()).toEqual(detail);
      expect(mutation.error?.message).toContain('Korrekturvorgang');
    },
  );

  it('veröffentlicht beim kalten Supabase-Detailaufruf keinen Artikel ohne sicheren View-Zustand', async () => {
    const client = {
      from(tabelle: string) {
        if (tabelle === 'inventory_items') {
          return {
            select() {
              return {
                eq() {
                  return {
                    single: async () => ({ data: gespeicherterArtikel, error: null }),
                  };
                },
              };
            },
          };
        }
        if (tabelle === 'inventory_item_sale_states') {
          return {
            select() {
              return {
                eq: async () => ({
                  data: null,
                  error: { code: '42501', message: 'view denied' },
                }),
              };
            },
          };
        }
        throw new Error(`Unerwartete Tabelle: ${tabelle}`);
      },
    };
    const { dienst, syncStatus } = injiziereDienst(client);

    const detail = await dienst.getItemById(gespeicherterArtikel.id);

    expect(detail).toBeNull();
    expect(dienst.selectedItem()).toBeNull();
    expect(syncStatus.hatFehler()).toBe(true);
  });

  it('aktualisiert lokale Signale erst nach bestätigter Legacy-Klärung', async () => {
    let rpcAntwortAufloesen!: (wert: unknown) => void;
    const offeneAntwort = new Promise((resolve) => {
      rpcAntwortAufloesen = resolve;
    });
    const rpc = vi.fn(() => offeneAntwort);
    const client = { rpc };
    const { dienst } = injiziereDienst(client);
    const legacyItem: InventoryItem = {
      ...gespeicherterArtikel,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
      active_sale_count: 0,
      active_sale_id: null,
    };
    dienst.items.set([legacyItem]);
    dienst.selectedItem.set(legacyItem);

    const klaerung = dienst.resolveLegacySoldItem(legacyItem.id);
    expect(rpc).toHaveBeenCalledWith('resolve_legacy_sold_item', {
      p_workspace_id: workspace.id,
      p_inventory_item_id: legacyItem.id,
      p_action: 'restore_stock',
      p_reason: 'Historische Statuskorrektur: Artikel ist noch vorhanden.',
    });
    expect(dienst.items()[0].status).toBe('sold');

    rpcAntwortAufloesen({
      data: { inventory_item: { ...legacyItem, status: 'ready' } },
      error: null,
    });
    const ergebnis = await klaerung;

    expect(ergebnis.error).toBeNull();
    expect(dienst.items()[0]).toMatchObject({
      status: 'ready',
      sale_state: 'no_active_sale',
      active_sale_count: 0,
      active_sale_id: null,
    });
    expect(dienst.selectedItem()?.status).toBe('ready');
  });

  it('behält lokale Signale bei, wenn die Legacy-Klärung scheitert', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { code: '22023', message: 'Korrektur erforderlich' },
      }),
    };
    const { dienst } = injiziereDienst(client);
    const legacyItem: InventoryItem = {
      ...gespeicherterArtikel,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    };
    dienst.items.set([legacyItem]);
    dienst.selectedItem.set(legacyItem);

    const ergebnis = await dienst.resolveLegacySoldItem(legacyItem.id);

    expect(ergebnis.error).toBeInstanceOf(Error);
    expect(dienst.items()[0]).toEqual(legacyItem);
    expect(dienst.selectedItem()).toEqual(legacyItem);
  });

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

  it('sendet abgeleitete Verkaufszustände nicht an inventory_items', async () => {
    let gesendeterPayload: Record<string, unknown> | null = null;
    const client = {
      from(tabelle: string) {
        if (tabelle !== 'inventory_items') throw new Error(`Unerwartete Tabelle: ${tabelle}`);
        return {
          update(payload: unknown) {
            gesendeterPayload = payload as Record<string, unknown>;
            return {
              async eq() {
                return { error: null, count: 1 };
              },
            };
          },
        };
      },
    };
    const { dienst } = injiziereDienst(client);

    const ergebnis = await dienst.updateItem(gespeicherterArtikel.id, {
      title: 'Aktualisierter Titel',
      sale_state: 'sold',
      active_sale_count: 1,
      active_sale_id: '55555555-5555-4555-8555-555555555555',
    });

    expect(ergebnis.error).toBeNull();
    expect(gesendeterPayload).toMatchObject({
      title: 'Aktualisierter Titel',
      updated_at: expect.any(String),
    });
    expect(gesendeterPayload).not.toHaveProperty('sale_state');
    expect(gesendeterPayload).not.toHaveProperty('active_sale_count');
    expect(gesendeterPayload).not.toHaveProperty('active_sale_id');
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

describe('Paketinhalt im Inventar', () => {
  it.each([null, 0, 10])('behält Einzelkosten %s beim Laden samt Zusatzkosten', (cost) => {
    const { dienst } = injiziereDienst({});
    const enriched = dienst.enrichItemTotals({
      ...gespeicherterArtikel,
      source_package_line_id: 'package',
      allocated_purchase_cost: cost,
      total_item_cost: 999,
      profit_potential: 999,
      costs: [{ type: 'repair', amount: 2 }],
    });
    expect(enriched.allocated_purchase_cost).toBe(cost);
    expect(enriched.total_item_cost).toBe(cost === null ? undefined : cost + 2);
    expect(enriched.profit_potential).toBe(cost === null ? undefined : 18 - cost);
    expect(enriched.purchase_id).toBe(gespeicherterArtikel.purchase_id);
    expect(enriched.source_package_line_id).toBe('package');
  });
  it('speichert eine Artikeländerung mit NULL und blockiert das Ablösen der Herkunft', async () => {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null, count: 1 })) }));
    const { dienst } = injiziereDienst({ from: () => ({ update }) });
    const content = {
      ...gespeicherterArtikel,
      allocated_purchase_cost: null,
      source_package_line_id: 'package',
    };
    dienst.items.set([content]);
    dienst.selectedItem.set(content);
    expect(
      (
        await dienst.updateItem(content.id, {
          title: 'Neue Beschreibung',
          allocated_purchase_cost: null,
        })
      ).error,
    ).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ allocated_purchase_cost: null }),
      { count: 'exact' },
    );
    expect(dienst.selectedItem()).toMatchObject({
      title: 'Neue Beschreibung',
      allocated_purchase_cost: null,
      source_package_line_id: 'package',
      purchase_id: content.purchase_id,
    });
    for (const updates of [
      { purchase_id: null },
      { source_package_line_id: null },
      { purchase_line_id: 'other' },
    ]) {
      expect((await dienst.updateItem(content.id, updates)).error?.message).toContain('Herkunft');
    }
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('InventoryService – Kategorie und Marke', () => {
  it('sendet beim Anlegen Verweise und keinen abgeleiteten Text', async () => {
    const { dienst, aufrufe } = erstelleDienst({
      data: {
        ...gespeicherterArtikel,
        category_id: 'el-6-6',
        category: 'Elektronik > Computer > Laptops',
        brand_id: 'brand-1',
        brand: 'Lenovo',
      },
      error: null,
    });

    const ergebnis = await dienst.createItem({
      title: 'Laptop',
      condition: 'used',
      categoryId: 'el-6-6',
      brandId: 'brand-1',
      allocated_purchase_cost: 0,
    });

    const insertPayload = aufrufe.find(({ tabelle }) => tabelle === 'inventory_items')?.payload;
    expect(insertPayload).toMatchObject({ category_id: 'el-6-6', brand_id: 'brand-1' });
    expect(insertPayload).not.toHaveProperty('category');
    expect(insertPayload).not.toHaveProperty('brand');
    expect(ergebnis.data).toMatchObject({
      category: 'Elektronik > Computer > Laptops',
      brand: 'Lenovo',
    });
  });

  it('liest nach geänderten Verweisen die abgeleiteten Texte aus der Datenbank nach', async () => {
    const update = vi.fn((payload: Record<string, unknown>, options?: unknown) => {
      void payload;
      void options;
      return {
        eq: vi.fn(async () => ({ error: null, count: 1 })),
      };
    });
    const maybeSingle = vi.fn(async () => ({
      data: {
        category_id: 'el-6-6',
        category: 'Elektronik > Computer > Laptops',
        brand_id: null,
        brand: null,
      },
      error: null,
    }));
    const select = vi.fn(() => ({
      eq: () => ({ maybeSingle }),
    }));
    const { dienst } = injiziereDienst({
      from: () => ({ update, select }),
    });
    const oldItem = {
      ...gespeicherterArtikel,
      category_id: 'old-category',
      category: 'Alt',
      brand_id: 'old-brand',
      brand: 'Alt',
    };
    dienst.items.set([oldItem]);

    const ergebnis = await dienst.updateItem(oldItem.id, {
      categoryId: 'el-6-6',
      brandId: null,
    });

    expect(ergebnis.error).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'el-6-6', brand_id: null }),
      { count: 'exact' },
    );
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('categoryId');
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('brandId');
    expect(select).toHaveBeenCalledWith('category_id, category, brand_id, brand');
    expect(dienst.items()[0]).toMatchObject({
      category_id: 'el-6-6',
      category: 'Elektronik > Computer > Laptops',
      brand_id: null,
      brand: null,
    });
  });

  it('liest bei anderen Änderungen keine Kategorie- oder Markenfelder nach', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null, count: 1 })),
    }));
    const select = vi.fn();
    const { dienst } = injiziereDienst({ from: () => ({ update, select }) });
    const oldItem = {
      ...gespeicherterArtikel,
      category_id: 'old-category',
      brand_id: 'old-brand',
    };
    dienst.items.set([oldItem]);

    await dienst.updateItem(oldItem.id, { title: 'Neu' });

    expect(select).not.toHaveBeenCalled();
    expect(dienst.items()[0]).toMatchObject({
      title: 'Neu',
      category_id: 'old-category',
      brand_id: 'old-brand',
    });
  });
});
