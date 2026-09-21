import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { InventoryItem, Purchase, PurchaseLine, Workspace } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { PurchaseService, toExactCents } from './purchase.service';
import { SyncStatusService } from './sync-status.service';

describe('PurchaseService', () => {
  describe('Persistenz', () => {
    const einkauf: Purchase = {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: '11111111-1111-4111-8111-111111111111',
      type: 'mystery_pack',
      title: 'Mystery Box',
      purchase_date: '2026-08-24',
      purchase_price: 31.98,
      shipping_cost: 0,
      source_id: null,
      supplier_id: null,
      cost_allocation_mode: 'even',
      created_at: '2026-08-24T10:00:00.000Z',
    };

    describe('PurchaseService – fehlgeschlagenes Löschen', () => {
      it('entfernt den Einkauf erst nach bestätigtem Löschen aus der Datenbank', async () => {
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const artikelEntfernen = vi.fn();
        const service = Object.create(PurchaseService.prototype) as PurchaseService;

        Object.assign(service, {
          purchasesRaw,
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          inventory: { entferneArtikelZuEinkauf: artikelEntfernen },
          syncStatus: new SyncStatusService(),
          supabase: {
            client: {
              from: () => ({
                delete: () => ({
                  eq: async () => ({ error: { code: '42501', message: 'denied' } }),
                }),
              }),
            },
          },
        });

        const ergebnis = await service.deletePurchase(einkauf.id);

        expect(ergebnis.error).toBeInstanceOf(Error);
        expect(purchasesRaw()).toEqual([einkauf]);
        expect(selectedPurchaseRaw()).toEqual(einkauf);
        expect(artikelEntfernen).not.toHaveBeenCalled();
      });
    });

    describe('PurchaseService – fehlgeschlagenes Bearbeiten', () => {
      it('behält das Signal bei einem Datenbankfehler unverändert', async () => {
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const service = Object.create(PurchaseService.prototype) as PurchaseService;
        Object.assign(service, {
          purchasesRaw,
          selectedPurchaseRaw,
          sourcesService: { sources: signal([]) },
          suppliersService: { suppliers: signal([]) },
          syncStatus: new SyncStatusService(),
          supabase: {
            client: {
              from: () => ({
                update: () => ({
                  eq: async () => ({ error: { code: '42501', message: 'denied' } }),
                }),
              }),
            },
          },
        });

        const ergebnis = await service.updatePurchase(einkauf.id, { title: 'Geändert' });

        expect(ergebnis.error).toBeInstanceOf(Error);
        expect(purchasesRaw()).toEqual([einkauf]);
        expect(selectedPurchaseRaw()).toEqual(einkauf);
      });
    });

    describe('PurchaseService – bestätigte Tracking- und Verteiländerungen', () => {
      it('ändert das Tracking im lokalen Bestand erst nach erfolgreichem Datenbank-Update', async () => {
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const service = Object.create(PurchaseService.prototype) as PurchaseService;

        const rpc = vi.fn(async () => ({
          data: null,
          error: { code: '42501', message: 'denied' },
        }));
        Object.assign(service, {
          purchasesRaw,
          purchases: () => purchasesRaw(),
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          syncStatus: new SyncStatusService(),
          supabase: {
            client: { rpc },
          },
        });

        const ergebnis = await service.updatePurchaseTracking(einkauf.id, 'TRACK-NEU', 'dhl');

        expect(ergebnis.error).toBeInstanceOf(Error);
        expect(purchasesRaw()).toEqual([einkauf]);
        expect(selectedPurchaseRaw()).toEqual(einkauf);
        expect(rpc).toHaveBeenCalledWith('update_purchase_tracking', {
          p_purchase_id: einkauf.id,
          p_tracking_number: 'TRACK-NEU',
          p_tracking_carrier: 'dhl',
          p_tracking_status: 'pending',
        });
      });

      it('übernimmt einen Workflowstatus ausschließlich aus der bestätigten RPC-Antwort', async () => {
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const updated = { ...einkauf, receiving_status: 'ordered' as const };
        const rpc = vi.fn(async () => ({
          data: { purchase: updated, eventId: 'event-1' },
          error: null,
        }));
        const service = Object.create(PurchaseService.prototype) as PurchaseService;
        Object.assign(service, {
          purchasesRaw,
          purchases: () => purchasesRaw(),
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          syncStatus: new SyncStatusService(),
          supabase: { client: { rpc } },
        });

        const result = await service.setPurchaseWorkflowStatus(einkauf.id, 'ordered');

        expect(result.error).toBeNull();
        expect(rpc).toHaveBeenCalledWith('update_purchase_workflow', {
          p_purchase_id: einkauf.id,
          p_status: 'ordered',
        });
        expect(purchasesRaw()).toEqual([updated]);
        expect(selectedPurchaseRaw()).toEqual(updated);
      });

      it('behält angereicherte Einkaufsdaten bei einer teilweisen Workflow-Antwort', async () => {
        const enrichedPurchase: Purchase = {
          ...einkauf,
          supplier: {
            id: 'supplier-1',
            workspace_id: einkauf.workspace_id,
            name: 'Verkäufer GmbH',
          },
          costs: [{ id: 'cost-1', purchase_id: einkauf.id, type: 'shipping', amount: 4.5 }],
          purchase_lines: [
            {
              id: 'line-1',
              workspace_id: einkauf.workspace_id,
              purchase_id: einkauf.id,
              title_snapshot: 'Controller',
              line_kind: 'quantity',
              ordered_quantity: 1,
              received_quantity: 0,
              unit_purchase_price: 31.98,
              line_total: 31.98,
            },
          ],
          items_count: 1,
          total_purchase_cost: 36.48,
        };
        const purchasesRaw = signal<Purchase[]>([enrichedPurchase]);
        const selectedPurchaseRaw = signal<Purchase | null>(enrichedPurchase);
        const partialPurchase = {
          id: einkauf.id,
          receiving_status: 'ordered' as const,
          shipment_status: 'not_shipped' as const,
          updated_at: '2026-09-10T10:00:00.000Z',
        };
        const rpc = vi.fn(async () => ({
          data: { purchase: partialPurchase, eventId: 'event-1' },
          error: null,
        }));
        const service = Object.create(PurchaseService.prototype) as PurchaseService;
        Object.assign(service, {
          purchasesRaw,
          purchases: () => purchasesRaw(),
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          syncStatus: new SyncStatusService(),
          supabase: { client: { rpc } },
        });

        await service.setPurchaseWorkflowStatus(einkauf.id, 'ordered');

        expect(purchasesRaw()[0]).toMatchObject({ ...enrichedPurchase, ...partialPurchase });
        expect(selectedPurchaseRaw()).toMatchObject({ ...enrichedPurchase, ...partialPurchase });
      });

      it('behält angereicherte Einkaufsdaten bei einer teilweisen Tracking-Antwort', async () => {
        const enrichedPurchase: Purchase = {
          ...einkauf,
          supplier: {
            id: 'supplier-1',
            workspace_id: einkauf.workspace_id,
            name: 'Verkäufer GmbH',
          },
          costs: [{ id: 'cost-1', purchase_id: einkauf.id, type: 'shipping', amount: 4.5 }],
          purchase_lines: [
            {
              id: 'line-1',
              workspace_id: einkauf.workspace_id,
              purchase_id: einkauf.id,
              title_snapshot: 'Controller',
              line_kind: 'quantity',
              ordered_quantity: 1,
              received_quantity: 0,
              unit_purchase_price: 31.98,
              line_total: 31.98,
            },
          ],
          items_count: 1,
          total_purchase_cost: 36.48,
        };
        const purchasesRaw = signal<Purchase[]>([enrichedPurchase]);
        const selectedPurchaseRaw = signal<Purchase | null>(enrichedPurchase);
        const partialPurchase = {
          id: einkauf.id,
          tracking_number: 'TRACK-NEU',
          tracking_carrier: 'dhl' as const,
          tracking_status: 'in_transit' as const,
          updated_at: '2026-09-10T10:00:00.000Z',
        };
        const rpc = vi.fn(async () => ({
          data: { purchase: partialPurchase, eventId: 'event-1' },
          error: null,
        }));
        const service = Object.create(PurchaseService.prototype) as PurchaseService;
        Object.assign(service, {
          purchasesRaw,
          purchases: () => purchasesRaw(),
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          syncStatus: new SyncStatusService(),
          supabase: { client: { rpc } },
        });

        await service.updatePurchaseTracking(einkauf.id, 'TRACK-NEU', 'dhl', 'in_transit');

        expect(purchasesRaw()[0]).toMatchObject({ ...enrichedPurchase, ...partialPurchase });
        expect(selectedPurchaseRaw()).toMatchObject({ ...enrichedPurchase, ...partialPurchase });
      });

      it('bricht das Zustellen nach einem Workflow-Fehler vor den Artikeln ab', async () => {
        const workflowError = new Error('Status fehlgeschlagen');
        const artikel: InventoryItem = {
          id: 'item-1',
          workspace_id: einkauf.workspace_id,
          purchase_id: einkauf.id,
          sku: 'SKU-1',
          title: 'Konsole',
          condition: 'used',
          status: 'needs_review',
          allocated_purchase_cost: 31.98,
          created_at: '2026-08-24T10:00:00.000Z',
        };
        const updateItemStatus = vi.fn(async () => ({ error: null }));
        const service = Object.create(PurchaseService.prototype) as PurchaseService;

        Object.assign(service, {
          purchases: signal<Purchase[]>([einkauf]),
          setPurchaseWorkflowStatus: vi.fn(async () => ({ error: workflowError })),
          inventory: {
            items: signal<InventoryItem[]>([artikel]),
            updateItemStatus,
          },
        });

        const ergebnis = await service.markPurchaseDeliveredAndSyncItems(einkauf.id);

        expect(ergebnis).toEqual({ updatedCount: 0, error: workflowError });
        expect(updateItemStatus).not.toHaveBeenCalled();
      });

      it('ändert die Verteilmethode lokal erst nach erfolgreichem Datenbank-Update', async () => {
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const service = Object.create(PurchaseService.prototype) as PurchaseService;

        Object.assign(service, {
          purchasesRaw,
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          syncStatus: new SyncStatusService(),
          supabase: {
            client: {
              from: () => ({
                update: () => ({
                  eq: async () => ({ error: { code: '42501', message: 'denied' } }),
                }),
              }),
            },
          },
        });

        const ergebnis = await service.updateCostAllocationMode(einkauf.id, 'value_weighted');

        expect(ergebnis.error).toBeInstanceOf(Error);
        expect(purchasesRaw()).toEqual([einkauf]);
        expect(selectedPurchaseRaw()).toEqual(einkauf);
      });

      it('bricht die Kostenverteilung bei einem Modusfehler vor allen lokalen Artikeländerungen ab', async () => {
        const artikel: InventoryItem = {
          id: 'item-1',
          workspace_id: einkauf.workspace_id,
          purchase_id: einkauf.id,
          title: 'Konsole',
          condition: 'used',
          status: 'received',
          sku: 'SKU-1',
          allocated_purchase_cost: 31.98,
          expected_value: 60,
          created_at: einkauf.created_at,
        };
        const purchasesRaw = signal<Purchase[]>([einkauf]);
        const selectedPurchaseRaw = signal<Purchase | null>(einkauf);
        const artikelLokalUebernehmen = vi.fn();
        const tabellen: string[] = [];
        const service = Object.create(PurchaseService.prototype) as PurchaseService;
        Object.assign(service, {
          purchasesRaw,
          selectedPurchaseRaw,
          selectedPurchase: () => selectedPurchaseRaw(),
          purchaseItems: () => [artikel],
          profitEngine: { allocateCosts: () => [31.98] },
          inventory: { uebernehmeArtikelAenderungen: artikelLokalUebernehmen },
          syncStatus: new SyncStatusService(),
          supabase: {
            client: {
              from: (tabelle: string) => {
                tabellen.push(tabelle);
                return {
                  update: () => ({
                    eq: async () => ({ error: { code: '42501', message: 'denied' } }),
                  }),
                };
              },
            },
          },
        });

        const ergebnis = await service.redistributeCosts(einkauf.id, 'value_weighted');

        expect(ergebnis.error).toBeInstanceOf(Error);
        expect(tabellen).toEqual(['purchases']);
        expect(artikelLokalUebernehmen).not.toHaveBeenCalled();
        expect(purchasesRaw()).toEqual([einkauf]);
        expect(selectedPurchaseRaw()).toEqual(einkauf);
      });
    });
  });

  describe('Anlegen', () => {
    const workspace: Workspace = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test',
      currency: 'EUR',
      min_roi_percent: 30,
      min_profit_amount: 15,
      created_at: '2026-08-24T10:00:00.000Z',
    };

    const gespeicherterEinkauf: Purchase = {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: workspace.id,
      type: 'single',
      title: 'Konsole',
      purchase_date: '2026-08-24',
      purchase_price: 80,
      shipping_cost: 0,
      source_id: null,
      supplier_id: null,
      cost_allocation_mode: 'even',
      created_at: '2026-08-24T10:01:00.000Z',
    };

    const gespeicherterArtikel: InventoryItem = {
      id: '22222222-2222-4222-8222-222222222222',
      workspace_id: workspace.id,
      purchase_id: gespeicherterEinkauf.id,
      title: 'Konsole',
      condition: 'used',
      status: 'received',
      sku: null,
      category: null,
      brand: null,
      model: null,
      ean: null,
      description: null,
      allocated_purchase_cost: 80,
      expected_value: 120,
      created_at: '2026-08-24T10:02:00.000Z',
    };

    function erstelleDienste(client: unknown) {
      const syncStatus = new SyncStatusService();
      const inventory = Object.create(InventoryService.prototype) as InventoryService;
      Object.assign(inventory, {
        supabase: { client },
        syncStatus,
        workspaceService: { currentWorkspace: signal(workspace) },
        items: signal<InventoryItem[]>([]),
        selectedItem: signal<InventoryItem | null>(null),
        itemCosts: signal([]),
        activityLogs: signal([]),
        istGeladen: signal(true),
      });

      const purchase = Object.create(PurchaseService.prototype) as PurchaseService;
      Object.assign(purchase, {
        supabase: { client },
        syncStatus,
        workspaceService: { currentWorkspace: signal(workspace) },
        purchasesRaw: signal<Purchase[]>([]),
        selectedPurchaseRaw: signal<Purchase | null>(null),
        selectedPurchase: () => null,
        sourcesService: { sources: signal([]) },
        suppliersService: { suppliers: signal([]) },
        inventory,
        webhookService: { sendPurchaseNotification: vi.fn() },
      });

      return { purchase, inventory, syncStatus };
    }

    describe('PurchaseService – abhängige Schreibvorgänge beim Anlegen', () => {
      it('legt Einkauf, Zusatzkosten und Positionen produktiv in genau einer RPC an', async () => {
        const rpc = vi.fn(async () => ({
          data: {
            purchase: gespeicherterEinkauf,
            purchase_costs: [
              {
                id: 'cost-1',
                purchase_id: gespeicherterEinkauf.id,
                type: 'shipping',
                amount: 0.05,
                description: 'Versand',
              },
            ],
            purchase_lines: [
              {
                id: 'line-1',
                workspace_id: workspace.id,
                purchase_id: gespeicherterEinkauf.id,
                catalog_product_id: 'catalog-1',
                title_snapshot: 'LED-Lampe',
                line_kind: 'quantity',
                ordered_quantity: 3,
                received_quantity: 0,
                unit_purchase_price: 4.99,
                line_total: 14.97,
                allocated_additional_cost: 0.05,
              },
            ],
          },
          error: null,
        }));
        const { purchase } = erstelleDienste({ rpc });

        const ergebnis = await purchase.createPurchase({
          type: 'lot',
          title: 'LED-Lampen',
          purchase_date: '2026-08-29',
          purchase_price: 14.97,
          cost_allocation_mode: 'even',
          initial_costs: [{ type: 'shipping', amount: 0.05, description: 'Versand' }],
          purchase_lines: [
            {
              catalogProductId: 'catalog-1',
              titleSnapshot: 'LED-Lampe',
              lineKind: 'quantity',
              orderedQuantity: 3,
              unitPurchasePrice: 4.99,
              lineTotal: 14.97,
            },
          ],
        });

        expect(ergebnis).toMatchObject({
          status: 'success',
          data: { id: gespeicherterEinkauf.id },
        });
        expect(rpc).toHaveBeenCalledOnce();
        expect(rpc).toHaveBeenCalledWith('create_purchase', {
          p_workspace_id: workspace.id,
          p_purchase: expect.objectContaining({
            title: 'LED-Lampen',
            purchase_price: 14.97,
            cost_allocation_mode: 'even',
          }),
          p_expenses: [
            expect.objectContaining({ type: 'shipping', amount: 0.05, description: 'Versand' }),
          ],
          p_lines: [
            expect.objectContaining({
              catalog_product_id: 'catalog-1',
              ordered_quantity: 3,
              line_total: 14.97,
            }),
          ],
        });
      });

      it('übergibt initiale Mengenpositionen erst mit der bestätigten Datenbank-ID', async () => {
        const aufrufe: { tabelle: string; payload: unknown }[] = [];
        const finalerEinkauf = {
          ...gespeicherterEinkauf,
          id: '44444444-4444-4444-8444-444444444444',
        };
        const client = {
          rpc: async (_name: string, payload: unknown) => {
            aufrufe.push({ tabelle: 'create_purchase', payload });
            return {
              data: {
                purchase: finalerEinkauf,
                purchase_costs: [],
                purchase_lines: [
                  {
                    id: 'line-1',
                    workspace_id: workspace.id,
                    purchase_id: finalerEinkauf.id,
                    catalog_product_id: 'catalog-1',
                    title_snapshot: 'LED-Lampe',
                    line_kind: 'quantity',
                    ordered_quantity: 5,
                    received_quantity: 0,
                    unit_purchase_price: 4.99,
                    line_total: 24.95,
                    allocated_additional_cost: 0,
                  },
                ],
              },
              error: null,
            };
          },
        };
        const { purchase } = erstelleDienste(client);

        const ergebnis = await purchase.createPurchase({
          type: 'lot',
          title: 'Nachkauf LED-Lampe Abnahme',
          purchase_date: '2026-08-28',
          purchase_price: 24.95,
          purchase_lines: [
            {
              catalogProductId: 'catalog-1',
              titleSnapshot: 'LED-Lampe',
              lineKind: 'quantity',
              orderedQuantity: 5,
              unitPurchasePrice: 4.99,
              lineTotal: 24.95,
            },
          ],
        });

        expect(ergebnis).toMatchObject({ status: 'success', data: { id: finalerEinkauf.id } });
        expect(aufrufe.map(({ tabelle }) => tabelle)).toEqual(['create_purchase']);
        expect(aufrufe[0].payload).toEqual(
          expect.objectContaining({
            p_workspace_id: workspace.id,
            p_lines: [
              expect.objectContaining({
                catalog_product_id: 'catalog-1',
                ordered_quantity: 5,
                unit_purchase_price: 4.99,
                line_total: 24.95,
              }),
            ],
          }),
        );
      });

      it('rollt bei einem Fehler der initialen Positionen den gesamten Einkauf zurück', async () => {
        const client = {
          rpc: async () => ({
            data: null,
            error: { code: '23503', message: 'catalog product missing' },
          }),
        };
        const { purchase } = erstelleDienste(client);

        const ergebnis = await purchase.createPurchase({
          type: 'lot',
          title: 'Nachkauf LED-Lampe Abnahme',
          purchase_date: '2026-08-28',
          purchase_price: 24.95,
          purchase_lines: [
            {
              catalogProductId: 'catalog-1',
              titleSnapshot: 'LED-Lampe',
              lineKind: 'quantity',
              orderedQuantity: 5,
              unitPurchasePrice: 4.99,
              lineTotal: 24.95,
            },
          ],
        });

        expect(ergebnis).toMatchObject({
          status: 'failed',
          data: null,
          error: expect.any(Error),
          problems: [],
        });
      });

      it('legt bei einem positionslosen Entwurf noch keinen Inventarartikel an', async () => {
        const aufrufe: { tabelle: string; payload: unknown }[] = [];
        const client = {
          rpc: async () => ({
            data: { purchase: gespeicherterEinkauf, purchase_costs: [], purchase_lines: [] },
            error: null,
          }),
          from(tabelle: string) {
            return {
              insert(payload: unknown) {
                aufrufe.push({ tabelle, payload });
                if (tabelle === 'inventory_items') {
                  return {
                    select: () => ({
                      single: async () => ({ data: gespeicherterArtikel, error: null }),
                    }),
                  };
                }
                if (tabelle === 'activity_logs') {
                  return Promise.resolve({
                    error: { code: '23503', message: 'inventory item missing' },
                  });
                }
                throw new Error(`Unerwartete Tabelle: ${tabelle}`);
              },
            };
          },
        };
        const { purchase, syncStatus } = erstelleDienste(client);

        const ergebnis = await purchase.createPurchase({
          type: 'single',
          title: 'Konsole',
          purchase_date: '2026-08-24',
          purchase_price: 80,
          single_item_title: 'Konsole',
          single_item_condition: 'used',
          single_item_expected_value: 120,
        });

        expect(ergebnis).toMatchObject({
          status: 'success',
          data: { id: gespeicherterEinkauf.id },
          error: null,
          problems: [],
        });
        expect(aufrufe).toEqual([]);
        expect(syncStatus.hatFehler()).toBe(false);
      });

      it('rollt bei fehlgeschlagenen Zusatzkosten den gesamten Einkauf zurück', async () => {
        const client = {
          rpc: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
        };
        const { purchase } = erstelleDienste(client);

        const ergebnis = await purchase.createPurchase({
          type: 'mystery_pack',
          title: 'Kiste',
          purchase_date: '2026-08-24',
          purchase_price: 80,
          initial_costs: [{ type: 'shipping', amount: 7, description: 'Versand' }],
        });

        expect(ergebnis).toMatchObject({
          status: 'failed',
          data: null,
          error: expect.any(Error),
          problems: [],
        });
      });
    });
  });

  describe('Laderennen', () => {
    interface Deferred<T> {
      readonly promise: Promise<T>;
      readonly resolve: (value: T) => void;
      readonly reject: (reason: unknown) => void;
    }

    function deferred<T>(): Deferred<T> {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    }

    const workspace: Workspace = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test',
      currency: 'EUR',
      min_roi_percent: 30,
      min_profit_amount: 15,
    };

    function purchase(id: string): Purchase & { costs: []; items: []; purchase_lines: [] } {
      return {
        id,
        workspace_id: workspace.id,
        type: 'lot',
        title: `Einkauf ${id}`,
        purchase_date: '2026-08-29',
        purchase_price: 4.99,
        cost_allocation_mode: 'even',
        receiving_status: 'ordered',
        costs: [],
        items: [],
        purchase_lines: [],
      };
    }

    function purchaseLine(purchaseId: string): PurchaseLine {
      return {
        id: `line-${purchaseId}`,
        workspace_id: workspace.id,
        purchase_id: purchaseId,
        catalog_product_id: null,
        title_snapshot: 'LED-Lampe',
        line_kind: 'quantity',
        ordered_quantity: 1,
        received_quantity: 0,
        unit_purchase_price: 4.99,
        line_total: 4.99,
      };
    }

    function erstelleDienst() {
      interface QueryResult<T> {
        data: T;
        error: null;
      }
      const purchaseRequests = new Map<
        string,
        Deferred<QueryResult<ReturnType<typeof purchase>>>
      >();
      const lineRequests = new Map<string, Deferred<QueryResult<PurchaseLine[]>>>();
      const syncStatus = { melde: vi.fn((_context: string, error: unknown) => error) };

      const client = {
        from(table: string) {
          if (table === 'purchases') {
            let purchaseId = '';
            const query = {
              select: () => query,
              eq: (_column: string, value: string) => {
                purchaseId = value;
                return query;
              },
              single: () => {
                const request = deferred<QueryResult<ReturnType<typeof purchase>>>();
                purchaseRequests.set(purchaseId, request);
                return request.promise;
              },
            };
            return query;
          }

          if (table === 'purchase_lines') {
            let purchaseId = '';
            const query = {
              select: () => query,
              eq: (column: string, value: string) => {
                if (column === 'purchase_id') purchaseId = value;
                return query;
              },
              order: () => {
                const request = deferred<QueryResult<PurchaseLine[]>>();
                lineRequests.set(purchaseId, request);
                return request.promise;
              },
            };
            return query;
          }

          throw new Error(`Unerwartete Tabelle: ${table}`);
        },
      };

      const service = Object.create(PurchaseService.prototype) as PurchaseService;
      Object.assign(service, {
        supabase: {
          client: {
            ...client,
            rpc: vi.fn(async () => ({
              data: { state: 'none', review_inventory_item_id: null },
              error: null,
            })),
          },
        },
        workspaceService: { currentWorkspace: signal(workspace) },
        syncStatus,
        inventory: { items: signal<InventoryItem[]>([]), istGeladen: signal(false) },
        purchasesRaw: signal<Purchase[]>([]),
        selectedPurchaseRaw: signal<Purchase | null>(null),
        purchaseItemsFallback: signal<InventoryItem[]>([]),
        purchaseLinesRaw: signal<PurchaseLine[]>([]),
        detailLoadRequestId: 0,
        isLoading: signal(false),
        purchaseSaleHistoryState: signal('idle'),
        purchaseSaleReviewInventoryItemId: signal<string | null>(null),
        saleHistoryLoadRequestId: 0,
      });
      return { service, purchaseRequests, lineRequests, syncStatus };
    }

    describe('PurchaseService – konkurrierende Detailabfragen', () => {
      it('lässt einen alten Detailfehler weder den aktuellen Ladezustand löschen noch melden', async () => {
        const { service, purchaseRequests, lineRequests, syncStatus } = erstelleDienst();

        const oldLoad = service.getPurchaseById('old');
        const currentLoad = service.getPurchaseById('current');
        purchaseRequests.get('old')!.reject(new Error('veralteter Detailfehler'));

        await expect(oldLoad).resolves.toBeNull();
        expect(service.isLoading()).toBe(true);
        expect(syncStatus.melde).not.toHaveBeenCalled();

        purchaseRequests.get('current')!.resolve({ data: purchase('current'), error: null });
        await vi.waitFor(() => expect(lineRequests.has('current')).toBe(true));
        lineRequests.get('current')!.resolve({ data: [purchaseLine('current')], error: null });
        await expect(currentLoad).resolves.toMatchObject({ id: 'current' });
        expect(service.isLoading()).toBe(false);
      });

      it('ignoriert einen alten Positionsfehler während eine neuere Detailabfrage lädt', async () => {
        const { service, purchaseRequests, lineRequests, syncStatus } = erstelleDienst();

        const oldLoad = service.getPurchaseById('old');
        purchaseRequests.get('old')!.resolve({ data: purchase('old'), error: null });
        await vi.waitFor(() => expect(lineRequests.has('old')).toBe(true));

        const currentLoad = service.getPurchaseById('current');
        lineRequests.get('old')!.reject(new Error('veralteter Positionsfehler'));
        await expect(oldLoad).resolves.toBeNull();
        expect(service.isLoading()).toBe(true);
        expect(syncStatus.melde).not.toHaveBeenCalled();

        purchaseRequests.get('current')!.resolve({ data: purchase('current'), error: null });
        await vi.waitFor(() => expect(lineRequests.has('current')).toBe(true));
        lineRequests.get('current')!.resolve({ data: [purchaseLine('current')], error: null });
        await expect(currentLoad).resolves.toMatchObject({ id: 'current' });
        expect(service.isLoading()).toBe(false);
      });
    });
  });

  describe('Centbeträge', () => {
    describe('toExactCents', () => {
      it('akzeptiert übliche, binär nicht exakt darstellbare Centbeträge', () => {
        expect(toExactCents(0.07)).toBe(7);
        expect(toExactCents(0.29)).toBe(29);
        expect(toExactCents(0.58)).toBe(58);
      });

      it('lehnt Beträge ab, die nicht auf volle Cent fallen', () => {
        expect(toExactCents(0.001)).toBeNull();
        expect(toExactCents(1.999)).toBeNull();
        expect(toExactCents(0.2900000001)).toBeNull();
      });
    });
  });

  describe('Mengen', () => {
    const workspace: Workspace = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Test',
      currency: 'EUR',
      min_roi_percent: 30,
      min_profit_amount: 15,
      created_at: '2026-08-28T10:00:00.000Z',
    };

    const purchase: Purchase = {
      id: '33333333-3333-4333-8333-333333333333',
      workspace_id: workspace.id,
      type: 'lot',
      title: 'Nachkauf LED-Lampe',
      purchase_date: '2026-08-28',
      purchase_price: 24.95,
      cost_allocation_mode: 'even',
      receiving_status: 'received',
      created_at: '2026-08-28T10:00:00.000Z',
    };

    const line: PurchaseLine = {
      id: '44444444-4444-4444-8444-444444444444',
      workspace_id: workspace.id,
      purchase_id: purchase.id,
      catalog_product_id: '55555555-5555-4555-8555-555555555555',
      title_snapshot: 'LED-Lampe',
      line_kind: 'quantity',
      ordered_quantity: 5,
      received_quantity: 5,
      unit_purchase_price: 4.99,
      line_total: 24.95,
    };

    function erstelleDienst() {
      const purchasesRaw = signal<Purchase[]>([]);
      const selectedPurchaseRaw = signal<Purchase | null>(null);
      const purchaseLinesRaw = signal<PurchaseLine[]>([]);
      const listResult = {
        data: [{ ...purchase, items: [], purchase_lines: [line] }],
        error: null,
      };
      const detailResult = {
        data: { ...purchase, items: [], costs: [], purchase_lines: [line] },
        error: null,
      };
      const purchaseLinesResult = { data: [line], error: null };
      const purchaseSelects: string[] = [];

      const client = {
        from(table: string) {
          if (table === 'purchases') {
            let orderCount = 0;
            const query = {
              select: (columns: string) => {
                purchaseSelects.push(columns);
                return query;
              },
              eq: () => query,
              order: () => (++orderCount === 2 ? Promise.resolve(listResult) : query),
              single: async () => detailResult,
            };
            return query;
          }
          if (table === 'purchase_lines') {
            const query = {
              select: () => query,
              eq: () => query,
              order: async () => purchaseLinesResult,
            };
            return query;
          }
          throw new Error(`Unerwartete Tabelle: ${table}`);
        },
      };

      const service = Object.create(PurchaseService.prototype) as PurchaseService;
      Object.assign(service, {
        supabase: {
          client: {
            ...client,
            rpc: vi.fn(async () => ({
              data: { state: 'none', review_inventory_item_id: null },
              error: null,
            })),
          },
        },
        workspaceService: { currentWorkspace: signal(workspace) },
        syncStatus: { melde: vi.fn() },
        inventory: { items: signal<InventoryItem[]>([]), istGeladen: signal(false) },
        purchasesRaw,
        selectedPurchaseRaw,
        purchaseItemsFallback: signal<InventoryItem[]>([]),
        purchaseLinesRaw,
        isLoading: signal(false),
        loadError: signal<Error | null>(null),
        loadedWorkspaceId: signal<string | null>(null),
        loadRequestId: 0,
        detailLoadRequestId: 0,
        purchaseSaleHistoryState: signal('idle'),
        purchaseSaleReviewInventoryItemId: signal<string | null>(null),
        saleHistoryLoadRequestId: 0,
      });
      return { service, purchasesRaw, purchaseSelects };
    }

    describe('PurchaseService – fachliche Positionsanzahl', () => {
      it('zeigt eine vollständig eingebuchte Mengenposition in Übersicht und Detail weiterhin als fünf', async () => {
        const { service, purchasesRaw, purchaseSelects } = erstelleDienst();

        await service.loadPurchases(workspace.id);
        const detail = await service.getPurchaseById(purchase.id);

        expect(purchasesRaw()).toMatchObject([{ id: purchase.id, items_count: 5 }]);
        expect(detail).toMatchObject({ id: purchase.id, items_count: 5 });
        expect(purchaseSelects).toHaveLength(2);
        expect(
          purchaseSelects.every((columns) =>
            columns.includes('purchase_lines!purchase_lines_purchase_id_fkey(*)'),
          ),
        ).toBe(true);
      });
    });
  });

  describe('Zusatzkosten', () => {
    /**
     * Zusatzkosten und Sendungsangaben eines Einkaufs.
     *
     * Das Erfassungsformular fragt nach Versand, Fahrtkosten, Zoll und einer
     * Sendungsnummer. Beim Anlegen wurden die Kostenzeilen nur aufsummiert und nie
     * gespeichert - nach dem naechsten Laden rechnete die Liste die Summe aus dem
     * Einkaufspreis plus den (nicht vorhandenen) Kostenzeilen neu, und die
     * Zusatzkosten waren spurlos weg. Beim Bearbeiten kamen sie gar nicht erst im
     * Formular an.
     *
     * Diese Tests halten fest, dass jede Angabe des Formulars auch dort landet, wo
     * sie das naechste Laden ueberlebt.
     */
    describe('Zusatzkosten und Sendungsangaben', () => {
      function baue<T>(prototyp: object, felder: Record<string, unknown>): T {
        const dienst = Object.create(prototyp) as T;
        Object.assign(dienst as object, felder);
        return dienst;
      }

      interface Eintrag {
        tabelle: string;
        aktion: 'insert' | 'update' | 'delete' | 'rpc';
        werte: unknown;
      }

      /** Ein Supabase-Doppel, das mitschreibt, was tatsaechlich abgeschickt wird. */
      function datenbankDoppel() {
        const protokoll: Eintrag[] = [];
        const client = {
          rpc: (funktion: string, payload: Record<string, unknown>) => {
            protokoll.push({ tabelle: funktion, aktion: 'rpc', werte: payload });
            const purchase = payload['p_purchase'] as Record<string, unknown>;
            const expenses = (payload['p_expenses'] as Record<string, unknown>[]) ?? [];
            const purchaseId =
              funktion === 'update_purchase_draft' ? String(payload['p_purchase_id']) : 'db-neu';
            return Promise.resolve({
              data: {
                purchase: {
                  ...purchase,
                  id: purchaseId,
                  workspace_id: 'ws-1',
                  total_purchase_cost: purchase['purchase_price'],
                },
                purchase_lines: [],
                purchase_costs: expenses.map((expense, index) => ({
                  ...expense,
                  id: `db-kosten-${index + 1}`,
                  purchase_id: purchaseId,
                })),
              },
              error: null,
            });
          },
          from: (tabelle: string) => ({
            insert: (werte: unknown) => {
              protokoll.push({ tabelle, aktion: 'insert', werte });
              const antwort = Promise.resolve({ data: null, error: null });
              return Object.assign(antwort, {
                select: () => {
                  const zeilen = (Array.isArray(werte) ? werte : [werte]).map((wert, index) => ({
                    ...((wert ?? {}) as Record<string, unknown>),
                    id: `db-kosten-${index + 1}`,
                  }));
                  return Object.assign(Promise.resolve({ data: zeilen, error: null }), {
                    single: () => Promise.resolve({ data: { id: 'db-neu' }, error: null }),
                  });
                },
              });
            },
            update: (werte: unknown) => {
              protokoll.push({ tabelle, aktion: 'update', werte });
              return { eq: () => Promise.resolve({ error: null }) };
            },
            delete: () => {
              protokoll.push({ tabelle, aktion: 'delete', werte: null });
              return { eq: () => Promise.resolve({ error: null }) };
            },
          }),
        };
        return { protokoll, client };
      }

      function zeilen(protokoll: Eintrag[], tabelle: string, aktion: Eintrag['aktion']) {
        return protokoll.filter((e) => e.tabelle === tabelle && e.aktion === aktion);
      }

      const einkauf: Purchase = {
        id: 'p-1',
        workspace_id: 'ws-1',
        type: 'lot',
        title: 'Konvolut Werkzeug',
        purchase_date: '2026-08-10',
        purchase_price: 230,
        cost_allocation_mode: 'even',
      };

      function dienstMit(liste: Purchase[]) {
        const { protokoll, client } = datenbankDoppel();
        const purchasesRaw = signal<Purchase[]>(liste);
        const selectedPurchaseRaw = signal<Purchase | null>(liste[0] ?? null);
        return {
          protokoll,
          purchasesRaw,
          selectedPurchaseRaw,
          dienst: baue<PurchaseService>(PurchaseService.prototype, {
            purchasesRaw,
            selectedPurchaseRaw,
            selectedPurchase: selectedPurchaseRaw.asReadonly(),
            sourcesService: { sources: () => [] },
            suppliersService: { suppliers: () => [] },
            syncStatus: { melde: (_b: string, f: unknown) => new Error(String(f)) },
            supabase: { client },
          }),
        };
      }

      describe('Beim Bearbeiten', () => {
        it('ersetzt einen gespeicherten Entwurf sofort mit den bestätigten Kosten in der Liste', async () => {
          const existing: Purchase = {
            ...einkauf,
            record_number: '2026-123',
            supplier: { id: 'supplier-1', workspace_id: 'ws-1', name: 'Händler' },
            total_purchase_cost: 230,
          };
          const { dienst, purchasesRaw, selectedPurchaseRaw } = dienstMit([existing]);
          Object.assign(dienst, {
            workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
            persistPurchaseLineEans: vi.fn(async () => null),
            purchaseLinesRaw: signal<PurchaseLine[]>([]),
          });

          const result = await dienst.updatePurchaseDraft(existing.id, {
            type: 'lot',
            title: '',
            purchase_date: '2026-08-10',
            purchase_price: 250,
            notes: null,
            purchase_lines: [],
          });

          expect(result.error).toBeNull();
          expect(purchasesRaw()[0]).toMatchObject({
            id: existing.id,
            record_number: '2026-123',
            total_purchase_cost: 250,
          });
          expect(selectedPurchaseRaw()?.total_purchase_cost).toBe(250);
        });

        it('haengt eine neu gebuchte Kostenposition an die bestehende Liste an', async () => {
          // Der Detaildialog zeigt seine Zeilen aus `selectedPurchase.costs`.
          // Nur die Gesamtsumme zu aktualisieren laesst dort weiterhin allein
          // den alten Eintrag stehen und wirkt wie ein Ueberschreiben.
          const mitVersand: Purchase = {
            ...einkauf,
            total_purchase_cost: 242.9,
            costs: [
              {
                id: 'kosten-alt',
                purchase_id: 'p-1',
                type: 'shipping',
                amount: 12.9,
                description: 'DHL Paket',
                tax_treatment: null,
              },
            ],
          };
          const { dienst, selectedPurchaseRaw } = dienstMit([mitVersand]);

          await dienst.addPurchaseCost('p-1', 'travel', 7.1, 'Abholung', 'expense');

          expect(selectedPurchaseRaw()?.costs).toEqual([
            mitVersand.costs?.[0],
            {
              id: 'db-neu',
              workspace_id: 'ws-1',
              purchase_id: 'p-1',
              type: 'travel',
              amount: 7.1,
              description: 'Abholung',
              tax_treatment: 'expense',
            },
          ]);
          expect(selectedPurchaseRaw()?.total_purchase_cost).toBe(250);
        });

        it('schreibt eine nachgetragene Kostenzeile in die Datenbank', async () => {
          // Der gemeldete Fall: Kosten im Bearbeiten-Dialog eintragen, speichern,
          // und nichts passiert.
          const { dienst, protokoll } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', [
            { type: 'shipping', amount: 12.9, description: 'DHL Paket' },
          ]);

          const eingefuegt = zeilen(protokoll, 'purchase_costs', 'insert');
          expect(eingefuegt).toHaveLength(1);
          expect(eingefuegt[0].werte).toEqual([
            {
              workspace_id: 'ws-1',
              purchase_id: 'p-1',
              type: 'shipping',
              amount: 12.9,
              description: 'DHL Paket',
              tax_treatment: null,
            },
          ]);
        });

        it('raeumt die alten Zeilen weg, statt sie zu verdoppeln', async () => {
          // Der Dialog schickt immer die vollstaendige Liste. Ohne Aufraeumen
          // stuende nach dem zweiten Speichern jede Position doppelt da.
          const { dienst, protokoll } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', [
            { type: 'travel', amount: 8, description: null },
          ]);

          expect(zeilen(protokoll, 'purchase_costs', 'delete')).toHaveLength(1);
        });

        it('loescht auch dann, wenn die letzte Kostenzeile entfernt wurde', async () => {
          const { dienst, protokoll } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', []);

          expect(zeilen(protokoll, 'purchase_costs', 'delete')).toHaveLength(1);
          expect(zeilen(protokoll, 'purchase_costs', 'insert')).toHaveLength(0);
        });

        it('zieht die Gesamtkosten der Anzeige sofort nach', async () => {
          // Sonst zeigt die Kachel bis zum naechsten Laden den alten Betrag.
          const { dienst, purchasesRaw } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', [
            { type: 'shipping', amount: 12.9, description: null },
            { type: 'travel', amount: 7.1, description: null },
          ]);

          expect(purchasesRaw()[0].total_purchase_cost).toBe(250);
        });

        it('haengt die neuen Kostenzeilen an den geoeffneten Einkauf', async () => {
          const { dienst, selectedPurchaseRaw } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', [
            { type: 'customs', amount: 19, description: 'Zoll' },
          ]);

          expect(selectedPurchaseRaw()?.costs).toHaveLength(1);
          expect(selectedPurchaseRaw()?.costs?.[0].amount).toBe(19);
        });

        it('uebernimmt die Datenbank-IDs der ersetzten Kostenzeilen', async () => {
          // Ohne ID blendet die Detailansicht den Loeschbutton fuer diese Zeile
          // aus, obwohl die Zeile bereits in der Datenbank gespeichert ist.
          const { dienst, selectedPurchaseRaw } = dienstMit([einkauf]);

          await dienst.ersetzeZusatzkosten('p-1', [
            { type: 'shipping', amount: 12.9, description: 'DHL' },
            { type: 'packaging', amount: 3.5, description: 'Karton' },
          ]);

          expect(selectedPurchaseRaw()?.costs?.map((kosten) => kosten.id)).toEqual([
            'db-kosten-1',
            'db-kosten-2',
          ]);
        });

        it('speichert eine nachgetragene Sendungsnummer', async () => {
          // Das Feld stand im Bearbeiten-Dialog, wurde aber nie mitgeschickt.
          const { dienst, protokoll } = dienstMit([einkauf]);

          await dienst.updatePurchase('p-1', {
            tracking_number: '00340434161094042557',
            tracking_carrier: 'dhl',
          });

          const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<
            string,
            unknown
          >;
          expect(werte['tracking_number']).toBe('00340434161094042557');
          expect(werte['tracking_carrier']).toBe('dhl');
        });

        it('setzt eine nachgetragene Sendung auf unterwegs', async () => {
          // Ohne das bliebe sie auf 'pending' stehen - und die Zustellmeldung, die
          // die Artikel auf 'eingetroffen' setzt, haette nie einen Anlass.
          const { dienst, protokoll } = dienstMit([einkauf]);

          await dienst.updatePurchase('p-1', { tracking_number: '00340434161094042557' });

          const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<
            string,
            unknown
          >;
          expect(werte['tracking_status']).toBe('in_transit');
        });

        it('setzt eine geloeschte Sendungsnummer wieder zurueck', async () => {
          const mitSendung: Purchase = {
            ...einkauf,
            tracking_number: '123',
            tracking_status: 'in_transit',
          };
          const { dienst, protokoll } = dienstMit([mitSendung]);

          await dienst.updatePurchase('p-1', { tracking_number: null });

          const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<
            string,
            unknown
          >;
          expect(werte['tracking_status']).toBe('pending');
          expect(werte['tracking_carrier']).toBe(null);
        });

        it('ruehrt den Sendungsstatus nicht an, wenn die Nummer gar nicht im Spiel war', async () => {
          // Eine Preiskorrektur darf eine laufende Sendung nicht zuruecksetzen.
          const unterwegs: Purchase = {
            ...einkauf,
            tracking_number: '123',
            tracking_status: 'out_for_delivery',
          };
          const { dienst, protokoll } = dienstMit([unterwegs]);

          await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

          const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<
            string,
            unknown
          >;
          expect(werte['tracking_status']).toBeUndefined();
        });

        it('loescht die vorhandene Sendungsnummer nicht bei einer Preiskorrektur', async () => {
          // Der Schreibbefehl laesst weg, was `undefined` ist. Ein leeres Feld
          // gegen `null` zu tauschen haette hier die laufende Sendung geloescht.
          const unterwegs: Purchase = {
            ...einkauf,
            tracking_number: '123',
            tracking_carrier: 'dhl',
          };
          const { dienst, protokoll } = dienstMit([unterwegs]);

          await dienst.updatePurchase('p-1', { purchase_price: 249.9 });

          const werte = zeilen(protokoll, 'purchases', 'update')[0].werte as Record<
            string,
            unknown
          >;
          expect(werte['tracking_number']).toBeUndefined();
          expect(werte['tracking_carrier']).toBeUndefined();
        });
      });

      describe('Beim Anlegen', () => {
        /** Ein Dienst mit allem, was `createPurchase` anfasst. */
        function anlegeDienst() {
          const { protokoll, client } = datenbankDoppel();
          const purchasesRaw = signal<Purchase[]>([]);
          const selectedPurchaseRaw = signal<Purchase | null>(null);
          return {
            protokoll,
            purchasesRaw,
            dienst: baue<PurchaseService>(PurchaseService.prototype, {
              purchasesRaw,
              selectedPurchaseRaw,
              selectedPurchase: selectedPurchaseRaw.asReadonly(),
              workspaceService: { currentWorkspace: () => ({ id: 'ws-1' }) },
              sourcesService: { sources: () => [] },
              suppliersService: { suppliers: () => [] },
              syncStatus: { melde: (_b: string, f: unknown) => new Error(String(f)) },
              webhookService: { sendPurchaseNotification: () => undefined },
              inventory: { createItem: () => Promise.resolve({ data: null, error: null }) },
              supabase: { client },
            }),
          };
        }

        it('übergibt die erfassten Zusatzkosten an die atomare Einkaufstransaktion', async () => {
          // Bis hierhin wurden sie nur zur Gesamtsumme addiert. Weil die Liste
          // beim Laden aus Preis plus Kostenzeilen neu rechnet, war der Betrag
          // nach dem naechsten Aufruf wieder verschwunden.
          const { dienst, protokoll } = anlegeDienst();

          await dienst.createPurchase({
            type: 'lot',
            title: 'Konvolut Werkzeug',
            purchase_date: '2026-08-21',
            purchase_price: 230,
            initial_costs: [
              { type: 'shipping', amount: 12.9, description: 'DHL' },
              { type: 'travel', amount: 7.1 },
            ],
          });

          const aufruf = zeilen(protokoll, 'create_purchase', 'rpc');
          expect(aufruf).toHaveLength(1);
          expect((aufruf[0].werte as { p_expenses: unknown[] }).p_expenses).toEqual([
            expect.objectContaining({ type: 'shipping', amount: 12.9, description: 'DHL' }),
            expect.objectContaining({ type: 'travel', amount: 7.1, description: null }),
          ]);
        });

        it.each(['purchase_price', 'expense', null] as const)(
          'überträgt die bewusste Zusatzkostenherkunft %s ohne Ableitung aus Versand',
          async (taxTreatment) => {
            const { dienst, protokoll } = anlegeDienst();
            await dienst.createPurchase({
              type: 'lot',
              title: 'Werkzeug',
              purchase_date: '2026-09-13',
              purchase_price: 100,
              initial_costs: [{ type: 'shipping', amount: 5, taxTreatment }],
            });
            const call = zeilen(protokoll, 'create_purchase', 'rpc')[0].werte as {
              p_expenses: unknown[];
            };
            expect(call.p_expenses).toEqual([
              expect.objectContaining({ tax_treatment: taxTreatment }),
            ]);
          },
        );

        it('übernimmt die Kostenzeilen mit der endgültigen Einkaufskennung', async () => {
          // Der Einkauf laeuft bis zur Antwort der Datenbank unter einer
          // Behelfskennung. Wuerden die Kosten daran haengen, zeigte der
          // Fremdschluessel ins Leere.
          const { dienst } = anlegeDienst();

          const ergebnis = await dienst.createPurchase({
            type: 'lot',
            title: 'Konvolut',
            purchase_date: '2026-08-21',
            purchase_price: 100,
            initial_costs: [{ type: 'shipping', amount: 5 }],
          });

          expect(ergebnis.data?.costs?.[0].purchase_id).toBe('db-neu');
        });

        it('schreibt keine Kostenzeile ohne Betrag', async () => {
          const { dienst, protokoll } = anlegeDienst();

          await dienst.createPurchase({
            type: 'lot',
            title: 'Konvolut',
            purchase_date: '2026-08-21',
            purchase_price: 100,
            initial_costs: [{ type: 'shipping', amount: 0 }],
          });

          const aufruf = zeilen(protokoll, 'create_purchase', 'rpc');
          expect((aufruf[0].werte as { p_expenses: unknown[] }).p_expenses).toEqual([]);
        });
      });
    });
  });
});
