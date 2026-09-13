import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { MockDataStoreService } from '../../../core/services/mock-data-store.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import {
  mapBusinessEventLabel,
  redactBusinessEventValue,
} from '../../../core/services/business-event.service';
import { Json } from '../../../core/models/supabase.types';
import {
  canSubmitComment,
  compareTimelineEntries,
  decodeTimelineCursor,
  encodeTimelineCursor,
  RecordTimelineEntityType,
  RecordTimelineEntry,
  RecordTimelinePage,
} from '../models/record-timeline.models';

const PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class RecordTimelineService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly workspace = inject(WorkspaceService);

  async list(
    workspaceId: string,
    entityType: RecordTimelineEntityType,
    entityId: string,
    cursor?: string,
  ): Promise<RecordTimelinePage> {
    this.assertScope(workspaceId, entityId);
    const identity = this.auth.currentUser()?.id;
    const position = cursor ? decodeTimelineCursor(cursor) : null;
    if (this.mockStore.isDemoMode()) {
      const comments: RecordTimelineEntry[] = this.mockStore
        .getRecordComments(workspaceId, entityType, entityId)
        .map((comment) => ({
          id: comment.id,
          kind: 'comment' as const,
          createdAt: comment.createdAt,
          actorName: comment.actorName,
          body: comment.body,
          event: null,
        }));
      const captured =
        entityType === 'purchase'
          ? this.mockStore.getPackageCaptureEvents(workspaceId, entityId)
          : [];
      const events: RecordTimelineEntry[] = captured.map((event) => ({
        id: event.id,
        kind: 'event',
        createdAt: event.createdAt,
        actorName: 'Demo',
        body: null,
        event: {
          ...event,
          entityType,
          actorId: event.actorId ?? null,
          reason: event.reason ?? null,
          eventLabel: mapBusinessEventLabel(event.eventType),
          changes: event.changes as Json,
        },
      }));
      const entries = [...comments, ...events]
        .sort(compareTimelineEntries)
        .filter((entry) => !position || compareTimelineEntries(entry, position) > 0)
        .slice(0, PAGE_SIZE);
      return this.page(entries);
    }
    const { data, error } = await this.supabase.client.rpc('list_record_timeline', {
      p_workspace_id: workspaceId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_page_size: PAGE_SIZE,
      ...(position
        ? {
            p_cursor_created_at: position.createdAt,
            p_cursor_kind: position.kind,
            p_cursor_id: position.id,
          }
        : {}),
    });
    this.assertScope(workspaceId, entityId);
    if (identity !== this.auth.currentUser()?.id)
      throw new Error('Die Anmeldung hat sich geändert.');
    if (error) throw new Error('Die Chronik konnte nicht geladen werden. Bitte erneut versuchen.');
    return this.page(
      (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind === 'comment' ? 'comment' : 'event',
        createdAt: row.created_at,
        actorName: row.actor_name || 'Mitglied',
        body: row.body ?? null,
        event:
          row.kind === 'event'
            ? {
                id: row.id,
                workspaceId,
                entityType,
                entityId,
                eventType: row.event_type,
                eventLabel: mapBusinessEventLabel(row.event_type),
                actorId: row.actor_id ?? null,
                reason: row.reason ?? null,
                changes: redactBusinessEventValue(row.changes) as Json,
                correlationId: row.correlation_id,
                createdAt: row.created_at,
              }
            : null,
      })),
    );
  }

  async addComment(
    workspaceId: string,
    entityType: RecordTimelineEntityType,
    entityId: string,
    body: string,
  ): Promise<RecordTimelineEntry> {
    this.assertScope(workspaceId, entityId);
    if (!canSubmitComment(body))
      throw new Error('Bitte einen Kommentar mit 1 bis 5000 Zeichen eingeben.');
    if (this.workspace.currentWorkspace()?.archived_at)
      throw new Error('Dieser Workspace ist archiviert.');
    const actorName = this.auth.profile()?.full_name?.trim() || 'Mitglied';
    if (this.mockStore.isDemoMode()) {
      const saved = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        entityType,
        entityId,
        createdAt: new Date().toISOString(),
        actorName,
        body: body.trim(),
      };
      this.mockStore.addRecordComment(saved);
      return {
        id: saved.id,
        kind: 'comment',
        createdAt: saved.createdAt,
        actorName,
        body: saved.body,
        event: null,
      };
    }
    const authorId = this.auth.currentUser()?.id;
    if (!authorId) throw new Error('Bitte erneut anmelden, um einen Kommentar zu schreiben.');
    const { data, error } = await this.supabase.client
      .from('record_comments')
      .insert({
        workspace_id: workspaceId,
        purchase_id: entityType === 'purchase' ? entityId : null,
        sale_id: entityType === 'sale' ? entityId : null,
        author_id: authorId,
        body: body.trim(),
      })
      .select('id, created_at, body')
      .single();
    this.assertScope(workspaceId, entityId);
    if (authorId !== this.auth.currentUser()?.id)
      throw new Error('Die Anmeldung hat sich geändert.');
    if (error || !data)
      throw new Error('Der Kommentar konnte nicht gespeichert werden. Dein Text bleibt erhalten.');
    return {
      id: data.id,
      kind: 'comment',
      createdAt: data.created_at,
      actorName,
      body: data.body,
      event: null,
    };
  }
  private page(entries: readonly RecordTimelineEntry[]): RecordTimelinePage {
    const last = entries.at(-1);
    return {
      entries,
      nextCursor: entries.length === PAGE_SIZE && last ? encodeTimelineCursor(last) : null,
    };
  }
  private assertScope(workspaceId: string, entityId: string): void {
    if (!entityId || !workspaceId || this.workspace.currentWorkspace()?.id !== workspaceId)
      throw new Error('Die Chronik gehört nicht zum aktiven Workspace.');
  }
}
