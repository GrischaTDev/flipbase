import { Injectable, computed, inject, signal } from '@angular/core';
import { EbayAccountApiService, EbayAccountRequestError } from './ebay-account-api.service';
import type { AccountScope } from '../models/marketplace.models';
import type { EbayConnection } from '../../../../../supabase/functions/_shared/ebay-contracts';
import type {
  EbayConversation,
  EbayConversationType,
  EbayMessage,
} from '../../../../../supabase/functions/_shared/ebay-message-contracts';

@Injectable({ providedIn: 'root' })
export class EbayInboxStore {
  private readonly api = inject(EbayAccountApiService);
  private scope: AccountScope | null = null;
  private userId = '';
  private revision = 0;
  private conversationRevision = 0;
  readonly connection = signal<EbayConnection | null>(null);
  readonly conversations = signal<readonly EbayConversation[]>([]);
  readonly messages = signal<readonly EbayMessage[]>([]);
  readonly selected = signal<EbayConversation | null>(null);
  readonly type = signal<EbayConversationType>('FROM_MEMBERS');
  readonly unreadOnly = signal(false);
  readonly loading = signal(false);
  readonly reading = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly conversationError = signal<string | null>(null);
  readonly sendUnconfirmed = signal(false);
  readonly nextOffset = signal<number | null>(null);
  readonly nextMessageOffset = signal<number | null>(null);
  readonly canReply = computed(
    () =>
      this.selected()?.type === 'FROM_MEMBERS' &&
      !this.reading() &&
      !this.sending() &&
      !this.sendUnconfirmed() &&
      !this.conversationError(),
  );
  private failure(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Das eBay-Postfach ist gerade nicht erreichbar.';
  }
  clear(): void {
    this.revision++;
    this.conversationRevision++;
    this.scope = null;
    this.userId = '';
    this.connection.set(null);
    this.conversations.set([]);
    this.messages.set([]);
    this.selected.set(null);
    this.error.set(null);
    this.conversationError.set(null);
    this.loading.set(false);
    this.reading.set(false);
    this.sending.set(false);
    this.sendUnconfirmed.set(false);
    this.nextOffset.set(null);
    this.nextMessageOffset.set(null);
  }
  async activate(userId: string, workspaceId: string): Promise<void> {
    this.clear();
    this.type.set('FROM_MEMBERS');
    this.unreadOnly.set(false);
    this.userId = userId;
    const revision = this.revision;
    this.loading.set(true);
    try {
      const status = await this.api.loadStatus(workspaceId);
      if (revision !== this.revision) return;
      this.connection.set(status.connection);
      if (status.connection?.status !== 'connected') return;
      if (status.messagingAvailable !== true)
        throw new Error('Das eBay-Postfach ist auf dem Server noch nicht verfügbar.');
      this.scope = { workspaceId, connectionId: status.connection.connectionId };
      await this.load();
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async filter(type: EbayConversationType, unreadOnly: boolean): Promise<void> {
    if (this.sending() || this.loading() || this.reading()) return;
    this.type.set(type);
    this.unreadOnly.set(unreadOnly);
    this.conversationRevision++;
    this.selected.set(null);
    this.messages.set([]);
    this.conversationError.set(null);
    await this.load();
  }
  async load(more = false): Promise<void> {
    const scope = this.scope;
    if (!scope || this.sending()) return;
    const revision = this.revision;
    const offset = more ? this.nextOffset() : 0;
    if (offset === null) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.loadInbox(scope, this.type(), this.unreadOnly(), offset);
      if (revision !== this.revision) return;
      const items = more ? [...this.conversations(), ...page.conversations] : page.conversations;
      this.conversations.set([...new Map(items.map((item) => [item.id, item])).values()]);
      this.nextOffset.set(page.nextOffset);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  private pendingKey(id: string): string {
    return `flipbase.ebay.pending-reply:${this.userId}:${this.scope?.workspaceId}:${this.scope?.connectionId}:${id}`;
  }
  async open(conversation: EbayConversation, more = false): Promise<void> {
    const scope = this.scope;
    if (!scope || this.sending() || this.loading() || (more && this.reading())) return;
    const revision = this.revision;
    const conversationRevision = ++this.conversationRevision;
    const offset = more ? this.nextMessageOffset() : 0;
    if (offset === null) return;
    if (!more) {
      this.selected.set(conversation);
      this.messages.set([]);
      this.nextMessageOffset.set(null);
    }
    this.reading.set(true);
    this.conversationError.set(null);
    try {
      this.sendUnconfirmed.set(sessionStorage.getItem(this.pendingKey(conversation.id)) !== null);
    } catch {
      this.sendUnconfirmed.set(true);
    }
    try {
      const page = await this.api.loadConversation(
        scope,
        conversation.id,
        conversation.type,
        offset,
      );
      if (revision !== this.revision || conversationRevision !== this.conversationRevision) return;
      const messages = more ? [...this.messages(), ...page.messages] : page.messages;
      this.messages.set(
        [...new Map(messages.map((message) => [message.id, message])).values()].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        ),
      );
      this.nextMessageOffset.set(page.nextOffset);
    } catch (error) {
      if (revision === this.revision && conversationRevision === this.conversationRevision)
        this.conversationError.set(this.failure(error));
    } finally {
      if (revision === this.revision && conversationRevision === this.conversationRevision)
        this.reading.set(false);
    }
  }
  close(): void {
    if (this.sending()) return;
    this.conversationRevision++;
    this.selected.set(null);
    this.messages.set([]);
    this.reading.set(false);
  }
  async markRead(): Promise<void> {
    const scope = this.scope,
      conversation = this.selected();
    if (!scope || !conversation || this.sending() || this.reading()) return;
    const revision = this.revision;
    const conversationRevision = this.conversationRevision;
    this.reading.set(true);
    try {
      await this.api.markConversationRead(scope, conversation.id, conversation.type);
      if (revision !== this.revision || conversationRevision !== this.conversationRevision) return;
      this.conversations.update((items) =>
        items.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
      );
      this.selected.set({ ...conversation, unreadCount: 0 });
    } catch (error) {
      if (revision === this.revision && conversationRevision === this.conversationRevision)
        this.conversationError.set(this.failure(error));
    } finally {
      if (revision === this.revision && conversationRevision === this.conversationRevision)
        this.reading.set(false);
    }
  }
  confirmReviewed(): void {
    const conversation = this.selected();
    if (!conversation || this.sending()) return;
    try {
      sessionStorage.removeItem(this.pendingKey(conversation.id));
      this.sendUnconfirmed.set(false);
    } catch {
      this.conversationError.set(
        'Der Browser kann den Sendestatus nicht speichern. Antworte bitte direkt bei eBay.',
      );
    }
  }
  async send(text: string): Promise<boolean> {
    const scope = this.scope,
      conversation = this.selected();
    if (!scope || !conversation || !this.canReply() || !text.trim() || text.length > 2000)
      return false;
    const revision = this.revision;
    const pendingKey = this.pendingKey(conversation.id);
    try {
      sessionStorage.setItem(pendingKey, 'pending');
    } catch {
      this.conversationError.set(
        'Der Browser kann den Sendestatus nicht speichern. Antworte bitte direkt bei eBay.',
      );
      return false;
    }
    this.sending.set(true);
    this.conversationError.set(null);
    try {
      const message = await this.api.sendReply(scope, conversation.id, text);
      sessionStorage.removeItem(pendingKey);
      if (revision !== this.revision) return false;
      this.messages.update((items) => [...items.filter((item) => item.id !== message.id), message]);
      this.conversations.update((items) =>
        items.map((item) =>
          item.id === conversation.id ? { ...item, latestMessage: message } : item,
        ),
      );
      return true;
    } catch (error) {
      const certainFailure =
        error instanceof EbayAccountRequestError &&
        [
          'invalid_request',
          'message_rejected',
          'needs_login',
          'scope_missing',
          'connection_busy_or_unavailable',
          'forbidden',
          'unauthorized',
        ].includes(error.code ?? '');
      if (certainFailure) sessionStorage.removeItem(pendingKey);
      if (revision === this.revision) {
        this.sendUnconfirmed.set(!certainFailure);
        this.conversationError.set(this.failure(error));
      }
      return false;
    } finally {
      if (revision === this.revision) this.sending.set(false);
    }
  }
}
