import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AppNotification } from '../models/webhook.models';
import { SyncStatusService } from './sync-status.service';
import { WebhookService } from './webhook.service';

const notification: AppNotification = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'system',
  title: 'Test',
  message: 'Nachricht',
  timestamp: '2026-08-24T10:00:00Z',
  read: false,
};

function erstelleDienst(
  operation: 'update' | 'delete',
  result: { error: unknown | null; count: number | null },
) {
  const terminal = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    eq: vi.fn(() => chain),
    then: terminal.then.bind(terminal),
  };
  chain[operation] = vi.fn(() => chain);
  const service = Object.create(WebhookService.prototype) as WebhookService;
  Object.assign(service, {
    notifications: signal([notification]),
    workspaceService: { currentWorkspace: () => ({ id: '11111111-1111-4111-8111-111111111111' }) },
    mockStore: { isDemoMode: () => false },
    syncStatus: new SyncStatusService(),
    supabase: { client: { from: vi.fn(() => chain) } },
  });
  return service;
}

describe('WebhookService – Inbox DB-first', () => {
  it('markiert bei Datenbank-Nulltreffer nicht lokal als gelesen', async () => {
    const service = erstelleDienst('update', { error: null, count: 0 });
    const result = await service.markAsRead(notification.id);
    expect(result.data).toBeNull();
    expect(result.reportedBySyncStatus).toBe(true);
    expect(service.notifications()[0].read).toBe(false);
  });

  it('löscht den Verlauf bei Datenbankfehler nicht lokal', async () => {
    const service = erstelleDienst('delete', { error: new Error('offline'), count: null });
    const result = await service.clearNotifications();
    expect(result.error).toBeInstanceOf(Error);
    expect(service.notifications()).toEqual([notification]);
  });
});
