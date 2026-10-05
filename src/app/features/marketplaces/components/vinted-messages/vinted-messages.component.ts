import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideArrowLeft,
  LucideImagePlus,
  LucideSend,
  LucideTrash2,
  LucideTag,
  LucideInfo,
} from '@lucide/angular';
import imageCompression from 'browser-image-compression';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type {
  LocalMessageAttachment,
  LocalQueuedMessage,
  MarketplaceEntry,
} from '../../models/marketplace-read.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { formatConversationTime, formatMessageDay } from './vinted-message-time';
import { VintedMessagingStore } from '../../services/vinted-messaging.store';

type ConversationFilter = 'all' | 'unread' | 'questions' | 'negotiating' | 'sold' | 'system';

const conversationFilters: readonly SelectOption<ConversationFilter>[] = [
  { value: 'all', label: 'Alle Gespräche' },
  { value: 'unread', label: 'Ungelesen' },
  { value: 'questions', label: 'Fragen' },
  { value: 'negotiating', label: 'Verhandlung' },
  { value: 'sold', label: 'Verkauft' },
  { value: 'system', label: 'Systemnachrichten' },
];

interface ReadingPosition {
  key: string;
  height: number;
  top: number;
  atBottom: boolean;
  items: string;
}

@Component({
  selector: 'app-vinted-messages',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    ProductThumbnailComponent,
    CustomSearchInputComponent,
    CustomSelectComponent,
    TextFieldComponent,
    LoadingIndicatorComponent,
    LucideTag,
    LucideInfo,
  ],
  templateUrl: './vinted-messages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedMessagesComponent {
  readonly store = inject(MarketplaceAccountStore);
  readonly local = inject(VintedLocalExtensionStore);
  readonly messaging = inject(VintedMessagingStore);
  readonly search = signal('');
  readonly conversationFilter = signal<ConversationFilter | null>('all');
  readonly conversationSort = signal<'latest' | 'oldest' | null>('latest');
  readonly filterOptions = computed<readonly SelectOption<ConversationFilter>[]>(() =>
    conversationFilters.map((option) => ({
      ...option,
      label: `${option.label} (${(this.store.snapshot()?.conversations.items ?? []).filter((entry) => this.matchesFilter(entry, option.value)).length})`,
    })),
  );
  readonly sortOptions: readonly SelectOption<'latest' | 'oldest'>[] = [
    { value: 'latest', label: 'Neueste zuerst' },
    { value: 'oldest', label: 'Älteste zuerst' },
  ];
  readonly visibleConversations = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('de');
    const filter = this.conversationFilter();
    return [...(this.store.snapshot()?.conversations.items ?? [])]
      .filter(
        (entry) =>
          (!search ||
            `${entry.title} ${entry.text ?? ''} ${entry.itemTitle ?? ''}`
              .toLocaleLowerCase('de')
              .includes(search)) &&
          this.matchesFilter(entry, filter),
      )
      .sort((first, second) => {
        const firstTimestamp = Date.parse(first.occurredAt ?? '');
        const secondTimestamp = Date.parse(second.occurredAt ?? '');
        if (!Number.isFinite(firstTimestamp)) return Number.isFinite(secondTimestamp) ? 1 : 0;
        if (!Number.isFinite(secondTimestamp)) return -1;
        const difference = firstTimestamp - secondTimestamp;
        return this.conversationSort() === 'oldest' ? difference : -difference;
      });
  });
  readonly composer = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
  });
  readonly attachment = signal<LocalMessageAttachment | null>(null);
  readonly attachmentPreview = computed(() => {
    const attachment = this.attachment();
    return attachment ? `data:${attachment.mimeType};base64,${attachment.base64}` : null;
  });
  readonly queuedMessages = computed(() =>
    this.messaging
      .messages()
      .filter(
        (message) =>
          message.conversationId === this.store.selectedConversationId() &&
          !(
            message.state === 'sent' &&
            message.externalMessageId &&
            this.transcript().some((entry) => entry.externalId === message.externalMessageId)
          ),
      ),
  );
  readonly preparingAttachment = signal(false);
  readonly composerError = signal<string | null>(null);
  readonly imageIcon = LucideImagePlus;
  readonly sendIcon = LucideSend;
  readonly removeIcon = LucideTrash2;
  private draftRevision = 0;
  private openRevision = 0;
  readonly now = signal(Date.now());
  private readonly openingConversation = signal<{ context: string | null; id: string } | null>(
    null,
  );
  readonly isOpeningConversation = computed(() => {
    const opening = this.openingConversation();
    return (
      opening !== null &&
      opening.context === this.context() &&
      opening.id === this.store.selectedConversationId()
    );
  });
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
    const saved = this.savedConversation();
    if (current)
      return {
        ...current,
        itemImageUrl:
          current.itemImageUrl ??
          (saved?.key === this.conversationKey() ? saved.entry.itemImageUrl : null),
      };
    return saved?.key === this.conversationKey() ? saved.entry : null;
  });
  readonly transcript = computed(() =>
    [...(this.store.messages()?.items ?? [])].reverse().sort((first, second) => {
      const firstDate = Date.parse(first.occurredAt ?? '');
      const secondDate = Date.parse(second.occurredAt ?? '');
      if (!Number.isFinite(firstDate)) return Number.isFinite(secondDate) ? 1 : 0;
      if (!Number.isFinite(secondDate)) return -1;
      return firstDate - secondDate;
    }),
  );
  readonly datedTranscript = computed(() =>
    this.transcript().map((entry, index, entries) => ({
      entry,
      startsDay:
        index === 0 ||
        this.messageDay(entry.occurredAt) !== this.messageDay(entries[index - 1].occurredAt),
    })),
  );
  readonly hasPendingMessages = computed(() =>
    this.queuedMessages().some((message) =>
      ['queued', 'claimed', 'sending'].includes(message.state),
    ),
  );
  readonly lastActiveLabel = computed(() => {
    const timestamp = this.conversation()?.lastActiveAt;
    if (!timestamp) return 'Aktivität nicht verfügbar';
    const seconds = Math.max(0, (this.now() - Date.parse(timestamp)) / 1000);
    if (!Number.isFinite(seconds)) return 'Aktivität nicht verfügbar';
    if (seconds < 60) return 'Zuletzt aktiv gerade eben';
    const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
      seconds < 3600
        ? [Math.floor(seconds / 60), 'minute']
        : seconds < 86400
          ? [Math.floor(seconds / 3600), 'hour']
          : [Math.floor(seconds / 86400), 'day'];
    return `Zuletzt aktiv ${new Intl.RelativeTimeFormat('de', { numeric: 'always' }).format(-amount, unit)}`;
  });
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
    const clock = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
    effect(() => {
      this.context();
      const key = this.conversationKey();
      untracked(() => {
        const account = this.store.selectedConnection();
        const conversationId = this.store.selectedConversationId();
        this.draftRevision++;
        this.composer.reset();
        this.attachment.set(null);
        this.composerError.set(null);
        this.preparingAttachment.set(false);
        if (key && account && conversationId)
          void this.messaging.load(
            { workspaceId: account.workspaceId, connectionId: account.connectionId },
            conversationId,
          );
      });
    });
    effect(() => {
      const key = this.conversationKey();
      const entry = this.store
        .snapshot()
        ?.conversations.items.find((item) => item.id === this.store.selectedConversationId());
      untracked(() => {
        if (!key) this.savedConversation.set(null);
        else if (entry) {
          const previous = this.savedConversation();
          this.savedConversation.set({
            key,
            entry: {
              ...entry,
              itemImageUrl:
                entry.itemImageUrl ?? (previous?.key === key ? previous.entry.itemImageUrl : null),
            },
          });
        } else if (this.savedConversation()?.key !== key) this.savedConversation.set(null);
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
      if (entry) untracked(() => void this.openConversation(entry, false));
      else this.notice.set('Das verlinkte Gespräch ist für dieses Konto nicht verfügbar.');
    });
    afterEveryRender(() => this.restoreReadingPosition());
  }

  async openConversation(entry: MarketplaceEntry, readProvider = true): Promise<void> {
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
    const revision = ++this.openRevision;
    const context = this.context();
    const key = JSON.stringify([context, entry.id]);
    const previous = this.savedConversation();
    this.savedConversation.set({
      key,
      entry: {
        ...entry,
        itemImageUrl:
          entry.itemImageUrl ?? (previous?.key === key ? previous.entry.itemImageUrl : null),
      },
    });
    this.openingConversation.set({ context, id: entry.id });
    try {
      await this.store.openConversation(entry.id);
      if (
        readProvider &&
        account.executionMode === 'local' &&
        this.local.messagesAllowed() &&
        !this.store.error() &&
        context === this.context() &&
        revision === this.openRevision &&
        this.store.selectedConversationId() === entry.id
      ) {
        await this.local.openInboxConversation(entry.id);
        if (
          context === this.context() &&
          revision === this.openRevision &&
          this.store.selectedConversationId() === entry.id
        )
          await this.store.openConversation(entry.id);
      }
    } finally {
      if (revision === this.openRevision) this.openingConversation.set(null);
    }
  }

  private matchesFilter(entry: MarketplaceEntry, filter: ConversationFilter | null): boolean {
    switch (filter) {
      case 'unread':
        return entry.unread === true;
      case 'questions':
        return entry.text?.includes('?') === true && this.messageKind(entry) === 'text';
      case 'negotiating':
        return (
          this.messageKind(entry) === 'offer' ||
          entry.offerStatus === 'pending' ||
          entry.transactionStatus === 'negotiating'
        );
      case 'sold':
        return (
          ['sold', 'completed', 'transaction_completed'].includes(entry.transactionStatus ?? '') ||
          entry.eventType === 'transaction_completed'
        );
      case 'system':
        return (
          this.messageKind(entry) === 'system' || /^(?:vinted|support_vinted)$/i.test(entry.title)
        );
      default:
        return true;
    }
  }

  queueStatus(message: LocalQueuedMessage): string {
    switch (message.state) {
      case 'sent':
        return 'Gesendet';
      case 'failed':
        return 'Senden fehlgeschlagen';
      case 'outcome_unknown':
        return 'Versandstatus unklar – bitte auf Vinted prüfen';
      case 'cancelled':
        return 'Abgebrochen';
      case 'sending':
        return 'Wird gesendet';
      default:
        return 'In der Warteschlange';
    }
  }

  async selectAttachment(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const revision = ++this.draftRevision;
    this.composerError.set(null);
    this.preparingAttachment.set(false);
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      this.composerError.set('Wähle ein PNG- oder JPEG-Bild.');
      return;
    }
    this.preparingAttachment.set(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.25,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: file.type,
      });
      if (compressed.size > 256 * 1024)
        throw new Error(
          'Das Bild ist nach der Verkleinerung noch zu groß. Wähle ein kleineres Bild.',
        );
      const preview = await imageCompression.getDataUrlFromFile(compressed);
      if (revision !== this.draftRevision) return;
      const base64 = preview.slice(preview.indexOf(',') + 1);
      const extension = file.type === 'image/png' ? '.png' : '.jpg';
      const filename =
        file.name
          .replace(/\.[^.]*$/u, '')
          .replace(/[\p{Cc}/\\]/gu, '')
          .trim() || 'Nachrichtenbild';
      const name = `${[...filename].slice(0, 120 - extension.length).join('')}${extension}`;
      this.attachment.set({ name, mimeType: file.type, base64 });
    } catch (error) {
      if (revision === this.draftRevision)
        this.composerError.set(
          error instanceof Error ? error.message : 'Das Bild konnte nicht vorbereitet werden.',
        );
    } finally {
      if (revision === this.draftRevision) this.preparingAttachment.set(false);
    }
  }

  clearAttachment(): void {
    this.draftRevision++;
    this.attachment.set(null);
    this.preparingAttachment.set(false);
    this.composerError.set(null);
  }

  async sendMessage(): Promise<void> {
    const account = this.store.selectedConnection();
    const conversationId = this.store.selectedConversationId();
    const key = this.conversationKey();
    const text = this.composer.controls.text.value.trim();
    const attachment = this.attachment();
    if (
      !account ||
      account.executionMode !== 'local' ||
      account.status !== 'connected' ||
      !conversationId ||
      !key ||
      !this.store.canManage() ||
      this.composer.invalid ||
      (!text && !attachment) ||
      this.messaging.busy() ||
      this.preparingAttachment()
    )
      return;
    const accepted = await this.messaging.send(
      { workspaceId: account.workspaceId, connectionId: account.connectionId },
      conversationId,
      text,
      attachment,
    );
    if (
      accepted &&
      key === this.conversationKey() &&
      text === this.composer.controls.text.value.trim() &&
      attachment === this.attachment()
    ) {
      this.composer.reset();
      this.clearAttachment();
    }
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
      text: `Flipbase darf die Gesprächsliste und bereits gelesene Nachrichten von "${account.displayName}" über dieses Browserprofil übernehmen. Automatische Abrufe öffnen keine ungelesenen Verläufe. Wenn Du ein Gespräch bewusst öffnest, wird dessen Verlauf abgerufen. Es werden keine Nachrichten gesendet. Die vorhandene Freigabe gilt weiterhin bis zu ihrem Ablauf und kann in der Kontoverwaltung widerrufen werden.`,
      bestaetigenText: 'Nachrichtenzugriff erlauben',
    });
    if (accepted && context === this.context()) await this.local.approveInbox();
  }

  backToList(): void {
    this.openRevision++;
    this.openingConversation.set(null);
    this.focusListRow = this.store.selectedConversationId();
    this.focusConversation = null;
    this.store.clearConversation();
  }

  async retryMessages(): Promise<void> {
    const entry = this.conversation();
    this.failedRequest.set(null);
    if (entry) await this.openConversation(entry);
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
        .concat(this.queuedMessages().map((message) => `queue:${message.id}:${message.state}`))
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
    return entry.messageType === 'status_message' ||
      entry.messageType === 'action_message' ||
      entry.messageType === 'payment_message'
      ? 'system'
      : entry.messageType === 'offer_request_message' || entry.messageType === 'offer_message'
        ? 'offer'
        : 'text';
  }

  conversationTime(timestamp: string | null): string {
    return formatConversationTime(timestamp, this.now());
  }

  messageDayLabel(timestamp: string | null): string {
    return formatMessageDay(timestamp, this.now());
  }

  messageBody(entry: MarketplaceEntry): string | null {
    if (this.messageKind(entry) !== 'offer') return entry.text ?? entry.title;
    return this.offerText(entry.text) ?? this.offerText(entry.title);
  }

  offerTitle(entry: MarketplaceEntry): string | null {
    const title = this.offerText(entry.title);
    return title && this.offerText(entry.text) && title !== entry.text ? title : null;
  }

  private offerText(text: string | null | undefined): string | null {
    const trimmed = text?.trim();
    return !trimmed || /^(?:offer[ _-](?:request[ _-])?message|Nachricht|Angebot)$/i.test(trimmed)
      ? null
      : trimmed;
  }

  private messageDay(timestamp: string | null): string {
    return timestamp ? new Date(timestamp).toLocaleDateString('de-DE') : '';
  }

  offerLabel(entry: MarketplaceEntry): string {
    return entry.direction === 'outbound' ? 'Angebot gesendet' : 'Angebot erhalten';
  }

  offerPrices(entry: MarketplaceEntry): { offered: string | null; original: string | null } {
    const [offered, original] = (entry.priceLabel ?? '').split(' statt ');
    return { offered: offered || null, original: original || null };
  }

  offerStatusLabel(entry: MarketplaceEntry): string | null {
    switch (entry.offerStatus?.toLocaleLowerCase('de')) {
      case 'accepted':
      case '20':
        return 'Angenommen';
      case 'declined':
      case 'rejected':
      case '30':
        return 'Abgelehnt';
      case 'pending':
      case '10':
        return 'Offen';
      case 'cancelled':
      case '40':
        return 'Abgebrochen';
      default:
        return entry.offerStatus ?? null;
    }
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
    if (this.focusConversation === key && key && this.heading() && !this.isOpeningConversation()) {
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
      .concat(this.queuedMessages().map((message) => `queue:${message.id}:${message.state}`))
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
