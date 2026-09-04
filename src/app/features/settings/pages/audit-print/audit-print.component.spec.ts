import '@angular/compiler';
import { signal } from '@angular/core';
import { convertToParamMap } from '@angular/router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BusinessEvent } from '../../../../core/models/business-event.models';
import {
  AuditPrintComponent,
  printAuditDocument,
  summarizeAuditEvent,
} from './audit-print.component';
import { auditFiltersFromQueryParams } from '../data-and-audit/data-and-audit.component';

function createLoadFixture(
  role: 'owner' | 'admin' | 'accountant' | 'member' | 'fulfillment' | 'readonly',
  query: Record<string, string> = {},
) {
  const queryParamMap = convertToParamMap(query);
  const listEntityEvents = vi.fn(async () => ({ events: [], nextCursor: null }));
  const listEvents = vi.fn(async () => ({ events: [], nextCursor: null }));
  const component = Object.create(AuditPrintComponent.prototype) as AuditPrintComponent;
  Object.assign(component, {
    route: { snapshot: { queryParamMap } },
    workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    memberService: { currentUserRole: () => role, members: () => [] },
    eventsService: { listEntityEvents, listEvents },
    filters: auditFiltersFromQueryParams(queryParamMap),
    events: signal([]),
    isLoading: signal(false),
    error: signal<string | null>(null),
    generatedAt: signal('2026-01-01T00:00:00.000Z'),
    loadSequence: 0,
  });
  const load = () =>
    (
      component as unknown as {
        load: (workspaceId: string) => Promise<void>;
      }
    ).load('workspace-1');
  return { component, listEntityEvents, listEvents, load };
}

describe('AuditPrintComponent', () => {
  const previousTimezone = process.env['TZ'];

  beforeAll(() => {
    process.env['TZ'] = 'Europe/Berlin';
  });

  afterAll(() => {
    if (previousTimezone === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previousTimezone;
  });

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

  it('lädt einen direkt verlinkten Verkaufsbeleg auch für normale Mitglieder', async () => {
    const fixture = createLoadFixture('member', {
      entityType: 'sale',
      entityId: 'sale-1',
    });

    await fixture.load();

    expect(fixture.listEntityEvents).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      entityType: 'sale',
      entityId: 'sale-1',
      cursor: undefined,
      pageSize: 100,
    });
    expect(fixture.listEvents).not.toHaveBeenCalled();
    expect(fixture.component.error()).toBeNull();
  });

  it('blockiert die globale Druckansicht weiterhin für normale Mitglieder', async () => {
    const fixture = createLoadFixture('member');

    await fixture.load();

    expect(fixture.listEntityEvents).not.toHaveBeenCalled();
    expect(fixture.listEvents).not.toHaveBeenCalled();
    expect(fixture.component.error()).toContain('globale Druckansicht');
  });

  it('sendet globale winterliche Druckfilter für Admins als lokale Tagesgrenzen in UTC', async () => {
    const fixture = createLoadFixture('admin', { from: '2026-01-15', to: '2026-01-15' });

    await fixture.load();

    expect(fixture.listEvents).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      from: '2026-01-14T23:00:00.000Z',
      to: '2026-01-15T22:59:59.999Z',
      pageSize: 100,
    });
  });
});
