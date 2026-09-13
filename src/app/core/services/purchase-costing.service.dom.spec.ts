import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { PurchaseCostingService } from './purchase-costing.service';
import { SyncStatusService } from './sync-status.service';
import { MockDataStoreService } from './mock-data-store.service';

const finalizedResult = {
  purchaseId: 'purchase-1',
  totalPurchaseCost: 42.98,
  allocatedTotalCost: 42.98,
  entryStatus: 'finalized',
  eventId: 'event-1',
};

function createService(options?: {
  readonly demo?: boolean;
  readonly rpc?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}) {
  const syncStatus = new SyncStatusService();
  const rpc = vi.fn(
    options?.rpc ??
      (async () => ({
        data: finalizedResult,
        error: null,
      })),
  );
  const service = Object.create(PurchaseCostingService.prototype) as PurchaseCostingService;
  Object.assign(service, {
    mockStore: {
      isDemoMode: () => options?.demo ?? false,
      finalizePurchaseCosting: () => ({ data: finalizedResult, error: null }),
    },
    syncStatus,
    supabase: { client: { rpc } },
  });
  return { service, rpc, syncStatus };
}

describe('PurchaseCostingService', () => {
  it('erhält die Paketkennzeichnung bei Korrekturen und verwirft ungültige Paketmengen', async () => {
    const { service, rpc } = createService();
    const line = {
      id: 'line-1',
      catalog_product_id: null,
      title_snapshot: 'Paket',
      is_package: true,
      line_kind: 'individual' as const,
      ordered_quantity: 1,
      price_mode: 'priced' as const,
      unit_purchase_price: 100,
      line_total: 100,
      condition_snapshot: null,
      estimated_market_value: null,
    };
    const input = {
      workspaceId: 'workspace-1',
      purchaseId: 'purchase-1',
      reason: 'Paketbezeichnung berichtigen',
      purchasePrice: 100,
      lines: [line],
      costs: [],
    };
    expect((await service.correctPurchase(input)).error).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      'correct_purchase_costing',
      expect.objectContaining({ p_lines: [line] }),
    );
    expect(
      (await service.correctPurchase({ ...input, lines: [{ ...line, ordered_quantity: 2 }] }))
        .error,
    ).toBeInstanceOf(Error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('weist eine Vorschau für einen anderen Einkauf zurück', async () => {
    const { service } = createService({
      rpc: async () => ({
        data: {
          purchaseId: 'other',
          fingerprint: 'hash',
          classification: 'auto_repair',
          reason: 'Bereit',
          purchasePrice: 100,
          costs: [],
          items: [],
        },
        error: null,
      }),
    });
    expect((await service.previewCostRepair('workspace-1', 'purchase-1')).error).not.toBeNull();
  });

  it('übernimmt nur den geprüften Einzelkauf mit seinem Fingerabdruck', async () => {
    const { service, rpc } = createService({
      rpc: async () => ({
        data: { repaired: 1, itemsMissing: 0, manualReview: 0 },
        error: null,
      }),
    });
    const result = await service.repairPurchaseCosts('workspace-1', 'purchase-1', 'checked-state');
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
    expect(rpc).toHaveBeenCalledWith('migrate_purchase_costing_legacy', {
      p_workspace_id: 'workspace-1',
      p_purchase_id: 'purchase-1',
      p_expected_fingerprint: 'checked-state',
      p_confirm: true,
    });
  });

  it('sendet bei fehlender Einzelkauf-Bestätigung keine Sammelkorrektur', async () => {
    const { service, rpc } = createService();
    const result = await service.repairPurchaseCosts('workspace-1', '', '');
    expect(result.error).not.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('finalisiert einen Einkauf mit dem exakten RPC-Vertrag', async () => {
    const { service, rpc } = createService();

    const result = await service.finalizePurchase('workspace-1', 'purchase-1');

    expect(rpc).toHaveBeenCalledWith('finalize_purchase_costing', {
      p_workspace_id: 'workspace-1',
      p_purchase_id: 'purchase-1',
    });
    expect(result).toEqual({
      data: finalizedResult,
      error: null,
      reportedBySyncStatus: false,
    });
  });

  it('bildet den nullable Gesamtbetrag beim Wiederöffnen strikt ab', async () => {
    const reopenedResult = {
      ...finalizedResult,
      totalPurchaseCost: null,
      allocatedTotalCost: 0,
      entryStatus: 'capturing',
      eventId: 'event-2',
    };
    const { service, rpc } = createService({
      rpc: async () => ({ data: reopenedResult, error: null }),
    });

    const result = await service.reopenPurchase('workspace-1', 'purchase-1');

    expect(rpc).toHaveBeenCalledWith('reopen_purchase_costing', {
      p_workspace_id: 'workspace-1',
      p_purchase_id: 'purchase-1',
    });
    expect(result.data).toEqual(reopenedResult);
  });

  it.each([
    ['normal', null],
    ['Mystery', 0],
  ] as const)('sendet den %s-Kaufpreis ohne Null-Normalisierung', async (_label, purchasePrice) => {
    const { service, rpc } = createService();

    const result = await service.correctPurchase({
      workspaceId: 'workspace-1',
      purchaseId: 'purchase-1',
      reason: 'Ein weiterer Artikel wurde gefunden.',
      purchasePrice,
      lines: [],
      costs: [],
    });

    expect(rpc).toHaveBeenCalledWith('correct_purchase_costing', {
      p_workspace_id: 'workspace-1',
      p_purchase_id: 'purchase-1',
      p_reason: 'Ein weiterer Artikel wurde gefunden.',
      p_purchase_price: purchasePrice,
      p_lines: [],
      p_costs: [],
    });
    expect(result.data).toEqual(finalizedResult);
  });

  it.each(['purchase_price', 'expense', null] as const)(
    'sendet eine korrigierte Kostenherkunft %s unverändert',
    async (taxTreatment) => {
      const { service, rpc } = createService();
      const costs = [
        {
          id: 'cost-1',
          type: 'shipping',
          amount: 5,
          description: null,
          allocation_method: 'value_weighted' as const,
          target_purchase_line_id: null,
          tax_treatment: taxTreatment,
        },
      ];
      await service.correctPurchase({
        workspaceId: 'workspace-1',
        purchaseId: 'purchase-1',
        reason: 'Beleg geprüft',
        purchasePrice: null,
        lines: [],
        costs,
      });
      expect(rpc).toHaveBeenCalledWith(
        'correct_purchase_costing',
        expect.objectContaining({ p_costs: costs }),
      );
    },
  );

  it('weist eine formal erfolgreiche, aber unvollständige RPC-Antwort zurück', async () => {
    const { service, syncStatus } = createService({
      rpc: async () => ({ data: { purchaseId: 'purchase-1' }, error: null }),
    });

    const result = await service.finalizePurchase('workspace-1', 'purchase-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.reportedBySyncStatus).toBe(true);
    expect(syncStatus.anzahl()).toBe(1);
  });

  it('weist eine formal gültige Buchungsantwort für einen anderen Einkauf zurück', async () => {
    const { service, syncStatus } = createService({
      rpc: async () => ({
        data: { ...finalizedResult, purchaseId: 'purchase-2' },
        error: null,
      }),
    });

    const result = await service.finalizePurchase('workspace-1', 'purchase-1');

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(syncStatus.anzahl()).toBe(1);
  });

  it.each([
    ['Supabase-Fehler', async () => ({ data: null, error: new Error('denied') })],
    ['geworfene Ausnahme', async () => Promise.reject(new Error('network down'))],
  ] as const)(
    'meldet einen %s genau einmal und liefert keinen Scheinerfolg',
    async (_label, rpc) => {
      const { service, syncStatus } = createService({ rpc });

      const result = await service.finalizePurchase('workspace-1', 'purchase-1');

      expect(result.data).toBeNull();
      expect(result.reportedBySyncStatus).toBe(true);
      expect(syncStatus.anzahl()).toBe(1);
    },
  );

  it('lädt und übersetzt den Ereignisverlauf mit erstem Null-Cursor', async () => {
    const changes = { entry_status: { before: 'capturing', after: 'finalized' } };
    const eventRow = {
      id: 'event-1',
      workspace_id: 'workspace-1',
      entity_type: 'purchase',
      entity_id: 'purchase-1',
      event_type: 'purchase_finalized',
      actor_id: null,
      reason: null,
      changes,
      correlation_id: 'correlation-1',
      created_at: '2026-08-31T12:00:00.000Z',
    };
    const { service, rpc } = createService({
      rpc: async () => ({ data: [eventRow], error: null }),
    });

    const result = await service.loadEvents('workspace-1', 'purchase', 'purchase-1');

    expect(rpc).toHaveBeenCalledWith('list_entity_business_events', {
      p_workspace_id: 'workspace-1',
      p_entity_type: 'purchase',
      p_entity_id: 'purchase-1',
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_page_size: 100,
    });
    expect(result.data).toEqual([
      {
        id: 'event-1',
        workspaceId: 'workspace-1',
        entityType: 'purchase',
        entityId: 'purchase-1',
        eventType: 'purchase_finalized',
        actorId: null,
        reason: null,
        changes,
        correlationId: 'correlation-1',
        createdAt: '2026-08-31T12:00:00.000Z',
      },
    ]);
  });

  it('weist einen Ereignisdatensatz mit falschem Entitätstyp zurück', async () => {
    const { service, syncStatus } = createService({
      rpc: async () => ({
        data: [
          {
            id: 'event-1',
            workspace_id: 'workspace-1',
            entity_type: 'sale',
            entity_id: 'purchase-1',
            event_type: 'purchase_finalized',
            actor_id: null,
            reason: null,
            changes: {},
            correlation_id: 'correlation-1',
            created_at: '2026-08-31T12:00:00.000Z',
          },
        ],
        error: null,
      }),
    });

    const result = await service.loadEvents('workspace-1', 'purchase', 'purchase-1');

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(syncStatus.anzahl()).toBe(1);
  });

  it('weist einen unbekannten Entitätstyp vor dem Serveraufruf zurück', async () => {
    const { service, rpc, syncStatus } = createService();

    const result = await service.loadEvents('workspace-1', 'unknown' as never, 'purchase-1');

    expect(rpc).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(syncStatus.anzahl()).toBe(1);
  });

  it('finalisiert den Demo-Einkauf über denselben lokalen Buchungsvertrag', async () => {
    const { service, rpc, syncStatus } = createService({ demo: true });

    const result = await service.finalizePurchase('workspace-1', 'purchase-1');

    expect(rpc).not.toHaveBeenCalled();
    expect(result.data).toEqual(finalizedResult);
    expect(result.reportedBySyncStatus).toBe(false);
    expect(syncStatus.anzahl()).toBe(0);
  });

  it('meldet die nicht unterstützte normale Demo-Finalisierung zentral und lässt den Draft unverändert', async () => {
    globalThis.localStorage.clear();
    const store = runInInjectionContext(
      Injector.create({ providers: [] }),
      () => new MockDataStoreService(),
    );
    store.isDemoMode.set(true);
    store.savePurchase({
      id: 'purchase-normal',
      workspace_id: 'workspace-1',
      type: 'single',
      title: 'Normaler Einkauf 10/90',
      purchase_date: '2026-09-01',
      purchase_price: 100,
      cost_allocation_mode: 'even',
      entry_status: 'draft',
    });
    store.savePurchaseLine({
      id: 'line-10',
      workspace_id: 'workspace-1',
      purchase_id: 'purchase-normal',
      catalog_product_id: null,
      title_snapshot: 'Artikel für 10 Euro',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'priced',
      unit_purchase_price: 10,
      line_total: 10,
    });
    store.savePurchaseLine({
      id: 'line-90',
      workspace_id: 'workspace-1',
      purchase_id: 'purchase-normal',
      catalog_product_id: null,
      title_snapshot: 'Artikel für 90 Euro',
      line_kind: 'individual',
      ordered_quantity: 1,
      received_quantity: 0,
      price_mode: 'priced',
      unit_purchase_price: 90,
      line_total: 90,
    });
    const syncStatus = new SyncStatusService();
    const service = Object.create(PurchaseCostingService.prototype) as PurchaseCostingService;
    Object.assign(service, {
      mockStore: store,
      syncStatus,
      supabase: { client: { rpc: vi.fn() } },
    });

    const result = await service.finalizePurchase('workspace-1', 'purchase-normal');

    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(syncStatus.neuesterFehler()?.meldung).toBe(
      'In der Demo können aktuell nur Mystery Boxen abgeschlossen werden.',
    );
    expect(store.getPurchases('workspace-1')[0]).toMatchObject({ entry_status: 'draft' });
    expect(store.getItems('workspace-1')).toEqual([]);
  });
});
