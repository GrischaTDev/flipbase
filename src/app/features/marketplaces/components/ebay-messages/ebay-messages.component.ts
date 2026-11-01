import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LucideArrowLeft,
  LucideRefreshCw,
  LucideSend,
  LucideCheck,
  LucideExternalLink,
} from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EbayInboxStore } from '../../services/ebay-inbox.store';
import type { EbayConversation } from '../../../../../../supabase/functions/_shared/ebay-message-contracts';

type InboxFilter = 'members' | 'unread' | 'ebay';
@Component({
  selector: 'app-ebay-messages',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    ButtonComponent,
    PageHeaderComponent,
    TextFieldComponent,
    CustomSearchInputComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ebay-messages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class EbayMessagesComponent {
  readonly store = inject(EbayInboxStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  readonly search = signal('');
  readonly filter = signal<InboxFilter>('members');
  readonly filterOptions: readonly SelectOption<InboxFilter>[] = [
    { value: 'members', label: 'Mitglieder' },
    { value: 'unread', label: 'Ungelesen' },
    { value: 'ebay', label: 'Von eBay' },
  ];
  readonly reply = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(2000)],
  });
  private readonly drafts = new Map<string, string>();
  readonly refreshIcon = LucideRefreshCw;
  readonly backIcon = LucideArrowLeft;
  readonly sendIcon = LucideSend;
  readonly checkIcon = LucideCheck;
  readonly externalIcon = LucideExternalLink;
  readonly conversations = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('de');
    return this.store
      .conversations()
      .filter(
        (item) =>
          !query ||
          `${item.title} ${item.latestMessage?.sender ?? ''} ${item.latestMessage?.recipient ?? ''} ${item.latestMessage?.text ?? ''}`
            .toLocaleLowerCase('de')
            .includes(query),
      );
  });
  constructor() {
    effect(() => {
      const user = this.auth.currentUser(),
        workspace = this.workspace.currentWorkspace();
      untracked(() => {
        this.reply.reset();
        this.drafts.clear();
        this.search.set('');
        this.filter.set('members');
        if (user && workspace && !workspace.archived_at)
          void this.store.activate(user.id, workspace.id);
        else this.store.clear();
      });
    });
    effect(() => {
      const canReply = this.store.canReply();
      untracked(() => {
        if (canReply) this.reply.enable({ emitEvent: false });
        else this.reply.disable({ emitEvent: false });
      });
    });
    inject(DestroyRef).onDestroy(() => this.store.clear());
  }
  async changeFilter(value: InboxFilter | null): Promise<void> {
    if (!value || this.store.loading() || this.store.reading() || this.store.sending()) return;
    this.keepDraft();
    this.reply.reset();
    this.filter.set(value);
    await this.store.filter(value === 'ebay' ? 'FROM_EBAY' : 'FROM_MEMBERS', value === 'unread');
  }
  private keepDraft(): void {
    const selected = this.store.selected();
    if (selected) this.drafts.set(selected.id, this.reply.value);
  }
  async open(conversation: EbayConversation): Promise<void> {
    if (this.store.sending() || this.store.loading() || this.store.reading()) return;
    this.keepDraft();
    this.reply.setValue(this.drafts.get(conversation.id) ?? '');
    await this.store.open(conversation);
  }
  close(): void {
    this.keepDraft();
    this.store.close();
  }
  async send(): Promise<void> {
    if (this.reply.invalid) {
      this.reply.markAsTouched();
      return;
    }
    if (await this.store.send(this.reply.value)) {
      this.reply.reset();
      this.keepDraft();
    }
  }
  async confirmReviewed(): Promise<void> {
    const conversation = this.store.selected();
    if (!conversation || this.store.sending() || this.store.reading()) return;
    const confirmed = await this.dialog.frage({
      titel: 'Nachrichtenverlauf geprüft?',
      text: 'Prüfe direkt bei eBay, ob Deine letzte Nachricht angekommen ist. Erlaube einen neuen Versand erst, wenn dadurch keine doppelte Nachricht entsteht.',
      bestaetigenText: 'Verlauf geprüft',
      abbrechenText: 'Zurück',
    });
    if (!confirmed || this.store.selected()?.id !== conversation.id) return;
    await this.store.open(conversation);
    if (!this.store.conversationError() && this.store.selected()?.id === conversation.id)
      this.store.confirmReviewed();
  }
  private hasDrafts(): boolean {
    this.keepDraft();
    return [...this.drafts.values()].some((text) => text.trim().length > 0);
  }
  canLeave(): boolean | Promise<boolean> {
    if (this.store.sending()) return false;
    return (
      !this.hasDrafts() ||
      this.dialog.frage({
        titel: 'Postfach verlassen?',
        text: 'Deine noch nicht gesendeten Antworten werden verworfen.',
        bestaetigenText: 'Verlassen',
        abbrechenText: 'Weiter schreiben',
      })
    );
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.sending() || this.hasDrafts()) event.preventDefault();
  }
}
