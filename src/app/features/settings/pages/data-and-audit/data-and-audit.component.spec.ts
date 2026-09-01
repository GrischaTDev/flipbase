import '@angular/compiler';
import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { WorkspaceRole } from '../../../../core/models/flipbase.models';
import {
  auditFiltersFromQueryParams,
  canExportAuditData,
  toBusinessEventFilter,
} from './data-and-audit.component';

describe('Daten & Protokolle', () => {
  it('liest nur gültige, wiederherstellbare Filter aus der URL', () => {
    const filters = auditFiltersFromQueryParams(
      convertToParamMap({
        from: '2026-08-01',
        to: '2026-08-31',
        actor: 'user-1',
        entity: 'sale',
        event: 'sale_finalized',
        pageSize: '500',
      }),
    );

    expect(filters).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      actorId: 'user-1',
      entityType: 'sale',
      eventType: 'sale_finalized',
      pageSize: 100,
    });
  });

  it('wandelt Tagesgrenzen in ISO-Zeitstempel um und übergibt keine leeren Filter', () => {
    expect(
      toBusinessEventFilter('workspace-1', {
        from: '2026-08-01',
        to: '2026-08-31',
        actorId: '',
        entityType: '',
        eventType: '',
        pageSize: 50,
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      pageSize: 50,
    });
  });

  it.each<[WorkspaceRole, boolean]>([
    ['owner', true],
    ['admin', true],
    ['accountant', true],
    ['member', false],
    ['fulfillment', false],
    ['readonly', false],
  ])('erteilt der Rolle %s den erwarteten globalen Exportzugriff', (role, expected) => {
    expect(canExportAuditData(role)).toBe(expected);
  });
});
