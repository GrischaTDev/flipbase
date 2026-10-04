import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

interface ReadingPosition {
  key: string;
  height: number;
  top: number;
  atBottom: boolean;
  items: string;
}

@Component({
  selector: 'app-vinted-messages',
  imports: [DatePipe, BadgeComponent, ButtonComponent, CardComponent, ProductThumbnailComponent],
  templateUrl: './vinted-messages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedMessagesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('conversationHeading');
  private readonly listHeading = viewChild<ElementRef<HTMLElement>>('listHeading');
  private readonly log = viewChild<ElementRef<HTMLElement>>('messageLog');
  private readonly savedConversation = signal<{ key: string; entry: MarketplaceEntry } | null>(
    null,
  );
  readonly backIcon = LucideArrowLeft;
  readonly notice = signal<string | null>(null);
  readonly context = computed(() => {
    const account = this.store.selectedConnection();
    return account && this.store.canManage()
      ? JSON.stringify([account.workspaceId, account.connectionId, this.store.selectionVersion()])
      : null;
  });
  readonly conversationKey = computed(() => {
    const context = this.context();
    const id = this.store.selectedConversationId();
    return context && id ? JSON.stringify([context, id]) : null;
  });
  readonly conversation = computed(() => {
    if (!this.conversationKey()) return null;
    const current = this.store
      .snapshot()
      ?.conversations.items.find((entry) => entry.id === this.store.selectedConversationId());
    return (
      current ??
      (this.savedConversation()?.key === this.conversationKey()
        ? (this.savedConversation()?.entry ?? null)
        : null)
    );
  });
  readonly transcript = computed(() => [...(this.store.messages()?.items ?? [])].reverse());
  private readonly failedRequest = signal<{
    key: string | null;
    kind: 'message' | 'conversation';
  } | null>(null);
  readonly retryKind = computed(() =>
    this.failedRequest()?.key === this.conversationKey() ? this.failedRequest()?.kind : undefined,
  );
  private handledQuery: string | null = null;
  private selectingQuery: string | null = null;
  private lastQuery: string | null = null;
  private reading: ReadingPosition | null = null;
  private prepending: ReadingPosition | null = null;
  private focusConversation: string | null = null;
  private focusListRow: string | null = null;

  constructor() {
    effect(() => {
      const key = this.conversationKey();
      const entry = this.store
        .snapshot()
        ?.conversations.items.find((item) => item.id === this.store.selectedConversationId());
      untracked(() => {
        if (!key) this.savedConversation.set(null);
        else if (entry) this.savedConversation.set({ key, entry });
        else if (this.savedConversation()?.key !== key) this.savedConversation.set(null);
      });
    });
    effect(() => {
      const query = this.query();
      const accountId = query.get('connectionId');
      const conversationId = query.get('conversationId');
      const accounts = this.store.connections();
      const selected = this.store.selectedConnection();
      const snapshot = this.store.snapshot();
      const loading = this.store.loading() || this.store.loadingSnapshot();
      const canManage = this.store.canManage();
      const signature = JSON.stringify([accountId, conversationId]);
      if (signature !== this.lastQuery) {
        this.lastQuery = signature;
        this.handledQuery = null;
        this.selectingQuery = null;
        this.notice.set(null);
      }
      if (!accountId || !conversationId || signature === this.handledQuery || loading) return;
      if (!canManage) return;
      const account = accounts.find((item) => item.connectionId === accountId);
      if (!account) {
        this.handledQuery = signature;
        this.notice.set('Das verlinkte Gespräch ist für dieses Konto nicht verfügbar.');
        return;
      }
      if (selected?.connectionId !== accountId) {
        if (this.selectingQuery !== signature) {
          this.selectingQuery = signature;
          untracked(() => void this.store.selectConnection(accountId));
        }
        return;
      }
      if (
        !snapshot ||
        snapshot.connectionId !== accountId ||
        snapshot.workspaceId !== account.workspaceId
      )
        return;
      this.handledQuery = signature;
      const entry = snapshot.conversations.items.find((item) => item.id === conversationId);
      if (entry) untracked(() => void this.openConversation(entry));
      else this.notice.set('Das verlinkte Gespräch ist für dieses Konto nicht verfügbar.');
    });
    afterEveryRender(() => this.restoreReadingPosition());
  }

  async openConversation(entry: MarketplaceEntry): Promise<void> {
    const account = this.store.selectedConnection();
    if (
      !this.store.canManage() ||
      entry.workspaceId !== account?.workspaceId ||
      entry.connectionId !== account.connectionId ||
      !this.store.snapshot()?.conversations.items.some((item) => item.id === entry.id)
    )
      return;
    this.notice.set(null);
    this.failedRequest.set(null);
    this.focusConversation = JSON.stringify([this.context(), entry.id]);
    await this.store.openConversation(entry.id);
  }
  async approveInbox(): Promise<void> {
    const account = this.store.selectedConnection();
    const context = this.context();
    if (
      !account ||
      account.executionMode !== 'local' ||
      !context ||
      this.local.busy() ||
      !this.local.hasValidBinding()
    )
      return;
    const accepted = await this.dialog.frage({
      titel: 'Nachrichtenzugriff erlauben?',
      text: `Flipbase darf die Gesprächsliste und bereits gelesene Nachrichten von „${account.displayName}“ über dieses Browserprofil übernehmen. Ungelesene Verläufe bleiben geschlossen. Es werden keine Nachrichten gesendet. Die vorhandene Freigabe gilt weiterhin bis zu ihrem Ablauf und kann in der Kontoverwaltung widerrufen werden.`,
      bestaetigenText: 'Nachrichtenzugriff erlauben',
    });
    if (accepted && context === this.context()) await this.local.approveInbox();
  }

  backToList(): void {
    this.focusListRow = this.store.selectedConversationId();
    this.focusConversation = null;
    this.store.clearConversation();
  }

  async retryMessages(): Promise<void> {
    const entry = this.conversation();
    this.failedRequest.set(null);
    if (entry) await this.store.openConversation(entry.id);
  }

  async retryFailedRequest(): Promise<void> {
    if (this.retryKind() === 'message') await this.loadOlderMessages();
    else if (this.retryKind() === 'conversation') await this.loadMoreConversations();
    else await this.retryMessages();
  }

  async loadMoreConversations(): Promise<void> {
    const key = this.conversationKey();
    const context = this.context();
    this.failedRequest.set(null);
    await this.store.loadMore('conversation');
    if (context === this.context() && key === this.conversationKey() && this.store.error())
      this.failedRequest.set({ key, kind: 'conversation' });
  }

  captureReadingPosition(): void {
    const log = this.log()?.nativeElement;
    const key = this.conversationKey();
    if (!log || !key) return;
    this.reading = {
      key,
      height: log.scrollHeight,
      top: log.scrollTop,
      atBottom: log.scrollHeight - log.clientHeight - log.scrollTop <= 24,
      items: this.transcript()
        .map((item) => item.id)
        .join(':'),
    };
  }

  async loadOlderMessages(): Promise<void> {
    if (this.store.loadingPage() || !this.store.messages()?.nextCursor) return;
    const key = this.conversationKey();
    this.failedRequest.set(null);
    this.captureReadingPosition();
    this.prepending = this.reading;
    await this.store.loadMore('message');
    if (key === this.conversationKey() && this.store.error())
      this.failedRequest.set({ key, kind: 'message' });
  }

  messageKind(entry: MarketplaceEntry): 'system' | 'offer' | 'text' {
    return entry.messageType === 'status_message' || entry.messageType === 'action_message'
      ? 'system'
      : entry.messageType === 'offer_request_message' || entry.messageType === 'offer_message'
        ? 'offer'
        : 'text';
  }

  private restoreReadingPosition(): void {
    if (this.focusListRow && !this.store.selectedConversationId()) {
      const row = [
        ...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-conversation-row]'),
      ].find((item) => item.dataset['conversationRow'] === this.focusListRow);
      (row?.querySelector<HTMLElement>('button') ?? this.listHeading()?.nativeElement)?.focus({
        preventScroll: true,
      });
      this.focusListRow = null;
    }
    const key = this.conversationKey();
    if (this.focusConversation === key && key) {
      this.heading()?.nativeElement.focus({ preventScroll: true });
      this.focusConversation = null;
    }
    const log = this.log()?.nativeElement;
    if (!key || !log) {
      this.reading = null;
      this.prepending = null;
      return;
    }
    if (this.store.loadingMessages()) return;
    const items = this.transcript()
      .map((item) => item.id)
      .join(':');
    if (this.prepending?.key === key && this.store.loadingPage() !== 'message') {
      log.scrollTop = this.prepending.top + Math.max(0, log.scrollHeight - this.prepending.height);
      this.prepending = null;
    } else if (this.reading?.key !== key) {
      log.scrollTop = log.scrollHeight;
    } else if (this.reading.items !== items && !this.prepending) {
      log.scrollTop = this.reading.atBottom ? log.scrollHeight : this.reading.top;
    }
    this.captureReadingPosition();
  }
}
