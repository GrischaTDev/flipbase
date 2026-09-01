import '@angular/compiler';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { BusinessEvent } from '../models/business-event.models';
import { AuditArchiveData, buildAuditArchive, escapeAuditCsvCell } from './audit-export.service';

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
      stockLots: [],
      stockMovements: [],
      sales: [],
      saleLines: [],
      saleCosts: [],
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
      schemaVersion: '1.0.0',
      exportVersion: '1.0.0',
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
  });

  it('neutralisiert Tabellenformeln und quotiert Trennzeichen, Zeilenumbrüche und Anführungszeichen', () => {
    expect(escapeAuditCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeAuditCsvCell('A;B')).toBe('"A;B"');
    expect(escapeAuditCsvCell('A"B')).toBe('"A""B"');
    expect(escapeAuditCsvCell('A\nB')).toBe('"A\nB"');
  });
});
