import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RecordTimelineComponent } from './record-timeline.component';
import { RecordTimelineEntry, RecordTimelinePage } from '../../models/record-timeline.models';
import { RecordTimelineService } from '../../services/record-timeline.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let buttonInputMetadata: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    const sharedResource = new Map([
      [
        './record-history.component.html',
        '../../../../shared/components/record-history/record-history.component.html',
      ],
      ['./button.component.html', '../../../../shared/components/button/button.component.html'],
      ['./button.component.scss', '../../../../shared/components/button/button.component.scss'],
    ]).get(url);
    return readFile(new URL(sharedResource ?? url, import.meta.url), 'utf8');
  });
  const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  buttonInputMetadata = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  };
  const inputNames = [
    'variant',
    'size',
    'loading',
    'disabled',
    'fullWidth',
    'ariaExpanded',
    'ariaControls',
  ];
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
});
afterAll(() => {
  if (!buttonInputMetadata) return;
  const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = buttonInputMetadata.inputs;
  metadata.declaredInputs = buttonInputMetadata.declaredInputs;
});
afterEach(() => TestBed.resetTestingModule());

const comment: RecordTimelineEntry = {
  id: 'c1',
  kind: 'comment',
  createdAt: '2026-09-05T10:00:00Z',
  actorName: 'Alex',
  body: 'Erhalten',
  event: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const component = Object.create(RecordTimelineComponent.prototype) as RecordTimelineComponent;
  const workspace = signal<{ id: string }>({ id: 'w1' });
  const entityId = signal('p1');
  const list = vi.fn();
  const addComment = vi.fn();
  Object.assign(component, {
    entityType: signal('purchase'),
    entityId,
    workspace: { currentWorkspace: workspace },
    auth: { currentUser: signal({ id: 'u1' }) },
    timeline: { list, addComment },
    entries: signal<readonly RecordTimelineEntry[]>([]),
    nextCursor: signal<string | null>(null),
    loading: signal(false),
    loadError: signal<string | null>(null),
    postError: signal<string | null>(null),
    draft: signal('Mein Text'),
    posting: signal(false),
    expandedId: signal<string | null>(null),
    contextVersion: 0,
    loadVersion: 0,
  });
  return { component, workspace, entityId, list, addComment };
}
describe('RecordTimelineComponent', () => {
  it('gruppiert Tage, maskiert Klartext und öffnet fachliche Details zugänglich', async () => {
    const timeline = TestBed.configureTestingModule({
      imports: [RecordTimelineComponent],
      providers: [
        {
          provide: RecordTimelineService,
          useValue: { list: vi.fn(async () => ({ entries: [], nextCursor: null })) },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'w1' }) } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u1' }) } },
      ],
    }).createComponent(RecordTimelineComponent);
    Object.assign(timeline.componentInstance, {
      entityType: signal('purchase'),
      entityId: signal('p1'),
    });
    timeline.detectChanges();
    await timeline.whenStable();
    const component = timeline.componentInstance;
    const initialElement = timeline.nativeElement as HTMLElement;
    expect(initialElement.querySelector(':scope > section > h2')?.textContent).toContain('Chronik');
    expect(initialElement.querySelector('textarea')?.placeholder).toBe(
      'Hinterlasse einen Kommentar …',
    );
    expect(initialElement.querySelector('[data-timeline-visibility-note]')?.textContent).toContain(
      'Nur du und andere Mitarbeiter können Kommentare sehen',
    );
    const postButton = initialElement.querySelector(
      'app-button button',
    ) as HTMLButtonElement | null;
    expect(postButton?.classList).toContain('linear-btn-primary');
    expect(postButton?.className).not.toContain('bg-[#202223]');
    component.entries.set([
      { ...comment, body: '<img src=x onerror=alert(1)>' },
      {
        ...comment,
        id: 'event',
        kind: 'event',
        createdAt: '2026-09-04T10:00:00Z',
        event: {
          id: 'event',
          workspaceId: 'w1',
          entityId: 'p1',
          entityType: 'purchase',
          eventType: 'purchase_corrected',
          eventLabel: 'Einkauf korrigiert',
          actorId: 'u1',
          reason: null,
          changes: { purchase_price: { before: 10, after: 12 } },
          correlationId: 'correlation',
          createdAt: '2026-09-04T10:00:00Z',
        },
      },
    ]);
    timeline.detectChanges();
    const element = timeline.nativeElement as HTMLElement;
    expect(element.querySelectorAll('h3')).toHaveLength(2);
    expect(element.querySelector('article')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element.querySelector('article img')).toBeNull();
    expect(element.querySelector('time')?.getAttribute('title')).toContain('2026');
    const eventTime = element.querySelector('time[datetime="2026-09-04T10:00:00Z"]');
    expect(eventTime?.textContent?.trim()).toMatch(/^\d{2}:\d{2}$/u);
    component.toggleDetails('event');
    timeline.detectChanges();
    expect(element.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(element.querySelector('dl')?.textContent).toContain('Einkaufspreis');
    expect(element.querySelector('dl')?.textContent).toContain('Nachher: 12');
  });
  it('lädt nach dem Speichern neu und bewahrt einen ungesendeten Kommentar', async () => {
    const refreshed = { ...comment, id: 'saved', body: 'Neu gespeichert' };
    const list = vi.fn().mockResolvedValue({ entries: [comment], nextCursor: null });
    const timeline = TestBed.configureTestingModule({
      imports: [RecordTimelineComponent],
      providers: [
        { provide: RecordTimelineService, useValue: { list } },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'w1' }) } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'u1' }) } },
      ],
    }).createComponent(RecordTimelineComponent);
    const refreshKey = signal(0);
    Object.assign(timeline.componentInstance, {
      entityType: signal('purchase'),
      entityId: signal('p1'),
      refreshKey,
    });
    timeline.detectChanges();
    await timeline.whenStable();
    timeline.componentInstance.draft.set('Noch nicht posten');
    list.mockResolvedValue({ entries: [refreshed, comment], nextCursor: null });
    timeline.componentInstance.posting.set(true);
    refreshKey.set(1);
    timeline.detectChanges();
    await timeline.whenStable();
    expect(timeline.componentInstance.entries()).toEqual([comment]);
    timeline.componentInstance.posting.set(false);
    timeline.detectChanges();
    await timeline.whenStable();
    expect(timeline.componentInstance.entries()).toEqual([refreshed, comment]);
    expect(timeline.componentInstance.draft()).toBe('Noch nicht posten');
  });
  it('bewahrt den Entwurf bei Fehler und verhindert doppeltes Posten', async () => {
    const { component, addComment } = fixture();
    const pending = deferred<RecordTimelineEntry>();
    addComment.mockReturnValue(pending.promise);
    const first = component.post();
    void component.post();
    expect(addComment).toHaveBeenCalledTimes(1);
    pending.reject(new Error('Offline'));
    await first;
    expect(component.draft()).toBe('Mein Text');
    expect(component.postError()).toBeTruthy();
    addComment.mockResolvedValue(comment);
    await component.post();
    expect(component.entries()).toEqual([comment]);
    expect(component.draft()).toBe('');
  });
  it('ignoriert verspätete Posts und Ladeantworten nach Workspace-/Datensatzwechsel', async () => {
    const { component, workspace, entityId, list, addComment } = fixture();
    const load = deferred<RecordTimelinePage>();
    list.mockReturnValue(load.promise);
    component.reload();
    workspace.set({ id: 'w2' });
    load.resolve({ entries: [comment], nextCursor: 'old' });
    await Promise.resolve();
    expect(component.entries()).toEqual([]);
    component.loading.set(false);
    const post = deferred<RecordTimelineEntry>();
    addComment.mockReturnValue(post.promise);
    const pending = component.post();
    entityId.set('p2');
    component.draft.set('Neuer Datensatz');
    post.resolve(comment);
    await pending;
    expect(component.entries()).toEqual([]);
    expect(component.draft()).toBe('Neuer Datensatz');
  });
  it('erhält geladene Einträge und Cursor bei einem Fehler der Folgeseite', async () => {
    const { component, list } = fixture();
    component.entries.set([comment]);
    component.nextCursor.set('next');
    list.mockRejectedValue(new Error('Offline'));
    component.loadMore();
    await Promise.resolve();
    expect(component.entries()).toEqual([comment]);
    expect(component.nextCursor()).toBe('next');
    expect(component.loadError()).toBeTruthy();
  });
  it('führt überlappende Folgeseiten ohne doppelte Kommentare zusammen', async () => {
    const { component, list } = fixture();
    component.entries.set([comment]);
    component.nextCursor.set('next');
    list.mockResolvedValue({
      entries: [comment, { ...comment, id: 'c2', createdAt: '2026-09-04T10:00:00Z' }],
      nextCursor: null,
    });
    component.loadMore();
    await Promise.resolve();
    expect(component.entries().map((e) => e.id)).toEqual(['c1', 'c2']);
  });
});
