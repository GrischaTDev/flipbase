import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEvent } from '../../../../core/models/business-event.models';
import { printAuditDocument, summarizeAuditEvent } from './audit-print.component';

describe('AuditPrintComponent', () => {
  it('bereitet einen lesbaren Vorgang vor und bewahrt stabile Referenzen', () => {
    const event: BusinessEvent = {
      id: 'event-1',
      workspaceId: 'workspace-1',
      entityType: 'sale',
      entityId: 'sale-1',
      eventType: 'sale_finalized',
      eventLabel: 'Verkauf abgeschlossen',
      actorId: 'user-1',
      reason: 'Historischer Nachtrag',
      changes: { before: null, after: { total: 42.98, api_key: 'should-not-print' } },
      correlationId: 'correlation-1',
      createdAt: '2026-08-31T12:00:00.000Z',
    };

    expect(summarizeAuditEvent(event)).toEqual({
      id: 'event-1',
      entityReference: 'sale / sale-1',
      label: 'Verkauf abgeschlossen',
      eventType: 'sale_finalized',
      actorId: 'user-1',
      reason: 'Historischer Nachtrag',
      createdAt: '2026-08-31T12:00:00.000Z',
      changes:
        '{\n  "before": null,\n  "after": {\n    "total": 42.98,\n    "api_key": "[geschützt]"\n  }\n}',
    });
  });

  it('ruft den Browserdruck nur über die explizite Aktion auf', () => {
    const print = vi.fn();
    printAuditDocument(print);
    expect(print).toHaveBeenCalledOnce();
  });
});
