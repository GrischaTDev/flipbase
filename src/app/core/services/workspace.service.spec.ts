import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceService } from './workspace.service';
import { InventoryItem, Purchase, Sale, Workspace } from '../models/flipbase.models';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';

describe('Multi-Workspace & Holding Consolidation Service', () => {
  describe('Archiv-Lebenszyklus', () => {
    function setup(rpc: ReturnType<typeof vi.fn>) {
      const injector = Injector.create({
        providers: [
          { provide: SupabaseService, useValue: { client: { rpc } } },
          {
            provide: AuthService,
            useValue: { isAuthenticated: () => true },
          },
        ],
      });
      const workspaceService = runInInjectionContext(injector, () => new WorkspaceService());
      const first: Workspace = { id: 'a', name: 'A', min_roi_percent: 0, min_profit_amount: 0 };
      const second: Workspace = { ...first, id: 'b', name: 'B' };
      workspaceService.workspaces.set([first, second]);
      workspaceService.currentWorkspace.set(first);
      return { workspaceService, first, second };
    }

    it('wartet auf Serverbestätigung und verändert bei spätem Ergebnis nicht den gewählten Workspace', async () => {
      let resolve!: (value: unknown) => void;
      const rpc = vi.fn(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const { workspaceService, first, second } = setup(rpc);
      const pending = workspaceService.archiveWorkspace('a');
      expect(workspaceService.currentWorkspace()?.archived_at).toBeUndefined();
      workspaceService.setCurrentWorkspace(second);
      resolve({ data: { ...first, archived_at: '2026-09-04T12:00:00Z' }, error: null });
      expect((await pending).error).toBeNull();
      expect(workspaceService.currentWorkspace()?.id).toBe('b');
      expect(workspaceService.workspaces()[0].archived_at).toBe('2026-09-04T12:00:00Z');
      expect(rpc).toHaveBeenCalledWith('archive_workspace', { p_workspace_id: 'a' });
    });

    it('behält den Archivstatus bei einer abgelehnten Wiederherstellung', async () => {
      const { workspaceService, first } = setup(
        vi.fn().mockResolvedValue({ data: null, error: { message: 'Keine Berechtigung' } }),
      );
      workspaceService.currentWorkspace.set({ ...first, archived_at: '2026-09-04T12:00:00Z' });
      expect((await workspaceService.restoreWorkspace('a')).error?.message).toContain(
        'Keine Berechtigung',
      );
      expect(workspaceService.currentWorkspace()?.archived_at).toBeTruthy();
    });

    it('übernimmt ausschließlich bestätigte Daten des angefragten Workspace', async () => {
      const { workspaceService } = setup(
        vi.fn().mockResolvedValue({ data: { id: 'b', archived_at: null }, error: null }),
      );
      expect((await workspaceService.restoreWorkspace('a')).error).toBeInstanceOf(Error);
      expect(workspaceService.currentWorkspace()?.id).toBe('a');
    });

    it('meldet ohne aktive Anmeldung ausdrücklich keine Server-Archivierung', async () => {
      const injector = Injector.create({ providers: [] });
      const ohneAnmeldung = runInInjectionContext(injector, () => new WorkspaceService());
      await ohneAnmeldung.loadWorkspaces();
      expect((await ohneAnmeldung.archiveWorkspace('ws-1')).error?.message).toContain(
        'angemeldete',
      );
      expect(ohneAnmeldung.currentWorkspace()?.archived_at).toBeUndefined();
    });
  });
  let service: WorkspaceService;

  beforeEach(async () => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new WorkspaceService());
    // Die Workspace-Signale starten bewusst leer, damit ohne Anmeldung keine
    // Abfragen mit der Mock-Kennung "ws-1" an die Datenbank gehen. Ohne
    // Backend-Dienst faellt der Dienst auf die Standard-Workspaces zurueck -
    // fuer diese Tests wird dieser Zustand hier ausdruecklich hergestellt.
    await service.loadWorkspaces();
  });

  it('startet ohne Anmeldung mit leeren Signalen, damit keine ungueltige Workspace-Kennung abgefragt wird', () => {
    const injector = Injector.create({ providers: [] });
    const frisch = runInInjectionContext(injector, () => new WorkspaceService());

    expect(frisch.workspaces()).toEqual([]);
    expect(frisch.currentWorkspace()).toBeNull();
  });

  it('should initialize with multi-workspace presets', () => {
    const list = service.workspaces();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(service.currentWorkspace()).toBeDefined();
  });

  it('should switch between tenant workspaces', () => {
    const _ws1 = service.workspaces()[0];
    const ws2 = service.workspaces()[1];

    if (ws2) {
      service.switchWorkspace(ws2.id);
      expect(service.currentWorkspace()?.id).toBe(ws2.id);
    }
  });

  it('should create and delete a new workspace', async () => {
    const res = await service.createWorkspace('Sneaker & Kicks Hub');
    expect(res.data).toBeDefined();
    expect(res.data?.name).toBe('Sneaker & Kicks Hub');
    expect(service.currentWorkspace()?.name).toBe('Sneaker & Kicks Hub');

    const delRes = await service.deleteWorkspace(res.data!.id);
    expect(delRes.success).toBe(true);
  });

  it('blockiert Workspace-Wechsel und Neuanlage zentral während einer Erfassung', async () => {
    const injector = Injector.create({
      providers: [
        {
          provide: WorkspaceContextLockService,
          useValue: { locked: () => true },
        },
      ],
    });
    const lockedService = runInInjectionContext(injector, () => new WorkspaceService());
    await lockedService.loadWorkspaces();
    const original = lockedService.currentWorkspace();
    const target = lockedService.workspaces().find((workspace) => workspace.id !== original?.id)!;
    const before = [...lockedService.workspaces()];

    expect(lockedService.switchWorkspace(target.id)).toBe(false);
    expect(lockedService.currentWorkspace()).toEqual(original);

    const result = await lockedService.createWorkspace('Darf nicht entstehen');

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('laufenden Erfassung');
    expect(lockedService.workspaces()).toEqual(before);
    expect(lockedService.currentWorkspace()).toEqual(original);
  });

  it('landet nach jeder erfolgreichen Workspace-Neuanlage auf dem Dashboard', async () => {
    const navigate = vi.fn().mockResolvedValue(true);
    const injector = Injector.create({
      providers: [
        {
          provide: WorkspaceContextLockService,
          useValue: { locked: () => false },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    const routedService = runInInjectionContext(injector, () => new WorkspaceService());
    await routedService.loadWorkspaces();

    const result = await routedService.createWorkspace('Neuer Workspace');

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe('Neuer Workspace');
    expect(routedService.currentWorkspace()?.id).toBe(result.data?.id);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('behält einen gefüllten Workspace bei Datenbankablehnung vollständig lokal und meldet den Grund', async () => {
    const ersterWorkspace: Workspace = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Erster Workspace',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 20,
      min_profit_amount: 10,
      created_at: '2026-08-24T10:00:00.000Z',
    };
    const zweiterWorkspace: Workspace = {
      ...ersterWorkspace,
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Zweiter Workspace',
    };
    const syncStatus = new SyncStatusService();
    const injector = Injector.create({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: vi.fn(() => ({
                delete: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({
                        data: null,
                        error: {
                          code: 'P0001',
                          message:
                            'Workspace enthält Geschäftsdaten und kann nicht gelöscht werden. Erfasste Belege und Buchungen müssen erhalten bleiben.',
                        },
                      })),
                    })),
                  })),
                })),
              })),
            },
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
          },
        },
        { provide: SyncStatusService, useValue: syncStatus },
      ],
    });
    const produktivService = runInInjectionContext(injector, () => new WorkspaceService());
    produktivService.workspaces.set([ersterWorkspace, zweiterWorkspace]);
    produktivService.currentWorkspace.set(zweiterWorkspace);

    const result = await produktivService.deleteWorkspace(zweiterWorkspace.id);

    expect(result).toEqual({ success: false, reportedBySyncStatus: false, retentionBlocked: true });
    expect(produktivService.workspaces()).toEqual([ersterWorkspace, zweiterWorkspace]);
    expect(produktivService.currentWorkspace()).toEqual(zweiterWorkspace);
    expect(syncStatus.fehler()).toHaveLength(0);
  });

  it('entfernt lokal nichts, wenn die Datenbank keine gelöschte Workspace-Zeile bestätigt', async () => {
    const ersterWorkspace = service.workspaces()[0]!;
    const zweiterWorkspace: Workspace = {
      ...ersterWorkspace,
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Nicht bestätigter Workspace',
    };
    const syncStatus = new SyncStatusService();
    const injector = Injector.create({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => ({
                delete: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            },
          },
        },
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => true },
        },
        { provide: SyncStatusService, useValue: syncStatus },
      ],
    });
    const produktivService = runInInjectionContext(injector, () => new WorkspaceService());
    produktivService.workspaces.set([ersterWorkspace, zweiterWorkspace]);
    produktivService.currentWorkspace.set(zweiterWorkspace);

    const result = await produktivService.deleteWorkspace(zweiterWorkspace.id);

    expect(result).toEqual({ success: false, reportedBySyncStatus: true });
    expect(produktivService.workspaces()).toEqual([ersterWorkspace, zweiterWorkspace]);
    expect(produktivService.currentWorkspace()).toEqual(zweiterWorkspace);
    expect(syncStatus.fehler()[0]?.meldung).toContain('nicht bestätigt');
  });

  it('should calculate consolidated holding summary across workspaces', () => {
    const sampleSales: Sale[] = [
      {
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        id: 's-1',
        workspace_id: 'ws-1',
        inventory_item_id: 'item-1',
        sale_price: 200,
        net_profit: 80,
        roi: 66.6,
        platform: 'ebay',
        sale_date: '2026-08-18',
        holding_duration_days: 4,
      },
    ];

    const samplePurchases: Purchase[] = [
      {
        type: 'single',
        title: 'Testeinkauf',
        cost_allocation_mode: 'even',
        id: 'p-1',
        workspace_id: 'ws-1',
        purchase_date: '2026-08-10',
        purchase_price: 120,
        shipping_cost: 0,
      },
    ];

    const sampleItems: InventoryItem[] = [
      {
        condition: 'used',
        id: 'item-1',
        workspace_id: 'ws-1',
        title: 'Sony Alpha 7 Kamera',
        status: 'sold',
        allocated_purchase_cost: 120,
        created_at: '2026-08-10',
      },
    ];

    const holding = service.getConsolidatedHoldingSummary(
      sampleSales,
      samplePurchases,
      sampleItems,
    );

    expect(holding.workspacesCount).toBeGreaterThanOrEqual(1);
    expect(holding.totalRevenue).toBeGreaterThanOrEqual(200);
    expect(holding.totalNetProfit).toBeGreaterThanOrEqual(80);
    expect(holding.workspaceSummaries.length).toBe(holding.workspacesCount);
  });

  it('hält offene Holdingwerte getrennt je Workspace und zählt fremde Daten nicht doppelt', () => {
    const first = { ...service.workspaces()[0]!, id: 'ws-1' };
    const second = { ...first, id: 'ws-2' };
    service.workspaces.set([first, second]);
    const known: Sale = {
      id: 'known',
      workspace_id: first.id,
      platform: 'direct',
      sale_date: '2026-09-13',
      sale_price: 80,
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      net_profit: 30,
      roi: 60,
    };
    const open = {
      ...known,
      id: 'open',
      workspace_id: second.id,
      sale_price: 50,
      net_profit: null,
      roi: null,
    };
    const item: InventoryItem = {
      id: 'known-item',
      workspace_id: first.id,
      title: 'Bekannt',
      condition: 'used',
      status: 'ready',
      allocated_purchase_cost: 10,
    };
    const holding = service.getConsolidatedHoldingSummary(
      [known, open, { ...known, id: 'foreign', workspace_id: 'other' }],
      [],
      [item, { ...item, id: 'open-item', workspace_id: second.id, allocated_purchase_cost: null }],
    );
    expect(holding.workspaceSummaries[0]).toMatchObject({
      inventoryValue: 10,
      totalProfit: 30,
      roi: 60,
      totalRevenue: 80,
    });
    expect(holding.workspaceSummaries[1]).toMatchObject({
      inventoryValue: null,
      totalProfit: null,
      roi: null,
      totalRevenue: 50,
    });
    expect(holding).toMatchObject({
      totalRevenue: 130,
      totalInventoryValue: null,
      totalNetProfit: null,
      averageRoi: null,
      totalInventoryCount: 2,
    });
  });

  it.each([null, 0])(
    'unterscheidet offene Werte %s von echten Nullwerten auch innerhalb eines Workspace',
    (cost) => {
      const workspace = service.workspaces()[0]!;
      service.workspaces.set([workspace]);
      const item: InventoryItem = {
        id: 'content',
        workspace_id: workspace.id,
        title: 'Paketinhalt',
        condition: 'used',
        status: 'ready',
        allocated_purchase_cost: cost,
      };
      const sale: Sale = {
        id: 'sale',
        workspace_id: workspace.id,
        inventory_item: item,
        platform: 'direct',
        sale_date: '2026-09-13',
        sale_price: 0,
        platform_fee: 0,
        shipping_cost: 0,
        packaging_cost: 0,
        other_costs: 0,
        net_profit: 0,
        roi: 0,
      };
      const holding = service.getConsolidatedHoldingSummary([sale], [], [item]);
      expect(holding).toMatchObject({
        totalRevenue: 0,
        totalInventoryValue: cost,
        totalNetProfit: cost,
        averageRoi: cost,
      });
    },
  );

  it('ignoriert veraltete Gewinne bei offenem Snapshot sowie retournierte und stornierte Verkäufe', () => {
    const workspace = service.workspaces()[0]!;
    service.workspaces.set([workspace]);
    const sale: Sale = {
      id: 'sale',
      workspace_id: workspace.id,
      platform: 'direct',
      sale_date: '2026-09-13',
      sale_price: 80,
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      net_profit: 80,
      roi: 100,
      lines: [
        {
          id: 'line',
          sale_id: 'sale',
          title_snapshot: 'Paketinhalt',
          quantity: 1,
          unit_sale_price: 80,
          line_total: 80,
          cost_of_goods_sold: null,
          tax_mode: 'diff_25a',
        },
      ],
    };
    expect(service.getConsolidatedHoldingSummary([sale], [], [])).toMatchObject({
      totalNetProfit: null,
      averageRoi: null,
      totalRevenue: 80,
    });
    expect(
      service.getConsolidatedHoldingSummary(
        [
          { ...sale, returned_at: '2026-09-14' },
          { ...sale, id: 'void', voided_at: '2026-09-14' },
        ],
        [],
        [],
      ),
    ).toMatchObject({ totalNetProfit: 0, averageRoi: 0, totalRevenue: 0 });
  });

  it('zählt unbekannte Draftkosten nicht als bestätigtes investiertes Kapital', () => {
    const workspace = service.workspaces()[0]!;
    service.workspaces.set([workspace]);

    const holding = service.getConsolidatedHoldingSummary(
      [],
      [
        {
          id: 'purchase-known',
          workspace_id: workspace.id,
          type: 'single',
          title: 'Bekannter Einkauf',
          purchase_date: '2026-08-30',
          purchase_price: 10,
          total_purchase_cost: null,
          shipping_cost: 2,
          other_costs: 3,
          costs: [{ type: 'travel', amount: 4 }],
          cost_allocation_mode: 'even',
        },
        {
          id: 'purchase-unknown',
          workspace_id: workspace.id,
          type: 'single',
          title: 'Unbekannter Draft',
          purchase_date: '2026-08-31',
          purchase_price: null,
          total_purchase_cost: null,
          shipping_cost: 5,
          cost_allocation_mode: 'even',
        },
        {
          id: 'purchase-free',
          workspace_id: workspace.id,
          type: 'single',
          title: 'Kostenlos mit Versand',
          purchase_date: '2026-08-31',
          purchase_price: 0,
          total_purchase_cost: null,
          shipping_cost: 2,
          cost_allocation_mode: 'even',
        },
      ],
      [],
    );

    expect(holding.totalCapitalInvested).toBe(21);
  });
});
