import '@angular/compiler';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEvent } from '../models/business-event.models';
import {
  AuditArchiveData,
  AuditExportService,
  buildAuditArchive,
  escapeAuditCsvCell,
} from './audit-export.service';

function snapshotFixture() {
  return {
    captured_at: '2026-09-04T16:00:00Z',
    snapshot: '1:3:',
    business_events: [],
    purchases: [],
    purchase_lines: [],
    purchase_costs: [],
    inventory_items: [],
    item_costs: [],
    stock_lots: [],
    stock_movements: [],
    sales: [],
    sale_lines: [],
    sale_cost_entries: [],
    sale_line_lot_allocations: [],
  };
}

function snapshotService(
  response: () => Promise<{ data: unknown; error: { message: string } | null }>,
) {
  let workspaceId = 'w';
  const rpc = vi.fn(response);
  const service = Object.create(AuditExportService.prototype) as AuditExportService;
  Object.assign(service, {
    mockStore: { isDemoMode: () => false },
    workspaceService: { currentWorkspace: () => ({ id: workspaceId }) },
    supabase: { client: { rpc } },
  });
  return {
    service,
    rpc,
    switchWorkspace: () => {
      workspaceId = 'other';
    },
  };
}

describe('Audit-Snapshot-Vertrag', () => {
  it('baut alle Dateien aus genau einer RPC-Antwort und übernimmt deren Snapshot-Zeit', async () => {
    const { service, rpc } = snapshotService(async () => ({
      data: snapshotFixture(),
      error: null,
    }));
    const result = await service.createArchive({ workspaceId: 'w', pageSize: 10 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('export_audit_snapshot', {
      p_workspace_id: 'w',
      p_filter: {
        entity_type: null,
        entity_id: null,
        event_type: null,
        actor_id: null,
        from: null,
        to: null,
      },
    });
    expect(result.manifest.createdAt).toBe('2026-09-04T16:00:00Z');
    expect(result.manifest.filters['snapshot']).toBe('1:3:');
    expect(result.manifest.files).toHaveLength(13);
  });
  it('verwirft Antworten nach einem Workspace-Wechsel', async () => {
    const fixture = snapshotService(async () => {
      fixture.switchWorkspace();
      return { data: snapshotFixture(), error: null };
    });
    await expect(
      fixture.service.createArchive({ workspaceId: 'w', pageSize: 10 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('verwirft auch einen Workspace-Wechsel während der ZIP-Erstellung', async () => {
    const fixture = snapshotService(async () => ({ data: snapshotFixture(), error: null }));
    await expect(
      fixture.service.createArchive({
        workspaceId: 'w',
        pageSize: 10,
        onProgress: () => fixture.switchWorkspace(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('erfindet keine leeren Tabellen bei einer unvollständigen Antwort', async () => {
    const data: Record<string, unknown> = snapshotFixture();
    delete data['item_costs'];
    const { service } = snapshotService(async () => ({ data, error: null }));
    await expect(service.createArchive({ workspaceId: 'w', pageSize: 10 })).rejects.toThrow(
      'item_costs',
    );
  });
  it('meldet Größenfehler statt ein still gekürztes Teilarchiv auszugeben', async () => {
    const { service } = snapshotService(async () => ({
      data: null,
      error: { message: 'Das Prüfarchiv überschreitet 100000 Datensätze.' },
    }));
    await expect(service.createArchive({ workspaceId: 'w', pageSize: 10 })).rejects.toThrow(
      '100000',
    );
  });
});

describe('AuditExportService archive builder', () => {
  it('erstellt ein vollständiges, maschinenlesbares Archiv mit Manifest und stabilen Dateien', async () => {
    const event: BusinessEvent = {
      id: 'event-1',
      workspaceId: 'workspace-1',
      entityType: 'purchase',
      entityId: 'purchase-1',
      eventType: 'purchase_costing_finalized',
      eventLabel: 'Einkauf abgeschlossen',
      actorId: 'user-1',
      reason: null,
      changes: { before: { status: 'draft' }, after: { status: 'finalized', note: '=SUM(A1)' } },
      correlationId: 'correlation-1',
      createdAt: '2026-08-31T12:00:00.000Z',
    };
    const data: AuditArchiveData = {
      businessEvents: [event],
      purchases: [{ id: 'purchase-1', workspace_id: 'workspace-1', title: '=IMPORTXML()' }],
      purchaseLines: [],
      purchaseCosts: [],
      inventoryItems: [],
      itemCosts: [{ id: 'item-cost-1', inventory_item_id: 'item-1', type: 'repair', amount: 12 }],
      stockLots: [],
      stockMovements: [],
      sales: [],
      saleLines: [],
      saleCosts: [],
      saleLineLotAllocations: [
        {
          id: 'allocation-1',
          sale_line_id: 'line-1',
          stock_lot_id: 'lot-1',
          quantity: 2,
          allocated_cost: 33.34,
          active_allocated_cost: 33.34,
        },
      ],
    };

    const result = await buildAuditArchive(data, {
      workspaceId: 'workspace-1',
      createdAt: '2026-09-01T08:09:10.000Z',
      filters: { entity_type: 'purchase' },
    });
    const zip = await JSZip.loadAsync(result.bytes);

    expect(result.filename).toBe('flipbase-audit-2026-09-01T08-09-10Z.zip');
    expect(Object.keys(zip.files).sort()).toEqual(
      [
        'business-events.csv',
        'business-events.json',
        'inventory-items.csv',
        'item-costs.csv',
        'sale-line-lot-allocations.csv',
        'manifest.json',
        'purchase-costs.csv',
        'purchase-lines.csv',
        'purchases.csv',
        'sale-costs.csv',
        'sale-lines.csv',
        'sales.csv',
        'stock-lots.csv',
        'stock-movements.csv',
      ].sort(),
    );
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const eventsJson = JSON.parse(await zip.file('business-events.json')!.async('string'));
    const eventsCsv = await zip.file('business-events.csv')!.async('string');
    const purchasesCsv = await zip.file('purchases.csv')!.async('string');

    expect(manifest).toMatchObject({
      schemaVersion: '1.1.0',
      exportVersion: '1.1.0',
      workspaceId: 'workspace-1',
      filters: { entity_type: 'purchase' },
    });
    expect(
      manifest.files.find((file: { name: string }) => file.name === 'business-events.json'),
    ).toMatchObject({ rows: 1 });
    expect(eventsJson[0].changes.after).toEqual({ status: 'finalized', note: '=SUM(A1)' });
    expect(eventsCsv.split('\n')[0]).toContain('created_at');
    expect(eventsCsv).toContain('2026-08-31T12:00:00.000Z');
    expect(purchasesCsv).toContain("'=IMPORTXML()");
    expect(await zip.file('item-costs.csv')!.async('string')).toContain(
      'item-cost-1;item-1;repair;12',
    );
    expect(await zip.file('sale-line-lot-allocations.csv')!.async('string')).toContain(
      '33.34;33.34',
    );
  });

  it('neutralisiert Tabellenformeln und quotiert Trennzeichen, Zeilenumbrüche und Anführungszeichen', () => {
    expect(escapeAuditCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeAuditCsvCell('A;B')).toBe('"A;B"');
    expect(escapeAuditCsvCell('A"B')).toBe('"A""B"');
    expect(escapeAuditCsvCell('A\nB')).toBe('"A\nB"');
  });
});
