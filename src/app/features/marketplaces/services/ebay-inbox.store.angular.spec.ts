import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbayInboxStore } from './ebay-inbox.store';
import { EbayAccountApiService, EbayAccountRequestError } from './ebay-account-api.service';
import type {
  EbayConversation,
  EbayInbox,
  EbayConversationMessages,
  EbayMessage,
} from '../../../../../supabase/functions/_shared/ebay-message-contracts';

const scope = { workspaceId: 'workspace', connectionId: 'connection' };
const message: EbayMessage = {
  id: 'm1',
  createdAt: '2026-11-01T10:00:00Z',
  text: 'Hallo',
  sender: 'buyer',
  recipient: 'seller',
  attachments: [],
};
const conversation: EbayConversation = {
  id: 'c1',
  type: 'FROM_MEMBERS',
  title: 'Wollschal',
  unreadCount: 1,
  listingId: '123',
  latestMessage: message,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('eBay-Postfach: Kontobindung und Sendewirkung', () => {
  let store: EbayInboxStore;
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    loadInbox: ReturnType<typeof vi.fn>;
    loadConversation: ReturnType<typeof vi.fn>;
    sendReply: ReturnType<typeof vi.fn>;
    markConversationRead: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    sessionStorage.clear();
    api = {
      loadStatus: vi.fn(async () => ({
        configured: true,
        messagingAvailable: true,
        connection: {
          ...scope,
          status: 'connected',
          username: 'seller',
          environment: 'production',
          lastReadAt: null,
        },
      })),
      loadInbox: vi.fn(async () => ({
        ...scope,
        conversations: [conversation],
        total: 1,
        nextOffset: null,
      })),
      loadConversation: vi.fn(async () => ({
        ...scope,
        conversationId: 'c1',
        type: 'FROM_MEMBERS',
        title: 'Wollschal',
        messages: [message],
        total: 1,
        nextOffset: null,
      })),
      sendReply: vi.fn(async () => ({
        ...message,
        id: 'm2',
        text: 'Meine Antwort',
        sender: 'seller',
        recipient: 'buyer',
      })),
      markConversationRead: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: EbayAccountApiService, useValue: api }],
    });
    store = TestBed.inject(EbayInboxStore);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });
  it('ruft ein noch nicht ausgerolltes Postfach nicht auf', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      connection: { ...scope, status: 'connected' },
    });
    await store.activate('user', scope.workspaceId);
    expect(api.loadInbox).not.toHaveBeenCalled();
    expect(store.error()).toContain('noch nicht verfügbar');
  });
  it('lädt nur das verbundene Konto und verwirft verspätete Antworten nach Abmeldung', async () => {
    const response = deferred<EbayInbox>();
    api.loadInbox.mockReturnValueOnce(response.promise);
    const loading = store.activate('user', scope.workspaceId);
    await Promise.resolve();
    store.clear();
    response.resolve({ ...scope, conversations: [conversation], total: 1, nextOffset: null });
    await loading;
    expect(store.connection()).toBeNull();
    expect(store.conversations()).toEqual([]);
  });
  it('ignoriert den alten Verlauf nach Wechsel zu einem anderen Gespräch', async () => {
    await store.activate('user', scope.workspaceId);
    const old = deferred<EbayConversationMessages>();
    api.loadConversation.mockReturnValueOnce(old.promise);
    const opening = store.open(conversation);
    const other = { ...conversation, id: 'c2', title: 'Jacke' };
    api.loadConversation.mockResolvedValueOnce({
      ...scope,
      conversationId: 'c2',
      type: 'FROM_MEMBERS',
      title: 'Jacke',
      messages: [],
      total: 0,
      nextOffset: null,
    });
    await store.open(other);
    old.resolve({
      ...scope,
      conversationId: 'c1',
      type: 'FROM_MEMBERS',
      title: 'Schal',
      messages: [message],
      total: 1,
      nextOffset: null,
    });
    await opening;
    expect(store.selected()?.id).toBe('c2');
    expect(store.messages()).toEqual([]);
  });
  it('startet während eines Gesprächsabrufs keinen konkurrierenden Filterabruf', async () => {
    await store.activate('user', scope.workspaceId);
    const page = deferred<EbayConversationMessages>();
    api.loadConversation.mockReturnValueOnce(page.promise);
    const opening = store.open(conversation);
    await store.filter('FROM_EBAY', false);
    expect(api.loadInbox).toHaveBeenCalledTimes(1);
    expect(store.type()).toBe('FROM_MEMBERS');
    page.resolve({
      ...scope,
      conversationId: 'c1',
      type: 'FROM_MEMBERS',
      title: 'Schal',
      messages: [],
      total: 0,
      nextOffset: null,
    });
    await opening;
    expect(store.reading()).toBe(false);
  });
  it('sperrt doppelte Sendeklicks bis zur bestätigten Antwort', async () => {
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    const sent = deferred<EbayMessage>();
    api.sendReply.mockReturnValueOnce(sent.promise);
    const first = store.send('Meine Antwort');
    expect(await store.send('Meine Antwort')).toBe(false);
    expect(api.sendReply).toHaveBeenCalledTimes(1);
    sent.resolve({ ...message, id: 'm2' });
    expect(await first).toBe(true);
    expect(store.sendUnconfirmed()).toBe(false);
  });
  it('sperrt unbestätigten Versand auch nach Neuladen des Postfachs', async () => {
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    api.sendReply.mockRejectedValueOnce(
      new EbayAccountRequestError('message_send_unconfirmed', 'Unklar'),
    );
    expect(await store.send('Meine Antwort')).toBe(false);
    expect(store.sendUnconfirmed()).toBe(true);
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    expect(store.canReply()).toBe(false);
    expect(await store.send('Meine Antwort')).toBe(false);
    expect(api.sendReply).toHaveBeenCalledTimes(1);
  });
  it('hebt die Sperre erst nach bewusster Prüfung auf und erhält andere Konten getrennt', async () => {
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    api.sendReply.mockRejectedValueOnce(new Error('Antwort verloren'));
    await store.send('Meine Antwort');
    store.confirmReviewed();
    expect(store.sendUnconfirmed()).toBe(false);
    await store.activate('user2', scope.workspaceId);
    await store.open(conversation);
    expect(store.canReply()).toBe(true);
  });
  it('bekannt abgelehnte Nachrichten erzeugen keine unklare Wirkung', async () => {
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    api.sendReply.mockRejectedValueOnce(
      new EbayAccountRequestError('message_rejected', 'Abgelehnt'),
    );
    expect(await store.send('Meine Antwort')).toBe(false);
    expect(store.sendUnconfirmed()).toBe(false);
  });
  it('eBay-Systemgespräche bieten keine Antwortaktion', async () => {
    await store.activate('user', scope.workspaceId);
    api.loadConversation.mockResolvedValueOnce({
      ...scope,
      conversationId: 'c1',
      type: 'FROM_EBAY',
      title: 'Info',
      messages: [message],
      total: 1,
      nextOffset: null,
    });
    await store.open({ ...conversation, type: 'FROM_EBAY' });
    expect(await store.send('Antwort')).toBe(false);
    expect(api.sendReply).not.toHaveBeenCalled();
  });
  it('ein später Gelesen-Status setzt die inzwischen gewählte Unterhaltung nicht zurück', async () => {
    await store.activate('user', scope.workspaceId);
    await store.open(conversation);
    const read = deferred<void>();
    api.markConversationRead.mockReturnValueOnce(read.promise);
    const updating = store.markRead();
    store.close();
    read.resolve();
    await updating;
    expect(store.selected()).toBeNull();
  });
});
