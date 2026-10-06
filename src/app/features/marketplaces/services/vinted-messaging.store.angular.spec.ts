import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedLocalExtensionStore } from './vinted-local-extension.store';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
import { VintedMessagingApiService } from './vinted-messaging-api.service';
import { VintedMessagingStore } from './vinted-messaging.store';
import type { LocalQueuedMessage } from '../models/marketplace-read.models';
const scope = { workspaceId: 'workspace', connectionId: 'account' };
const conversationId = '00000000-0000-4000-8000-000000000003';
describe('Vinted-Versandzustand', () => {
  let store: VintedMessagingStore;
  let api: {
    enqueue: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;
  let approve: ReturnType<typeof vi.fn>;
  let binding: ReturnType<typeof signal<{ messagesSend: boolean }>>;
  let user: ReturnType<typeof signal<{ id: string } | null>>;
  let account: ReturnType<typeof signal<object | null>>;
  let canUseBrowserProfile: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    TestBed.resetTestingModule();
    binding = signal({ messagesSend: false });
    canUseBrowserProfile = vi.fn().mockReturnValue(true);
    user = signal<{ id: string } | null>({ id: 'user' });
    account = signal<object | null>({ ...scope, executionMode: 'local', status: 'connected' });
    api = {
      retry: vi.fn(),
      read: vi.fn().mockResolvedValue([]),
      enqueue: vi.fn().mockImplementation(async (_scope, _conversation, id, text) => ({
        id: 'queued',
        requestId: id,
        conversationId,
        text,
        state: 'queued',
      })),
    };
    confirm = vi.fn().mockResolvedValue(true);
    approve = vi.fn().mockImplementation(async () => {
      binding.set({ messagesSend: true });
      return true;
    });
    TestBed.configureTestingModule({
      providers: [
        VintedMessagingStore,
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: signal({ id: 'workspace' }) } },
        {
          provide: MarketplaceAccountStore,
          useValue: {
            selectedConnection: account,
            selectedConversationId: signal(conversationId),
            canManage: signal(true),
          },
        },
        {
          provide: VintedLocalExtensionStore,
          useValue: {
            binding,
            messagesAllowed: signal(true),
            hasValidBinding: () => true,
            canUseBrowserProfile,
            busy: signal(false),
            error: signal(null),
            approveSend: approve,
          },
        },
        {
          provide: VintedLocalExtensionBridge,
          useValue: { request: vi.fn().mockResolvedValue({}) },
        },
        { provide: VintedMessagingApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { frage: confirm } },
      ],
    });
    store = TestBed.inject(VintedMessagingStore);
  });
  it('fragt getrennt nach Versandfreigabe und zeigt danach nur wartend', async () => {
    await store.load(scope, conversationId);
    expect(await store.send(scope, conversationId, 'Hallo', null)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledOnce();
    expect(store.messages()[0].state).toBe('queued');
  });
  it('legt nach abgelehnter Freigabe keinen Auftrag an', async () => {
    confirm.mockResolvedValue(false);
    await store.load(scope, conversationId);
    expect(await store.send(scope, conversationId, 'Hallo', null)).toBe(false);
    expect(api.enqueue).not.toHaveBeenCalled();
  });
  it('reiht mit einer fremden Profilbindung trotz gespeichertem Versandrecht nichts ein', async () => {
    binding.set({ messagesSend: true });
    canUseBrowserProfile.mockReturnValue(false);
    await store.load(scope, conversationId);
    expect(await store.send(scope, conversationId, 'Hallo', null)).toBe(false);
    expect(api.enqueue).not.toHaveBeenCalled();
  });
  it('verwendet nach verlorener Serverantwort dieselbe Anfrage-ID', async () => {
    binding.set({ messagesSend: true });
    await store.load(scope, conversationId);
    api.enqueue.mockRejectedValueOnce(new Error('network'));
    await store.send(scope, conversationId, 'Hallo', null);
    await store.send(scope, conversationId, 'Hallo', null);
    expect(api.enqueue.mock.calls[0][2]).toBe(api.enqueue.mock.calls[1][2]);
  });
  it('überschreibt einen neu eingereihten Auftrag nicht mit einem älteren Read', async () => {
    binding.set({ messagesSend: true });
    let finish: ((messages: unknown[]) => void) | undefined;
    api.read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const reading = store.load(scope, conversationId);
    await store.send(scope, conversationId, 'Hallo', null);
    finish?.([]);
    await reading;
    expect(store.messages()).toHaveLength(1);
  });
  it('sendet nach Kontowechsel während der Freigabe nicht', async () => {
    await store.load(scope, conversationId);
    confirm.mockImplementation(async () => {
      account.set({ ...scope, connectionId: 'other' });
      return true;
    });
    expect(await store.send(scope, conversationId, 'Hallo', null)).toBe(false);
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });
  it('verwirft einen verspäteten Verlauf nach Abmeldung', async () => {
    let finish: ((messages: unknown[]) => void) | undefined;
    api.read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const loading = store.load(scope, conversationId);
    user.set(null);
    finish?.([{ state: 'queued' }]);
    await loading;
    expect(store.messages()).toEqual([]);
  });
  it('entfernt einen Ladefehler nach erfolgreicher erneuter Prüfung', async () => {
    api.read.mockRejectedValueOnce(new Error('network'));
    await store.load(scope, conversationId);
    expect(store.error()).toContain('nicht geladen');
    await store.load(scope, conversationId);
    expect(store.error()).toBeNull();
  });
  it('lädt das neue Konto während eine alte Anfrage noch läuft', async () => {
    let finish: ((messages: unknown[]) => void) | undefined;
    api.read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const oldRead = store.load(scope, conversationId);
    const nextScope = { ...scope, connectionId: 'other' };
    account.set({ ...nextScope, executionMode: 'local', status: 'connected' });
    await store.load(nextScope, conversationId);
    expect(api.read).toHaveBeenCalledTimes(2);
    finish?.([{ state: 'queued' }]);
    await oldRead;
    expect(store.messages()).toEqual([]);
  });
  const failedMessage: LocalQueuedMessage = {
    id: 'failed-message',
    requestId: 'first-request',
    conversationId,
    text: 'Hallo',
    state: 'failed',
    createdAt: '2026-10-05T10:00:00Z',
    updatedAt: '2026-10-05T10:00:30Z',
    externalMessageId: null,
    errorCode: 'login_required',
    attachment: { name: 'photo.png', mimeType: 'image/png' },
  };
  it('ersetzt beim Wiederholen den fehlgeschlagenen Eintrag durch genau einen neuen Auftrag', async () => {
    binding.set({ messagesSend: true });
    api.read.mockResolvedValue([failedMessage]);
    api.retry.mockResolvedValue({ ...failedMessage, id: 'retry-message', state: 'queued' });
    await store.load(scope, conversationId);
    expect(await store.retry(scope, conversationId, failedMessage.id, false)).toBe(true);
    expect(api.retry).toHaveBeenCalledWith(scope, conversationId, failedMessage.id, false);
    expect(api.enqueue).not.toHaveBeenCalled();
    expect(store.messages().map((message) => message.id)).toEqual(['retry-message']);
  });
  it('wiederholt einen unklaren Versand nur nach ausdrücklicher Bestätigung', async () => {
    binding.set({ messagesSend: true });
    api.read.mockResolvedValue([{ ...failedMessage, state: 'outcome_unknown' }]);
    api.retry.mockResolvedValue({ ...failedMessage, id: 'retry-message', state: 'queued' });
    await store.load(scope, conversationId);
    expect(await store.retry(scope, conversationId, failedMessage.id, false)).toBe(false);
    expect(api.retry).not.toHaveBeenCalled();
    expect(await store.retry(scope, conversationId, failedMessage.id, true)).toBe(true);
  });
  it('erneuert eine fehlende Versandfreigabe auch beim Wiederholen', async () => {
    api.read.mockResolvedValue([failedMessage]);
    api.retry.mockResolvedValue({ ...failedMessage, id: 'retry-message', state: 'queued' });
    await store.load(scope, conversationId);
    expect(await store.retry(scope, conversationId, failedMessage.id, false)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledOnce();
    expect(api.retry).toHaveBeenCalledOnce();
  });
  it('verhindert überlappende Wiederholungen und verwirft verspätete Antworten nach Kontowechsel', async () => {
    binding.set({ messagesSend: true });
    api.read.mockResolvedValue([failedMessage]);
    let finish: ((message: LocalQueuedMessage) => void) | undefined;
    api.retry.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await store.load(scope, conversationId);
    const retry = store.retry(scope, conversationId, failedMessage.id, false);
    expect(await store.retry(scope, conversationId, failedMessage.id, false)).toBe(false);
    account.set({ ...scope, connectionId: 'other' });
    finish?.({ ...failedMessage, id: 'retry-message', state: 'queued' });
    expect(await retry).toBe(false);
    expect(api.retry).toHaveBeenCalledOnce();
    expect(store.messages()).toEqual([]);
  });
});
