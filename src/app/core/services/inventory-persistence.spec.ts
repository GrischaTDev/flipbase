import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, ItemCost, Sale, Workspace } from '../models/flipbase.models';
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

function injiziereDienst(client: unknown, bereitgestellterMockStore?: MockDataStoreService) {
  const mockStore = bereitgestellterMockStore ?? new MockDataStoreService();
  if (!bereitgestellterMockStore) mockStore.isDemoMode.set(false);
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

function verzoegerteAntwort<T>() {
  let resolve!: (wert: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
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
              return {
                eq(_spalte: string, itemId: string) {
                  return {
                    single: () => antworten.get(itemId)?.promise,
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
                eq: async (_spalte: string, itemId: string) => ({
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
                }),
              };
            },
          };
        }
        if (tabelle === 'activity_logs') {
          return {
            select() {
              return {
                eq(_spalte: string, itemId: string) {
                  return {
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
                },
              };
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

  it('klassifiziert Demo-Artikel aus persistierten Positionen und Legacy-Köpfen', async () => {
    const lineItem = { ...gespeicherterArtikel, id: 'demo-line', status: 'sold' as const };
    const legacyItem = { ...gespeicherterArtikel, id: 'demo-header', status: 'sold' as const };
    const sales: Sale[] = [
      {
        id: 'sale-line',
        workspace_id: workspace.id,
        inventory_item_id: lineItem.id,
        platform: 'direct',
        sale_price: 20,
        sale_date: '2026-08-29',
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        lines: [
          {
            id: 'line',
            sale_id: 'sale-line',
            inventory_item_id: lineItem.id,
            title_snapshot: 'Line',
            quantity: 1,
            unit_sale_price: 20,
            line_total: 20,
            cost_of_goods_sold: 5,
            tax_mode: 'diff_25a',
          },
        ],
      },
      {
        id: 'sale-header',
        workspace_id: workspace.id,
        inventory_item_id: legacyItem.id,
        platform: 'direct',
        sale_price: 18,
        sale_date: '2026-08-29',
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        lines: [],
      },
    ];
    const demoStore = {
      isDemoMode: signal(true),
      getItems: () => [lineItem, legacyItem],
      getSales: () => sales,
    } as unknown as MockDataStoreService;
    const { dienst } = injiziereDienst({}, demoStore);

    await dienst.loadInventory(workspace.id);

    expect(dienst.items().find(({ id }) => id === lineItem.id)?.sale_state).toBe('sold');
    expect(dienst.items().find(({ id }) => id === legacyItem.id)?.sale_state).toBe(
      'legacy_sale_header_without_line',
    );
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
                return {
                  eq() {
                    return { single: async () => ({ data: rawItem, error: null }) };
                  },
                };
              },
              update() {
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
                        inventory_item_id: rawItem.id,
                        workspace_id: workspace.id,
                        sale_state: saleState,
                        active_sale_count: activeSaleCount,
                        active_sale_id: activeSaleId,
                      },
                    ],
                    error: null,
                  }),
                };
              },
            };
          }
          if (tabelle === 'activity_logs') {
            return {
              select() {
                return {
                  eq() {
                    return { order: async () => ({ data: [], error: null }) };
                  },
                };
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

  it.each([
    ['legacy_sold_unverified', 'demo-legacy'],
    ['legacy_sale_header_without_line', 'demo-header'],
    ['multiple_active_sales', 'demo-multiple'],
    ['sale_status_conflict', 'demo-conflict'],
  ] as const)(
    'klassifiziert beim kalten Demo-Detailaufruf %s aus Rohdaten und Verkäufen',
    async (expectedSaleState, itemId) => {
      const status = expectedSaleState === 'sale_status_conflict' ? 'ready' : 'sold';
      const rawItem: InventoryItem = { ...gespeicherterArtikel, id: itemId, status };
      const lineFor = (saleId: string): NonNullable<Sale['lines']>[number] => ({
        id: `line-${saleId}`,
        sale_id: saleId,
        inventory_item_id: itemId,
        title_snapshot: rawItem.title,
        quantity: 1,
        unit_sale_price: 20,
        line_total: 20,
        cost_of_goods_sold: 5,
        tax_mode: 'diff_25a',
      });
      let sales: Sale[] = [];
      if (expectedSaleState === 'legacy_sale_header_without_line') {
        sales = [
          {
            id: 'sale-header',
            workspace_id: workspace.id,
            inventory_item_id: itemId,
            platform: 'direct',
            sale_price: 20,
            sale_date: '2026-08-29',
            platform_fee: 0,
            shipping_cost: 0,
            packaging_cost: 0,
            other_costs: 0,
            lines: [],
          },
        ];
      } else if (
        expectedSaleState === 'multiple_active_sales' ||
        expectedSaleState === 'sale_status_conflict'
      ) {
        const saleIds =
          expectedSaleState === 'multiple_active_sales' ? ['sale-one', 'sale-two'] : ['sale-one'];
        sales = saleIds.map((saleId) => ({
          id: saleId,
          workspace_id: workspace.id,
          inventory_item_id: null,
          platform: 'direct',
          sale_price: 20,
          sale_date: '2026-08-29',
          platform_fee: 0,
          shipping_cost: 0,
          packaging_cost: 0,
          other_costs: 0,
          lines: [lineFor(saleId)],
        }));
      }
      const demoStore = {
        isDemoMode: signal(true),
        getItems: () => [rawItem],
        getSales: () => sales,
        getItemCosts: () => [],
        getActivityLogs: () => [],
      } as unknown as MockDataStoreService;
      const { dienst } = injiziereDienst({}, demoStore);

      const detail = await dienst.getItemById(itemId);

      expect(detail?.sale_state).toBe(expectedSaleState);
      expect(dienst.selectedItem()?.sale_state).toBe(expectedSaleState);
    },
  );

  it('bevorzugt beim Demo-Detailaufruf einen bereits sicher klassifizierten Signal-Eintrag', async () => {
    const rawItem: InventoryItem = {
      ...gespeicherterArtikel,
      id: 'demo-signal',
      status: 'sold',
    };
    const classifiedItem: InventoryItem = {
      ...rawItem,
      sale_state: 'multiple_active_sales',
      active_sale_count: 2,
      active_sale_id: null,
    };
    const demoStore = {
      isDemoMode: signal(true),
      getItems: () => [rawItem],
      getSales: () => [],
      getItemCosts: () => [],
      getActivityLogs: () => [],
    } as unknown as MockDataStoreService;
    const { dienst } = injiziereDienst({}, demoStore);
    dienst.items.set([classifiedItem]);

    const detail = await dienst.getItemById(rawItem.id);

    expect(detail).toMatchObject({
      sale_state: 'multiple_active_sales',
      active_sale_count: 2,
      active_sale_id: null,
    });
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
