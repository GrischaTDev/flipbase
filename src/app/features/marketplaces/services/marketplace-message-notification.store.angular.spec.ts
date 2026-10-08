import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../core/services/platform-operator.service';
import {
  MarketplaceMessageNotificationApiService,
  MessageNotificationApiError,
} from './marketplace-message-notification-api.service';
import { MarketplaceMessageNotificationStore } from './marketplace-message-notification.store';

const item = {
  id: '7',
  connectionId: 'account-a',
  accountName: 'Mein Konto',
  observedAt: '2026-10-01T12:00:00Z',
  read: false,
  senderName: 'mitglied',
  conversationId: 'conversation-a',
  eventKind: 'message',
};
let workspace: {
  currentWorkspace: ReturnType<typeof signal<{ id: string; archived_at: string | null }>>;
};
let operator: { operator: ReturnType<typeof signal<boolean>> };
let api: {
  read: ReturnType<typeof vi.fn>;
  mark: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
  authenticate: ReturnType<typeof vi.fn>;
};
let changed: () => void;
let reconnected: () => void;
let cleanup: ReturnType<typeof vi.fn>;
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.tick();
}
beforeEach(() => {
  workspace = { currentWorkspace: signal({ id: 'workspace-a', archived_at: null }) };
  operator = { operator: signal(true) };
  cleanup = vi.fn();
  api = {
    read: vi.fn().mockImplementation(async (workspaceId: string) => ({
      workspaceId,
      items: [item],
      unreadCount: 67,
    })),
    mark: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn(),
    listen: vi.fn((_workspaceId: string, onChange: () => void, onReconnect: () => void) => {
      changed = onChange;
      reconnected = onReconnect;
      return cleanup;
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      MarketplaceMessageNotificationStore,
      { provide: MarketplaceMessageNotificationApiService, useValue: api },
      { provide: WorkspaceService, useValue: workspace },
      { provide: PlatformOperatorService, useValue: operator },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'user-a' }),
          session: signal({ access_token: 'synthetic' }),
        },
      },
    ],
  });
});
afterEach(() => TestBed.resetTestingModule());
describe('Kontogebundene Nachrichtenmeldungen außerhalb der Vinted-Ansicht', () => {
  it('lädt gespeicherte Meldungen und den vollständigen Ungelesenzähler ohne geöffnete Vinted-Seite', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    expect(store.notifications()[0].message).toContain('mitglied');
    expect(store.unreadCount()).toBe(67);
  });
  it('übernimmt Broadcast und Wiederverbinden ohne doppelte Meldungen', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    changed();
    await settle();
    reconnected();
    await settle();
    expect(store.notifications()).toHaveLength(1);
    expect(store.unreadCount()).toBe(67);
  });
  it('verwirft einen verspäteten Feed nach Workspacewechsel', async () => {
    let finish: (value: unknown) => void = () => {
      throw new Error('Ausstehender Auftrag fehlt');
    };
    api.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    workspace.currentWorkspace.set({ id: 'workspace-b', archived_at: null });
    await settle();
    finish({
      workspaceId: 'workspace-a',
      items: [{ ...item, id: 'old', accountName: 'Fremd' }],
      unreadCount: 99,
    });
    await settle();
    expect(store.notifications().some((notification) => notification.title.includes('Fremd'))).toBe(
      false,
    );
    expect(store.unreadCount()).toBe(67);
    expect(cleanup).toHaveBeenCalled();
  });
  it('entfernt Feed und Kanal bei verlorenem Betreiberzugriff sofort', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    operator.operator.set(false);
    expect(store.notifications()).toEqual([]);
    expect(store.unreadCount()).toBe(0);
    await settle();
    expect(cleanup).toHaveBeenCalled();
  });
  it('verwirft Meldungen nach serverseitigem Rechteentzug', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    api.read.mockRejectedValue(new MessageNotificationApiError('forbidden'));
    changed();
    await settle();
    expect(store.notifications()).toEqual([]);
    expect(store.unreadCount()).toBe(0);
    expect(cleanup).toHaveBeenCalled();
  });
  it('markiert mit Workspacebindung und lädt das bestätigte Ergebnis', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    api.read.mockResolvedValue({
      workspaceId: 'workspace-a',
      items: [{ ...item, read: true }],
      unreadCount: 0,
    });
    await store.markAsRead('marketplace-message:7');
    await settle();
    expect(api.mark).toHaveBeenCalledWith('workspace-a', '7', false);
    expect(store.notifications()[0].read).toBe(true);
    expect(store.unreadCount()).toBe(0);
  });
  it('lässt einen älteren Leseauftrag nach verweigerter Speicherung keine Meldungen wiederherstellen', async () => {
    const store = TestBed.inject(MarketplaceMessageNotificationStore);
    await settle();
    let finish: (value: unknown) => void = () => {
      throw new Error('Ausstehender Auftrag fehlt');
    };
    api.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.reload();
    api.mark.mockRejectedValueOnce(new MessageNotificationApiError('forbidden'));
    await expect(store.markAsRead('marketplace-message:7')).rejects.toThrow('keinen Zugriff');
    finish({ workspaceId: 'workspace-a', items: [item], unreadCount: 67 });
    await pending;
    await settle();
    expect(store.notifications()).toEqual([]);
    expect(store.unreadCount()).toBe(0);
    expect(api.listen).toHaveBeenCalledOnce();
  });
});
