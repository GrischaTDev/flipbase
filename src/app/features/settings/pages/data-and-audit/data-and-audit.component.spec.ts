import '@angular/compiler';
import { convertToParamMap } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkspaceRole } from '../../../../core/models/flipbase.models';
import {
  auditAccessState,
  auditFiltersFromQueryParams,
  canExportAuditData,
  toBusinessEventFilter,
} from './data-and-audit.component';

describe('Daten & Protokolle', () => {
  const previousTimezone = process.env['TZ'];

  beforeAll(() => {
    process.env['TZ'] = 'Europe/Berlin';
  });

  afterAll(() => {
    if (previousTimezone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previousTimezone;
  });

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

  it('wandelt sommerliche lokale Tagesgrenzen für Protokoll und ZIP DST-sicher in UTC um', () => {
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
      from: '2026-07-31T22:00:00.000Z',
      to: '2026-08-31T21:59:59.999Z',
      pageSize: 50,
    });
  });

  it('wandelt winterliche lokale Tagesgrenzen DST-sicher in UTC um', () => {
    expect(
      toBusinessEventFilter('workspace-1', {
        from: '2026-01-15',
        to: '2026-01-15',
        actorId: '',
        entityType: '',
        eventType: '',
        pageSize: 25,
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      from: '2026-01-14T23:00:00.000Z',
      to: '2026-01-15T22:59:59.999Z',
      pageSize: 25,
    });
  });

  it.each<[
    boolean,
    boolean,
    WorkspaceRole | null,
    'loading' | 'authorized' | 'forbidden',
  ]>([
    [false, false, null, 'loading'],
    [false, false, 'owner', 'loading'],
    [false, true, 'owner', 'authorized'],
    [false, true, 'admin', 'authorized'],
    [false, true, 'accountant', 'authorized'],
    [false, true, 'member', 'forbidden'],
    [false, true, null, 'forbidden'],
    [true, false, null, 'authorized'],
  ])(
    'bewertet Demo=%s, Rollenstatus geladen=%s und Rolle=%s als %s',
    (demoMode, membersResolved, role, expected) => {
      expect(auditAccessState(demoMode, membersResolved, role)).toBe(expected);
    },
  );

  it.each<[WorkspaceRole | null, boolean]>([
    ['owner', true],
    ['admin', true],
    ['accountant', true],
    ['member', false],
    ['fulfillment', false],
    ['readonly', false],
    [null, false],
  ])('erteilt der Rolle %s den erwarteten globalen Exportzugriff', (role, expected) => {
    expect(canExportAuditData(role)).toBe(expected);
  });
  it('hält Workspace-Aufbewahrung aus Daten & Protokolle heraus und bündelt Zusatzexporte', async () => {
    const template = await readFile(
      new URL('./data-and-audit.component.html', import.meta.url),
      'utf8',
    );

    expect(template).not.toContain('Aufbewahrung & Löschung');
    expect(template).not.toContain('<app-workspace-retention');
    expect(template).toContain('Weitere Exporte');
  });
});
