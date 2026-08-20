import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { WorkspaceService } from './workspace.service';
import { InventoryItem, Purchase, Sale } from '../models/flipbase.models';

describe('Multi-Workspace & Holding Consolidation Service', () => {
  let service: WorkspaceService;

  beforeEach(async () => {
    const injector = Injector.create({ providers: [] });
    service = runInInjectionContext(injector, () => new WorkspaceService());
    // Die Workspace-Signale starten bewusst leer, damit ohne Anmeldung keine
    // Abfragen mit der Mock-Kennung "ws-1" an die Datenbank gehen. Ohne
    // Backend faellt der Dienst auf die Demo-Workspaces zurueck - fuer diese
    // Tests wird dieser Zustand hier ausdruecklich hergestellt.
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
});
