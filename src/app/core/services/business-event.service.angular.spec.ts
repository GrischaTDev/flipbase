import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WorkspaceService } from './workspace.service';
import {
  BusinessEventService,
  decodeBusinessEventCursor,
  encodeBusinessEventCursor,
  mapBusinessEventLabel,
} from './business-event.service';

describe('BusinessEventService', () => {
  const rpc = vi.fn();
  const isDemoMode = signal(false);

  beforeEach(() => {
    rpc.mockReset();
    isDemoMode.set(false);
    TestBed.configureTestingModule({
      providers: [
        BusinessEventService,
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: MockDataStoreService, useValue: { isDemoMode } },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'workspace-1' }) },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('fragt das globale Journal mit stabiler Cursor-Paginierung und begrenzter Seitengröße ab', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: '00000000-0000-0000-0000-000000000002',
          workspace_id: 'workspace-1',
          entity_type: 'sale',
          entity_id: '00000000-0000-0000-0000-000000000010',
          event_type: 'sale_finalized',
          actor_id: 'user-1',
          reason: null,
          changes: { after: { status: 'sold' } },
          correlation_id: '00000000-0000-0000-0000-000000000020',
          created_at: '2026-08-31T12:00:00.000Z',
        },
      ],
      error: null,
    });
    const service = TestBed.inject(BusinessEventService);

    const page = await service.listEvents({
      workspaceId: 'workspace-1',
      entityType: 'sale',
      from: '2026-08-01T00:00:00.000Z',
      pageSize: 500,
    });

    expect(rpc).toHaveBeenCalledWith('list_business_events', {
      p_workspace_id: 'workspace-1',
      p_filter: { entity_type: 'sale', from: '2026-08-01T00:00:00.000Z' },
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_page_size: 100,
    });
    expect(page.events[0]).toMatchObject({ eventLabel: 'Verkauf abgeschlossen' });
    expect(page.nextCursor).toBeNull();
  });

  it('verhindert Abfragen für einen anderen oder fehlenden Workspace', async () => {
    const service = TestBed.inject(BusinessEventService);

    await expect(service.listEvents({ workspaceId: 'workspace-2', pageSize: 50 })).rejects.toThrow(
      'aktiven Workspace',
    );
    await expect(service.listEvents({ workspaceId: '', pageSize: 50 })).rejects.toThrow(
      'Workspace',
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sendet im lokalen Demo-Modus keine Journalabfrage an Supabase', async () => {
    isDemoMode.set(true);
    const service = TestBed.inject(BusinessEventService);

    await expect(service.listEvents({ workspaceId: 'workspace-1', pageSize: 50 })).resolves.toEqual(
      { events: [], nextCursor: null },
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verwendet für einen lokalen Datensatz ausschließlich die Entity-RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const service = TestBed.inject(BusinessEventService);

    await service.listEntityEvents({
      workspaceId: 'workspace-1',
      entityType: 'purchase',
      entityId: '00000000-0000-0000-0000-000000000011',
      pageSize: 25,
    });

    expect(rpc).toHaveBeenCalledWith(
      'list_entity_business_events',
      expect.objectContaining({ p_entity_type: 'purchase', p_page_size: 25 }),
    );
  });

  it('kodiert Zeitstempel und ID ohne Verlust und übersetzt bekannte Ereignisse', () => {
    const cursor = encodeBusinessEventCursor(
      '2026-08-31T12:00:00.000Z',
      '00000000-0000-0000-0000-000000000002',
    );

    expect(decodeBusinessEventCursor(cursor)).toEqual({
      createdAt: '2026-08-31T12:00:00.000Z',
      id: '00000000-0000-0000-0000-000000000002',
    });
    expect(mapBusinessEventLabel('purchase_costing_finalized')).toBe('Einkauf abgeschlossen');
    expect(mapBusinessEventLabel('purchase_reopened')).toBe('Einkauf wieder geöffnet');
    expect(mapBusinessEventLabel('purchase_ordered')).toBe('Einkauf als bestellt markiert');
    expect(mapBusinessEventLabel('purchase_arrived')).toBe('Einkauf als angekommen markiert');
    expect(mapBusinessEventLabel('purchase_tracking_added')).toBe('Sendungsverfolgung hinzugefügt');
    expect(mapBusinessEventLabel('purchase_tracking_updated')).toBe(
      'Sendungsverfolgung aktualisiert',
    );
    expect(mapBusinessEventLabel('purchase_tracking_removed')).toBe('Sendungsverfolgung entfernt');
    expect(mapBusinessEventLabel('purchase_draft_created')).toBe('Einkauf als Entwurf erstellt');
    expect(mapBusinessEventLabel('purchase_draft_updated')).toBe('Einkaufsentwurf geändert');
    expect(mapBusinessEventLabel('purchase_costing_legacy_migrated')).toBe(
      'Altdaten des Einkaufs übernommen',
    );
    expect(mapBusinessEventLabel('sale_recorded')).toBe('Verkauf erfasst');
    expect(mapBusinessEventLabel('sale_refund_updated')).toBe('Erstattung aktualisiert');
    expect(mapBusinessEventLabel('sale_return_recorded')).toBe('Retoure erfasst');
    expect(mapBusinessEventLabel('custom_event')).toBe('Custom event');
  });
});
