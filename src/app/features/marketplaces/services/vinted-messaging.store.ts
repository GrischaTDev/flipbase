import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AccountScope } from '../models/marketplace.models';
import type { LocalMessageAttachment, LocalQueuedMessage } from '../models/marketplace-read.models';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedLocalExtensionStore } from './vinted-local-extension.store';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
import { VintedMessagingApiService } from './vinted-messaging-api.service';
@Injectable()
export class VintedMessagingStore {
  private readonly api = inject(VintedMessagingApiService);
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly local = inject(VintedLocalExtensionStore);
  private readonly bridge = inject(VintedLocalExtensionBridge);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly storedMessages = signal<readonly LocalQueuedMessage[]>([]);
  private readonly sending = signal(false);
  private readonly failure = signal<string | null>(null);
  private readonly readFailure = signal<string | null>(null);
  private readonly loadedContext = signal<string | null>(null);
  private readonly context = computed(() => {
    const account = this.accounts.selectedConnection();
    const workspace = this.workspace.currentWorkspace();
    const user = this.auth.currentUser();
    const conversation = this.accounts.selectedConversationId();
    return user &&
      workspace &&
      !workspace.archived_at &&
      this.accounts.canManage() &&
      account?.executionMode === 'local' &&
      account.workspaceId === workspace.id &&
      conversation
      ? JSON.stringify([user.id, workspace.id, account.connectionId, conversation])
      : null;
  });
  private readonly current = computed(
    () => this.context() !== null && this.context() === this.loadedContext(),
  );
  readonly messages = computed(() =>
    this.current()
      ? this.storedMessages().filter(
          (message) =>
            !(
              message.state === 'cancelled' &&
              ['retried', 'original_sent'].includes(message.errorCode ?? '')
            ),
        )
      : [],
  );
  readonly busy = computed(() => this.current() && this.sending());
  readonly error = computed(() => (this.current() ? (this.failure() ?? this.readFailure()) : null));
  private revision = 0;
  private destroyed = false;
  private activeRead: string | null = null;
  private readRevision = 0;
  private lastReadAt = 0;
  private readonly intents = new Map<string, string>();
  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.revision++;
        this.readRevision++;
        this.loadedContext.set(context);
        this.storedMessages.set([]);
        this.sending.set(false);
        this.failure.set(null);
        this.readFailure.set(null);
        this.lastReadAt = 0;
        const account = this.accounts.selectedConnection();
        const conversationId = this.accounts.selectedConversationId();
        if (context && account && conversationId) void this.load(account, conversationId);
      });
    });
    const timer = setInterval(() => {
      const account = this.accounts.selectedConnection();
      const conversationId = this.accounts.selectedConversationId();
      const pending = this.messages().some((message) =>
        ['queued', 'claimed', 'sending'].includes(message.state),
      );
      if (
        document.visibilityState !== 'hidden' &&
        account &&
        conversationId &&
        Date.now() - this.lastReadAt >= (pending ? 10000 : 60000)
      )
        void this.load(account, conversationId);
    }, 10000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      clearInterval(timer);
      this.intents.clear();
    });
  }
  private matches(scope: AccountScope, conversationId: string): boolean {
    const account = this.accounts.selectedConnection();
    return (
      !this.destroyed &&
      this.context() !== null &&
      account?.workspaceId === scope.workspaceId &&
      account.connectionId === scope.connectionId &&
      this.accounts.selectedConversationId() === conversationId
    );
  }
  async load(scope: AccountScope, conversationId: string): Promise<void> {
    if (
      !this.matches(scope, conversationId) ||
      this.activeRead === this.context() ||
      this.sending()
    )
      return;
    const context = this.context();
    this.loadedContext.set(context);
    const revision = this.revision;
    const readRevision = ++this.readRevision;
    this.activeRead = context;
    try {
      const messages = await this.api.read(scope, conversationId);
      if (
        this.matches(scope, conversationId) &&
        this.context() === context &&
        revision === this.revision &&
        readRevision === this.readRevision
      ) {
        this.storedMessages.set(messages);
        this.lastReadAt = Date.now();
        this.readFailure.set(null);
      }
    } catch {
      if (
        this.matches(scope, conversationId) &&
        revision === this.revision &&
        readRevision === this.readRevision
      )
        this.readFailure.set('Die Versandwarteschlange konnte nicht geladen werden.');
    } finally {
      if (this.activeRead === context) this.activeRead = null;
    }
  }
  async send(
    scope: AccountScope,
    conversationId: string,
    text: string,
    attachment: LocalMessageAttachment | null,
  ): Promise<boolean> {
    if (
      !this.matches(scope, conversationId) ||
      this.sending() ||
      this.local.busy() ||
      !this.local.messagesAllowed() ||
      !this.local.hasValidBinding() ||
      text.length > 5000 ||
      (!text.trim() && !attachment)
    )
      return false;
    const context = this.context();
    this.loadedContext.set(context);
    const revision = this.revision;
    const valid = () =>
      this.matches(scope, conversationId) &&
      context === this.context() &&
      revision === this.revision;
    this.readRevision++;
    this.sending.set(true);
    this.failure.set(null);
    try {
      if (!(await this.ensureSendPermission(valid))) return false;
      if (!valid() || !this.local.hasValidBinding()) return false;
      // Nach verlorener HTTP-Bestätigung bleibt dieselbe Nutzereingabe dieselbe Anfrage.
      const fingerprint = JSON.stringify([context, text, attachment]);
      const requestId = this.intents.get(fingerprint) ?? crypto.randomUUID();
      this.intents.set(fingerprint, requestId);
      const queued = await this.api.enqueue(scope, conversationId, requestId, text, attachment);
      this.intents.delete(fingerprint);
      if (!valid()) return false;
      this.storedMessages.update((messages) => [
        ...messages.filter((message) => message.id !== queued.id),
        queued,
      ]);
      // Ein Wecksignal bestätigt nur den Auftrag; es ersetzt keine Versandbestätigung.
      void this.bridge.request('FLIPBASE_VINTED_LOCAL_MESSAGES_SEND', scope).catch(() => undefined);
      return true;
    } catch {
      if (valid())
        this.failure.set(
          'Die Einreihung konnte nicht bestätigt werden. Prüfe die Warteschlange oder versuche dieselbe Nachricht erneut.',
        );
      return false;
    } finally {
      if (valid()) this.sending.set(false);
    }
  }
  async retry(
    scope: AccountScope,
    conversationId: string,
    messageId: string,
    confirmedUnknown: boolean,
  ): Promise<boolean> {
    const message = this.messages().find(
      (entry) => entry.id === messageId && entry.conversationId === conversationId,
    );
    if (
      !this.matches(scope, conversationId) ||
      this.sending() ||
      this.local.busy() ||
      !this.local.messagesAllowed() ||
      !this.local.hasValidBinding() ||
      !message ||
      (message.state !== 'failed' && message.state !== 'outcome_unknown') ||
      (message.state === 'outcome_unknown' && !confirmedUnknown)
    )
      return false;
    const context = this.context();
    const revision = this.revision;
    const valid = () =>
      this.matches(scope, conversationId) &&
      context === this.context() &&
      revision === this.revision;
    this.readRevision++;
    this.sending.set(true);
    this.failure.set(null);
    try {
      if (!(await this.ensureSendPermission(valid))) return false;
      const queued = await this.api.retry(scope, conversationId, messageId, confirmedUnknown);
      if (!valid()) return false;
      this.storedMessages.update((messages) => [
        ...messages.filter((entry) => entry.id !== messageId && entry.id !== queued.id),
        queued,
      ]);
      void this.bridge.request('FLIPBASE_VINTED_LOCAL_MESSAGES_SEND', scope).catch(() => undefined);
      return true;
    } catch {
      if (valid())
        this.failure.set(
          'Die Wiederholung konnte nicht bestätigt werden. Aktualisiere den Versandstatus und versuche es erneut.',
        );
      return false;
    } finally {
      if (valid()) this.sending.set(false);
    }
  }
  private async ensureSendPermission(isCurrent: () => boolean): Promise<boolean> {
    if (!this.local.binding()?.messagesSend) {
      const confirmed = await this.dialog.frage({
        titel: 'Nachrichtenversand erlauben?',
        text: 'Flipbase darf Deine bewusst gesendeten Nachrichten und Bilder über dieses Vinted-Browserprofil versenden. Die Freigabe gilt nur für das verbundene Konto bis zum Ende der bestehenden Freigabe.',
        bestaetigenText: 'Versand erlauben',
      });
      if (!confirmed || !isCurrent()) return false;
      if (!(await this.local.approveSend()) || !isCurrent()) return false;
    }
    return isCurrent() && this.local.hasValidBinding();
  }
}
