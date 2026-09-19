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

function snapshotFixture(): Record<string, unknown> {
  return {
    captured_at: '2026-09-04T16:00:00Z',
    snapshot: '1:3:',
    business_events: [],
    suppliers: [],
    catalog_products: [],
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
    returns: [],
    inventory_reconciliation_events: [],
    invoices: [],
    invoice_items: [],
    purchase_documents: [],
    expense_categories: [],
    expense_recurring_rules: [],
    expenses: [],
    expense_documents: [],
  };
}

function snapshotService(
  response: () => Promise<{ data: unknown; error: { message: string } | null }>,
  download: (path: string) => Promise<{
    data: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
    error: { message: string } | null;
  }> = async () => ({ data: null, error: null }),
) {
  let workspaceId = 'w';
  const rpc = vi.fn(response);
  const storage = { from: vi.fn(() => ({ download })) };
  const service = Object.create(AuditExportService.prototype) as AuditExportService;
  Object.assign(service, {
    workspaceService: { currentWorkspace: () => ({ id: workspaceId }) },
    supabase: { client: { rpc, storage } },
  });
  return {
    service,
    rpc,
    storage,
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
    expect(result.manifest.files).toHaveLength(25);
    expect(result.manifest.files.map((file) => file.name).sort()).toEqual(
      [
        'business-events.csv',
        'business-events.json',
        'catalog-products.csv',
        'document-downloads.json',
        'expense-categories.csv',
        'expense-documents.csv',
        'expense-recurring-rules.csv',
        'expenses.csv',
        'inventory-items.csv',
        'inventory-reconciliation-events.csv',
        'invoice-items.csv',
        'invoices.csv',
        'item-costs.csv',
        'purchase-costs.csv',
        'purchase-documents.csv',
        'purchase-lines.csv',
        'purchases.csv',
        'returns.csv',
        'sale-costs.csv',
        'sale-line-lot-allocations.csv',
        'sale-lines.csv',
        'sales.csv',
        'stock-lots.csv',
        'stock-movements.csv',
        'suppliers.csv',
      ].sort(),
    );
  });
  it('nimmt verfügbare Originalbelege unter einem stabilen Pfad auf und meldet fehlende Dateien', async () => {
    const data = snapshotFixture();
    data['purchase_documents'] = [
      {
        id: 'purchase-document-1',
        original_file_name: 'Vinted-Rechnung.pdf',
        storage_path: 'purchase-documents/w/purchase-1/purchase-document-1.pdf',
      },
    ];
    data['expense_documents'] = [
      {
        id: 'expense-document-1',
        original_file_name: 'Hosting-Rechnung.pdf',
        storage_path: 'expense-documents/w/expense-1/expense-document-1.pdf',
      },
    ];
    const download = vi.fn(async (path: string) =>
      path.startsWith('purchase-documents/')
        ? { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null }
        : { data: null, error: { message: 'Datei fehlt' } },
    );
    const { service, storage } = snapshotService(async () => ({ data, error: null }), download);

    const result = await service.createArchive({ workspaceId: 'w', pageSize: 10 });
    const zip = await JSZip.loadAsync(result.bytes);

    expect(storage.from).toHaveBeenNthCalledWith(1, 'purchase-documents');
    expect(storage.from).toHaveBeenNthCalledWith(2, 'expense-documents');
    expect(
      await zip
        .file('documents/purchase-documents/w/purchase-1/purchase-document-1.pdf')!
        .async('uint8array'),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.documentFailures).toEqual([
      expect.objectContaining({
        documentId: 'expense-document-1',
        message: 'Datei fehlt',
      }),
    ]);
    expect(JSON.parse(await zip.file('document-downloads.json')!.async('string'))).toEqual([
      expect.objectContaining({ status: 'included' }),
      expect.objectContaining({ status: 'unavailable', message: 'Datei fehlt' }),
    ]);
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
      suppliers: [{ id: 'supplier-1', workspace_id: 'workspace-1', name: 'Händler GmbH' }],
      catalogProducts: [
        {
          id: 'catalog-1',
          workspace_id: 'workspace-1',
          title: 'LED-Lampe',
          tracking_mode: 'quantity',
        },
      ],
      purchases: [{ id: 'purchase-1', workspace_id: 'workspace-1', title: '=IMPORTXML()' }],
      purchaseLines: [],
      purchaseCosts: [{ id: 'pc1', tax_treatment: 'purchase_price' }],
      inventoryItems: [
        { id: 'i1', tax_purchase_cost: 0 },
        { id: 'i2', tax_purchase_cost: null },
      ],
      itemCosts: [{ id: 'item-cost-1', inventory_item_id: 'item-1', type: 'repair', amount: 12 }],
      stockLots: [
        { id: 'lot1', unit_tax_purchase_cost: 6.25, remaining_tax_unit_costs: [6.25, 6.25, 0] },
        { id: 'lot2', unit_tax_purchase_cost: null, remaining_tax_unit_costs: null },
        { id: 'lot3', unit_tax_purchase_cost: 0, remaining_tax_unit_costs: [] },
      ],
      stockMovements: [],
      sales: [],
      saleLines: [
        {
          id: 'sl1',
          tax_purchase_cost: 12.5,
          tax_cost_allocations: [{ quantity: 2, tax_purchase_cost: 6.25 }],
        },
        { id: 'sl2', tax_purchase_cost: null, tax_cost_allocations: null },
      ],
      saleCosts: [],
      saleLineLotAllocations: [
        {
          id: 'allocation-1',
          sale_line_id: 'line-1',
          stock_lot_id: 'lot-1',
          quantity: 2,
          allocated_cost: 33.34,
          active_allocated_cost: 33.34,
          consumption_sequence: 7,
          tax_purchase_cost: 12.5,
          tax_cost_allocations: [{ quantity: 2, tax_purchase_cost: 6.25 }],
          active_tax_unit_costs: [6.25],
        },
        {
          id: 'allocation-2',
          tax_purchase_cost: null,
          tax_cost_allocations: null,
          active_tax_unit_costs: null,
        },
        {
          id: 'allocation-3',
          tax_purchase_cost: 0,
          tax_cost_allocations: [{ quantity: 1, tax_purchase_cost: 0 }],
          active_tax_unit_costs: [],
        },
      ],
      returns: [
        {
          id: 'return-1',
          workspace_id: 'workspace-1',
          sale_id: 'sale-1',
          inventory_item_id: 'item-1',
          credit_note_number: 'GS-1',
        },
      ],
      inventoryReconciliationEvents: [
        {
          id: 'reconciliation-1',
          workspace_id: 'workspace-1',
          inventory_item_id: 'item-1',
          actor_id: 'user-1',
          event_type: 'restore_stock',
        },
      ],
      invoices: [
        {
          id: 'invoice-1',
          workspace_id: 'workspace-1',
          sale_id: 'sale-1',
          invoice_number: 'RE-1',
        },
      ],
      invoiceItems: [
        {
          id: 'invoice-item-1',
          invoice_id: 'invoice-1',
          title: 'LED-Lampe',
          quantity: 1,
        },
      ],
      purchaseDocuments: [
        {
          id: 'purchase-document-1',
          workspace_id: 'workspace-1',
          purchase_id: 'purchase-1',
          original_file_name: 'Einkauf.pdf',
        },
      ],
      expenseCategories: [
        { id: 'expense-category-1', workspace_id: 'workspace-1', name: 'Software & Abos' },
      ],
      expenseRecurringRules: [
        { id: 'expense-rule-1', workspace_id: 'workspace-1', title: 'Hosting' },
      ],
      expenses: [
        { id: 'expense-1', workspace_id: 'workspace-1', title: 'Hosting', gross_amount: 12 },
      ],
      expenseDocuments: [
        {
          id: 'expense-document-1',
          workspace_id: 'workspace-1',
          expense_id: 'expense-1',
          original_file_name: 'Hosting.pdf',
        },
      ],
      documents: [
        {
          bucket: 'purchase-documents',
          documentId: 'purchase-document-1',
          originalFileName: 'Einkauf.pdf',
          storagePath: 'purchase-documents/workspace-1/purchase-1/purchase-document-1.pdf',
          archivePath:
            'documents/purchase-documents/workspace-1/purchase-1/purchase-document-1.pdf',
          content: new Uint8Array([7, 8]),
          failure: null,
        },
        {
          bucket: 'expense-documents',
          documentId: 'expense-document-1',
          originalFileName: 'Hosting.pdf',
          storagePath: 'expense-documents/workspace-1/expense-1/expense-document-1.pdf',
          archivePath: 'documents/expense-documents/workspace-1/expense-1/expense-document-1.pdf',
          content: null,
          failure: 'Datei fehlt',
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
    expect(
      Object.entries(zip.files)
        .filter(([, file]) => !file.dir)
        .map(([name]) => name)
        .sort(),
    ).toEqual(
      [
        'business-events.csv',
        'business-events.json',
        'catalog-products.csv',
        'document-downloads.json',
        'documents/purchase-documents/workspace-1/purchase-1/purchase-document-1.pdf',
        'expense-categories.csv',
        'expense-documents.csv',
        'expense-recurring-rules.csv',
        'expenses.csv',
        'inventory-items.csv',
        'inventory-reconciliation-events.csv',
        'invoice-items.csv',
        'invoices.csv',
        'item-costs.csv',
        'sale-line-lot-allocations.csv',
        'manifest.json',
        'purchase-costs.csv',
        'purchase-documents.csv',
        'purchase-lines.csv',
        'purchases.csv',
        'returns.csv',
        'sale-costs.csv',
        'sale-lines.csv',
        'sales.csv',
        'stock-lots.csv',
        'stock-movements.csv',
        'suppliers.csv',
      ].sort(),
    );
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const eventsJson = JSON.parse(await zip.file('business-events.json')!.async('string'));
    const eventsCsv = await zip.file('business-events.csv')!.async('string');
    const purchasesCsv = await zip.file('purchases.csv')!.async('string');

    expect(manifest).toMatchObject({
      schemaVersion: '1.3.0',
      exportVersion: '1.3.0',
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
    for (const [file, column, expectedValues] of [
      ['purchase-costs.csv', 'tax_treatment', ['purchase_price']],
      ['inventory-items.csv', 'tax_purchase_cost', ['0', '']],
      ['sale-lines.csv', 'tax_purchase_cost', ['12.5', '']],
      ['stock-lots.csv', 'unit_tax_purchase_cost', ['6.25', '', '0']],
      ['stock-lots.csv', 'remaining_tax_unit_costs', ['[6.25,6.25,0]', '', '[]']],
      ['sale-line-lot-allocations.csv', 'tax_purchase_cost', ['12.5', '', '0']],
      ['sale-line-lot-allocations.csv', 'active_tax_unit_costs', ['[6.25]', '', '[]']],
      [
        'sale-line-lot-allocations.csv',
        'tax_cost_allocations',
        [
          '"[{""quantity"":2,""tax_purchase_cost"":6.25}]"',
          '',
          '"[{""quantity"":1,""tax_purchase_cost"":0}]"',
        ],
      ],
      [
        'sale-lines.csv',
        'tax_cost_allocations',
        ['"[{""quantity"":2,""tax_purchase_cost"":6.25}]"', ''],
      ],
    ] as const) {
      const csv = (await zip.file(file)!.async('string')).replace(/^\uFEFF/, '').split('\r\n');
      const columnIndex = csv[0].split(';').indexOf(column);
      expect(columnIndex).toBeGreaterThanOrEqual(0);
      expect(
        csv.slice(1, 1 + expectedValues.length).map((row) => row.split(';')[columnIndex]),
      ).toEqual(expectedValues);
    }
    const allocationsCsv = await zip.file('sale-line-lot-allocations.csv')!.async('string');
    expect(allocationsCsv.split('\r\n')[0]).toContain('consumption_sequence');
    expect(allocationsCsv).toContain('33.34;33.34;7');
    expect(await zip.file('returns.csv')!.async('string')).toContain(
      'return-1;workspace-1;sale-1;item-1',
    );
    expect(await zip.file('invoice-items.csv')!.async('string')).toContain(
      'invoice-item-1;invoice-1',
    );
    expect(await zip.file('expenses.csv')!.async('string')).toContain('expense-1;workspace-1');
    expect(await zip.file('purchase-documents.csv')!.async('string')).toContain(
      'purchase-document-1;workspace-1;purchase-1',
    );
    expect(result.documentFailures).toEqual([
      expect.objectContaining({ documentId: 'expense-document-1', message: 'Datei fehlt' }),
    ]);
  });

  it('neutralisiert Tabellenformeln und quotiert Trennzeichen, Zeilenumbrüche und Anführungszeichen', () => {
    expect(escapeAuditCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeAuditCsvCell('A;B')).toBe('"A;B"');
    expect(escapeAuditCsvCell('A"B')).toBe('"A""B"');
    expect(escapeAuditCsvCell('A\nB')).toBe('"A\nB"');
  });
});
