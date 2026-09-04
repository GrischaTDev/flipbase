import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import {
  BusinessEntityType,
  BusinessEvent,
  BusinessEventPage,
} from '../../../../core/models/business-event.models';
import { RecordHistoryContainer } from './record-history.container';

const oldEvent: BusinessEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'workspace-1',
  entityType: 'purchase',
  entityId: 'purchase-1',
  eventType: 'purchase_finalized',
  eventLabel: 'Einkauf abgeschlossen',
  actorId: null,
  reason: null,
  changes: {},
  correlationId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-09-04T10:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createContainer(listEntityEvents: (filter: unknown) => Promise<BusinessEventPage>) {
  const component = Object.create(RecordHistoryContainer.prototype) as RecordHistoryContainer;
  const entityId = signal('purchase-1');
  Object.assign(component, {
    entityType: signal<BusinessEntityType>('purchase'),
    entityId,
    workspaceService: { currentWorkspace: signal({ id: 'workspace-1' }) },
    businessEventService: { listEntityEvents },
    requestVersion: 0,
    events: signal<readonly BusinessEvent[]>([oldEvent]),
    nextCursor: signal<string | null>('old-cursor'),
    loading: signal(false),
    error: signal<string | null>(null),
  });
  return { component, entityId };
}

describe('RecordHistoryContainer', () => {
  it('leert den alten Verlauf und ignoriert verspätete Antworten eines anderen Datensatzes', async () => {
    const first = deferred<BusinessEventPage>();
    const second = deferred<BusinessEventPage>();
    const listEntityEvents = vi
      .fn<(filter: unknown) => Promise<BusinessEventPage>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { component, entityId } = createContainer(listEntityEvents);

    component.reload();
    expect(component.events()).toEqual([]);
    expect(component.nextCursor()).toBeNull();

    entityId.set('purchase-2');
    component.reload();
    first.resolve({ events: [oldEvent], nextCursor: 'stale-cursor' });
    await Promise.resolve();

    expect(component.events()).toEqual([]);
    expect(component.nextCursor()).toBeNull();

    const currentEvent = {
      ...oldEvent,
      id: '33333333-3333-4333-8333-333333333333',
      entityId: 'purchase-2',
    };
    second.resolve({ events: [currentEvent], nextCursor: null });
    await Promise.resolve();

    expect(component.events()).toEqual([currentEvent]);
    expect(listEntityEvents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ entityId: 'purchase-2', workspaceId: 'workspace-1' }),
    );
  });

  it('leert bereits sichtbare Daten nach einem Ladefehler', async () => {
    const listEntityEvents = vi.fn(async () => {
      throw new Error('Offline');
    });
    const { component } = createContainer(listEntityEvents);

    component.reload();
    await Promise.resolve();

    expect(component.events()).toEqual([]);
    expect(component.nextCursor()).toBeNull();
    expect(component.error()).toBe('Offline');
    expect(component.loading()).toBe(false);
  });
});
