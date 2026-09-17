import { Injectable, inject } from '@angular/core';
import {
  BusinessEntityType,
  BusinessEvent,
  BusinessEventFilter,
  BusinessEventPage,
  EntityBusinessEventFilter,
} from '../models/business-event.models';
import { Database, Json } from '../models/supabase.types';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WorkspaceService } from './workspace.service';

type BusinessEventRow = Database['public']['Functions']['list_business_events']['Returns'][number];

interface BusinessEventCursor {
  readonly createdAt: string;
  readonly id: string;
}

const EVENT_LABELS: Readonly<Record<string, string>> = {
  purchase_draft_created: 'Einkauf als Entwurf erstellt',
  purchase_draft_updated: 'Einkaufsentwurf geändert',
  purchase_costing_finalized: 'Einkauf abgeschlossen',
  purchase_finalized: 'Einkauf abgeschlossen',
  purchase_corrected: 'Einkauf korrigiert',
  purchase_reopened: 'Einkauf wieder geöffnet',
  purchase_ordered: 'Einkauf als bestellt markiert',
  purchase_arrived: 'Einkauf als angekommen markiert',
  purchase_seller_details_updated: 'Verkäuferangaben ergänzt',
  purchase_document_added: 'Beleg hinzugefügt',
  purchase_document_removed: 'Beleg entfernt',
  purchase_package_contents_captured: 'Paketinhalt erfasst',
  purchase_tracking_added: 'Sendungsverfolgung hinzugefügt',
  purchase_tracking_updated: 'Sendungsverfolgung aktualisiert',
  purchase_tracking_removed: 'Sendungsverfolgung entfernt',
  purchase_costing_legacy_migrated: 'Altdaten des Einkaufs übernommen',
  inventory_received: 'Bestand erfasst',
  inventory_corrected: 'Bestand korrigiert',
  inventory_item_archived: 'Artikel archiviert',
  inventory_item_restored: 'Artikel aus Archiv geholt',
  sale_finalized: 'Verkauf abgeschlossen',
  sale_recorded: 'Verkauf erfasst',
  sale_refund_updated: 'Erstattung aktualisiert',
  sale_return_recorded: 'Retoure erfasst',
  sale_voided: 'Verkauf storniert',
  sale_returned: 'Retoure erfasst',
  return_created: 'Retoure erfasst',
  workspace_archived: 'Workspace archiviert',
  workspace_restored: 'Workspace wiederhergestellt',
  audit_export_created: 'Datenarchiv erstellt',
};

export function mapBusinessEventLabel(eventType: string): string {
  const known = EVENT_LABELS[eventType];
  if (known) return known;
  const words = eventType.replaceAll('_', ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unbekannter Vorgang';
}

export function redactBusinessEventValue(value: unknown, key = ''): unknown {
  if (/token|secret|password|api[_-]?key|authorization|webhook[_-]?url/iu.test(key)) {
    return '[geschützt]';
  }
  if (Array.isArray(value)) return value.map((entry) => redactBusinessEventValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactBusinessEventValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export function encodeBusinessEventCursor(createdAt: string, id: string): string {
  return btoa(JSON.stringify([createdAt, id]));
}

export function decodeBusinessEventCursor(cursor: string): BusinessEventCursor {
  try {
    const parsed: unknown = JSON.parse(atob(cursor));
    if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error();
    const [createdAt, id] = parsed;
    if (
      typeof createdAt !== 'string' ||
      Number.isNaN(Date.parse(createdAt)) ||
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id)
    ) {
      throw new Error();
    }
    return { createdAt, id };
  } catch {
    throw new Error('Der Seitenzeiger für das Prüfprotokoll ist ungültig.');
  }
}

@Injectable({ providedIn: 'root' })
export class BusinessEventService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly workspaceService = inject(WorkspaceService);

  async listEvents(filter: BusinessEventFilter): Promise<BusinessEventPage> {
    this.assertCurrentWorkspace(filter.workspaceId);
    if (this.mockStore.isDemoMode()) return { events: [], nextCursor: null };
    const pageSize = this.boundPageSize(filter.pageSize);
    const cursor = filter.cursor ? decodeBusinessEventCursor(filter.cursor) : null;
    const rpcFilter: Record<string, string> = {};
    if (filter.entityType) rpcFilter['entity_type'] = filter.entityType;
    if (filter.entityId) rpcFilter['entity_id'] = filter.entityId;
    if (filter.eventType) rpcFilter['event_type'] = filter.eventType;
    if (filter.actorId) rpcFilter['actor_id'] = filter.actorId;
    if (filter.from) rpcFilter['from'] = this.assertIsoDate(filter.from, 'Startdatum');
    if (filter.to) rpcFilter['to'] = this.assertIsoDate(filter.to, 'Enddatum');

    const { data, error } = await this.supabase.client.rpc('list_business_events', {
      p_workspace_id: filter.workspaceId,
      p_filter: rpcFilter as Json,
      p_cursor_created_at: (cursor?.createdAt ?? null) as unknown as string,
      p_cursor_id: (cursor?.id ?? null) as unknown as string,
      p_page_size: pageSize,
    });
    if (error) throw new Error(error.message || 'Das Prüfprotokoll konnte nicht geladen werden.');
    return this.toPage(data ?? [], pageSize);
  }

  async listEntityEvents(filter: EntityBusinessEventFilter): Promise<BusinessEventPage> {
    this.assertCurrentWorkspace(filter.workspaceId);
    if (!filter.entityId) throw new Error('Eine Datensatz-ID ist erforderlich.');
    if (this.mockStore.isDemoMode()) {
      const events =
        filter.entityType === 'purchase'
          ? this.mockStore.getPackageCaptureEvents(filter.workspaceId, filter.entityId)
          : [];
      return {
        events: events.map((event) => ({
          ...event,
          entityType: filter.entityType,
          eventLabel: mapBusinessEventLabel(event.eventType),
          actorId: event.actorId ?? null,
          reason: event.reason ?? null,
          changes: event.changes as Json,
        })),
        nextCursor: null,
      };
    }
    const pageSize = this.boundPageSize(filter.pageSize);
    const cursor = filter.cursor ? decodeBusinessEventCursor(filter.cursor) : null;
    const { data, error } = await this.supabase.client.rpc('list_entity_business_events', {
      p_workspace_id: filter.workspaceId,
      p_entity_type: filter.entityType,
      p_entity_id: filter.entityId,
      p_cursor_created_at: (cursor?.createdAt ?? null) as unknown as string,
      p_cursor_id: (cursor?.id ?? null) as unknown as string,
      p_page_size: pageSize,
    });
    if (error)
      throw new Error(error.message || 'Der Änderungsverlauf konnte nicht geladen werden.');
    return this.toPage(data ?? [], pageSize);
  }

  private toPage(rows: readonly BusinessEventRow[], pageSize: number): BusinessEventPage {
    const events = rows.map((row) => this.mapRow(row));
    const last = events.at(-1);
    return {
      events,
      nextCursor:
        rows.length === pageSize && last
          ? encodeBusinessEventCursor(last.createdAt, last.id)
          : null,
    };
  }

  private mapRow(row: BusinessEventRow): BusinessEvent {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      entityType: row.entity_type as BusinessEntityType,
      entityId: row.entity_id,
      eventType: row.event_type,
      eventLabel: mapBusinessEventLabel(row.event_type),
      actorId: row.actor_id ?? null,
      reason: row.reason ?? null,
      changes: row.changes,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
    };
  }

  private assertCurrentWorkspace(workspaceId: string): void {
    if (!workspaceId) throw new Error('Ein Workspace ist für das Prüfprotokoll erforderlich.');
    if (this.workspaceService.currentWorkspace()?.id !== workspaceId) {
      throw new Error('Das Prüfprotokoll kann nur für den aktiven Workspace geladen werden.');
    }
  }

  private boundPageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize)) return 50;
    return Math.min(100, Math.max(1, Math.trunc(pageSize)));
  }

  private assertIsoDate(value: string, label: string): string {
    if (Number.isNaN(Date.parse(value))) throw new Error(`${label} ist ungültig.`);
    return new Date(value).toISOString();
  }
}
