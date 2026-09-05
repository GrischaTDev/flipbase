import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BusinessEntityType,
  BusinessEvent,
  BusinessEventPage,
} from '../../../../core/models/business-event.models';
import { RecordHistoryContainer } from './record-history.container';
import { AuthService } from '../../../../core/services/auth.service';
import { BusinessEventService } from '../../../../core/services/business-event.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { RecordHistoryComponent } from '../../../../shared/components/record-history/record-history.component';
import { RecordTimelineComponent } from '../record-timeline/record-timeline.component';
import { RecordTimelineService } from '../../services/record-timeline.service';

interface AngularBindingMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const bindingSnapshots = new Map<unknown, AngularBindingMetadata>();

// Der Vitest-Fallback benötigt dieselbe Signal-Metadatenbrücke wie die
// vorhandenen Komponenten-Integrationstests. Die echten Templates bleiben aktiv.
function registerBindings(
  component: unknown,
  inputs: readonly string[],
  outputs: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularBindingMetadata }).ɵcmp;
  bindingSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputs.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputs.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputs.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//u, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

beforeEach(() => {
  registerBindings(RecordHistoryContainer, ['entityType', 'entityId', 'heading']);
  registerBindings(RecordTimelineComponent, ['entityType', 'entityId']);
  registerBindings(
    RecordHistoryComponent,
    ['heading', 'events', 'loading', 'error', 'hasMore'],
    ['retryRequested', 'loadMoreRequested'],
  );
});

afterEach(() => {
  TestBed.resetTestingModule();
  for (const [component, snapshot] of bindingSnapshots) {
    Object.assign((component as { ɵcmp: AngularBindingMetadata }).ɵcmp, snapshot);
  }
  bindingSnapshots.clear();
});

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

async function createIntegratedContainer(entityType: BusinessEntityType, entityId: string) {
  const listEntityEvents = vi.fn(async () => ({
    events: [{ ...oldEvent, entityType, entityId, eventLabel: 'Bisheriges Geschäftsereignis' }],
    nextCursor: 'legacy-next',
  }));
  const list = vi.fn(async () => ({
    entries: [
      {
        id: 'comment-1',
        kind: 'comment',
        createdAt: oldEvent.createdAt,
        actorName: 'Kim',
        body: 'Gemeinsame Absprache',
        event: null,
      },
    ],
    nextCursor: null,
  }));
  const fixture = TestBed.configureTestingModule({
    imports: [RecordHistoryContainer],
    providers: [
      { provide: BusinessEventService, useValue: { listEntityEvents } },
      { provide: RecordTimelineService, useValue: { list } },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'workspace-1' }) } },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-1' }) } },
    ],
  }).createComponent(RecordHistoryContainer);
  fixture.componentRef.setInput('entityType', entityType);
  fixture.componentRef.setInput('entityId', entityId);
  fixture.componentRef.setInput('heading', 'Bisheriger Verlauf');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, listEntityEvents, list };
}

describe('RecordHistoryContainer', () => {
  it.each(['purchase', 'sale'] as const)(
    'bindet für %s die echte Chronik an den gewählten Datensatz',
    async (entityType) => {
      const entityId = `${entityType}-selected`;
      const { element, list, listEntityEvents } = await createIntegratedContainer(
        entityType,
        entityId,
      );
      expect(list).toHaveBeenCalledExactlyOnceWith('workspace-1', entityType, entityId, undefined);
      expect(listEntityEvents).not.toHaveBeenCalled();
      expect(element.querySelector('app-record-history')).toBeNull();
      const timeline = element.querySelector('app-record-timeline')!;
      expect(timeline.querySelector('h2')?.textContent).toBe('Chronik');
      expect(timeline.querySelector('textarea')?.id).toBe(`record-comment-${entityId}`);
      expect(timeline.querySelector('article')?.textContent).toContain('Gemeinsame Absprache');
    },
  );

  it.each(['inventory_item', 'export'] as const)(
    'erhält für %s die bisherige Historie einschließlich Nachladen',
    async (entityType) => {
      const entityId = `${entityType}-selected`;
      const { fixture, element, list, listEntityEvents } = await createIntegratedContainer(
        entityType,
        entityId,
      );
      expect(list).not.toHaveBeenCalled();
      expect(listEntityEvents).toHaveBeenCalledExactlyOnceWith({
        workspaceId: 'workspace-1',
        entityType,
        entityId,
        cursor: undefined,
        pageSize: 20,
      });
      expect(element.querySelector('app-record-timeline')).toBeNull();
      const history = element.querySelector('app-record-history')!;
      expect(history.querySelector('h2')?.textContent).toContain('Bisheriger Verlauf');
      expect(history.textContent).toContain('Bisheriges Geschäftsereignis');
      const more = [...history.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Weitere Änderungen laden'),
      )!;
      more.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(listEntityEvents).toHaveBeenNthCalledWith(2, {
        workspaceId: 'workspace-1',
        entityType,
        entityId,
        cursor: 'legacy-next',
        pageSize: 20,
      });
      expect(list).not.toHaveBeenCalled();
    },
  );

  it('wechselt im selben Container von der Historie über den Einkauf zum Verkauf', async () => {
    const { fixture, element, list, listEntityEvents } = await createIntegratedContainer(
      'inventory_item',
      'item-selected',
    );
    fixture.componentRef.setInput('entityType', 'purchase');
    fixture.componentRef.setInput('entityId', 'purchase-selected');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-record-history')).toBeNull();
    expect(list).toHaveBeenLastCalledWith(
      'workspace-1',
      'purchase',
      'purchase-selected',
      undefined,
    );
    expect(element.querySelector('textarea')?.id).toBe('record-comment-purchase-selected');
    fixture.componentRef.setInput('entityType', 'sale');
    fixture.componentRef.setInput('entityId', 'sale-selected');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith('workspace-1', 'sale', 'sale-selected', undefined);
    expect(element.querySelector('textarea')?.id).toBe('record-comment-sale-selected');
    expect(listEntityEvents).toHaveBeenCalledTimes(1);
    expect(element.querySelector('app-record-history')).toBeNull();
  });

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
