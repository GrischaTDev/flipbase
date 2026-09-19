import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { RecordTimelineService } from './record-timeline.service';
import {
  canSubmitComment,
  mergeTimelineEntries,
  encodeTimelineCursor,
  decodeTimelineCursor,
  RecordTimelineEntry,
} from '../models/record-timeline.models';

const entry = (
  id: string,
  kind: 'event' | 'comment',
  createdAt = '2026-09-05T10:00:00.000Z',
): RecordTimelineEntry => ({
  id,
  kind,
  createdAt,
  actorName: 'Mitglied',
  body: kind === 'comment' ? 'Hallo' : null,
  event: null,
});

describe('RecordTimelineService', () => {
  const rpc = vi.fn();
  const from = vi.fn();
  const workspace = signal({ id: 'workspace-1' });
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    workspace.set({ id: 'workspace-1' });
    TestBed.configureTestingModule({
      providers: [
        RecordTimelineService,
        { provide: SupabaseService, useValue: { client: { rpc, from } } },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({ id: 'user-1' }),
            profile: signal({ full_name: 'Alex' }),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('ordnet beide Arten absteigend und entfernt nur echte Duplikate', () => {
    const older = entry('one', 'comment', '2026-09-04T10:00:00Z');
    const event = entry('same', 'event');
    const newer = entry('same', 'comment', '2026-09-06T10:00:00Z');
    expect(mergeTimelineEntries([older, event], [newer, event]).map((e) => e.kind)).toEqual([
      'comment',
      'event',
      'comment',
    ]);
  });
  it('bewahrt bei gleichem Zeitpunkt Art und ID im Cursor', () => {
    const tied = [entry('b', 'comment'), entry('a', 'event'), entry('a', 'comment')];
    expect(mergeTimelineEntries([], tied).map((e) => `${e.kind}:${e.id}`)).toEqual([
      'event:a',
      'comment:b',
      'comment:a',
    ]);
    expect(decodeTimelineCursor(encodeTimelineCursor(tied[0]))).toEqual({
      createdAt: tied[0].createdAt,
      kind: 'comment',
      id: 'b',
    });
    expect(() => decodeTimelineCursor('kaputt')).toThrow();
  });
  it('weist Leerraum und überlange Kommentare vor dem Schreiben ab', async () => {
    expect(canSubmitComment(' \n\t')).toBe(false);
    expect(canSubmitComment('a'.repeat(5000))).toBe(true);
    expect(canSubmitComment('a'.repeat(5001))).toBe(false);
    await expect(
      TestBed.inject(RecordTimelineService).addComment('workspace-1', 'purchase', 'p1', '  '),
    ).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it('meldet verweigerte Rechte und verwirft Antworten nach Workspace-Wechsel', async () => {
    const service = TestBed.inject(RecordTimelineService);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Keine Berechtigung' } });
    await expect(service.list('workspace-1', 'purchase', 'p1')).rejects.toThrow();
    let resolve!: (value: unknown) => void;
    rpc.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = service.list('workspace-1', 'purchase', 'p1');
    workspace.set({ id: 'workspace-2' });
    resolve({ data: [], error: null });
    await expect(pending).rejects.toThrow();
  });

  it('übernimmt RPC-Reihenfolge, schützt Ereignisdetails und sendet vollständige Cursor', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(20 - index).padStart(12, '0')}`,
      kind: index === 1 ? 'event' : 'comment',
      created_at: '2026-09-05T10:00:00.000123Z',
      actor_name: 'Kim',
      body: 'Notiz',
      event_type: 'purchase_corrected',
      actor_id: 'user-2',
      reason: null,
      changes: {
        api_key: { before: 'privat', after: 'privat2' },
        purchase_price: { before: 10, after: 12 },
      },
      correlation_id: 'correlation',
    }));
    rpc
      .mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const service = TestBed.inject(RecordTimelineService);
    const first = await service.list('workspace-1', 'purchase', 'p1');
    expect(first.entries.slice(0, 3).map((e) => e.kind)).toEqual(['comment', 'event', 'comment']);
    expect(JSON.stringify(first.entries[1].event?.changes)).not.toContain('privat');
    expect(first.entries[1].event?.eventLabel).toBe('Einkauf korrigiert');
    await service.list('workspace-1', 'purchase', 'p1', first.nextCursor!);
    expect(rpc).toHaveBeenLastCalledWith(
      'list_record_timeline',
      expect.objectContaining({
        p_cursor_kind: 'comment',
        p_cursor_id: rows[19].id,
        p_cursor_created_at: rows[19].created_at,
      }),
    );
  });

  it('speichert nur eigene Eingabespalten und verwirft eine verspätete Speicherung', async () => {
    const insert = vi.fn();
    const select = vi.fn();
    const single = vi.fn();
    from.mockReturnValue({ insert });
    insert.mockReturnValue({ select });
    select.mockReturnValue({ single });
    single.mockResolvedValueOnce({
      data: { id: 'saved', created_at: '2026-09-05T10:00:00Z', body: 'Text' },
      error: null,
    });
    const service = TestBed.inject(RecordTimelineService);
    expect(await service.addComment('workspace-1', 'sale', 's1', ' Text ')).toMatchObject({
      body: 'Text',
      actorName: 'Alex',
    });
    expect(insert).toHaveBeenCalledWith({
      workspace_id: 'workspace-1',
      sale_id: 's1',
      purchase_id: null,
      author_id: 'user-1',
      body: 'Text',
    });
    let resolve!: (value: unknown) => void;
    single.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = service.addComment('workspace-1', 'sale', 's1', 'Text');
    workspace.set({ id: 'workspace-2' });
    resolve({
      data: { id: 'late', created_at: '2026-09-05T10:00:00Z', body: 'Text' },
      error: null,
    });
    await expect(pending).rejects.toThrow();
  });

  it('ordnet Mikrosekunden vor der Art und unterstützt volle Unicode-Zeichen', () => {
    const earlier = entry('e', 'event', '2026-09-05T10:00:00.000001Z');
    const later = entry('c', 'comment', '2026-09-05T10:00:00.000002Z');
    expect(mergeTimelineEntries([earlier], [later]).map((e) => e.id)).toEqual(['c', 'e']);
    expect(canSubmitComment('😀'.repeat(5000))).toBe(true);
    expect(canSubmitComment('😀'.repeat(5001))).toBe(false);
  });
});
