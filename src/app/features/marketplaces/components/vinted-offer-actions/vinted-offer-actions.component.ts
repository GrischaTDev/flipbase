import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import {
  negotiationStateLabels,
  validateCounterPrice,
  type NegotiationAction,
  type NegotiationState,
} from '../../models/vinted-negotiation';
import {
  NegotiationApiError,
  VintedNegotiationApiService,
} from '../../services/vinted-negotiation-api.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedMessagingStore } from '../../services/vinted-messaging.store';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedNegotiationActionStore } from '../../services/vinted-negotiation-action.store';
import { VintedActionOverviewStore } from '../../services/vinted-action-overview.store';

@Component({
  selector: 'app-vinted-offer-actions',
  templateUrl: './vinted-offer-actions.component.html',
  imports: [ReactiveFormsModule, ButtonComponent, ModalShellComponent, NumberInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedOfferActionsComponent {
  readonly entry = input.required<MarketplaceEntry>();
  readonly available = input.required<boolean>();
  private readonly api = inject(VintedNegotiationApiService);
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly messaging = inject(VintedMessagingStore);
  private readonly local = inject(VintedLocalExtensionStore);
  private readonly actions = inject(VintedNegotiationActionStore);
  private readonly overview = inject(VintedActionOverviewStore, { optional: true });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly dialogOpen = signal(false);
  private readonly restoredReceipt = computed(() => {
    const entry = this.entry();
    const restored = this.overview
      ?.actions()
      .filter(
        (action) =>
          action.source === 'negotiation' &&
          !action.isAutomated &&
          action.messageId === entry.id &&
          action.conversationId === entry.conversationId &&
          action.offerId === entry.negotiationOffer?.offerId &&
          action.kind !== 'message' &&
          action.kind !== 'sync',
      )
      .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
    if (
      restored &&
      (restored.kind === 'accept' || restored.kind === 'decline' || restored.kind === 'counter')
    ) {
      const states: Record<typeof restored.state, NegotiationState> = {
        queued: 'queued',
        running: 'sending',
        succeeded: 'sent',
        failed: 'failed',
        outcome_unknown: 'outcome_unknown',
        cancelled: 'cancelled',
        skipped: 'skipped',
      };
      return { id: restored.sourceId, action: restored.kind, state: states[restored.state] };
    }
    return null;
  });
  readonly receipt = computed(
    () =>
      this.restoredReceipt() ?? this.actions.receipts().get(this.actions.key(this.entry())) ?? null,
  );
  readonly receiptLabel = computed(() => {
    const receipt = this.receipt();
    if (!receipt) return '';
    if (receipt.state === 'sent') return this.confirmedLabels[receipt.action];
    if (receipt.state === 'queued')
      return {
        accept: 'Annahme beauftragt',
        decline: 'Ablehnung beauftragt',
        counter: 'Gegenangebot beauftragt',
      }[receipt.action];
    if (receipt.state === 'claimed' || receipt.state === 'sending')
      return {
        accept: 'Angebot wird angenommen',
        decline: 'Angebot wird abgelehnt',
        counter: 'Gegenangebot wird gesendet',
      }[receipt.action];
    return this.labels[receipt.state];
  });
  readonly statusReady = computed(() => this.overview?.hasLoaded() ?? true);
  readonly statusReadError = computed(() => this.overview?.error() ?? null);
  readonly showManualRefresh = computed(() => !this.overview?.enabled());
  readonly counterPrice = new FormControl<number | null>(null);
  private readonly enteredPrice = toSignal(this.counterPrice.valueChanges, { initialValue: null });
  readonly minimumCounterPrice = computed(() =>
    Math.ceil((this.entry().negotiationOffer?.originalPriceCents ?? 0) / 2),
  );
  readonly counterPreview = computed(() => {
    const offer = this.entry().negotiationOffer;
    if (!offer) return null;
    const cents = validateCounterPrice(
      this.enteredPrice(),
      offer.originalPriceCents,
      offer.offeredPriceCents,
    );
    return cents === null
      ? null
      : {
          priceCents: cents,
          discountCents: offer.originalPriceCents - cents,
        };
  });
  formatPrice(cents: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      cents / 100,
    );
  }
  readonly labels = negotiationStateLabels;
  readonly confirmedLabels = {
    accept: 'Angebot angenommen',
    decline: 'Angebot abgelehnt',
    counter: 'Gegenangebot gesendet',
  };
  private readonly context = computed(() => {
    const entry = this.entry();
    const account = this.accounts.selectedConnection();
    return JSON.stringify([
      this.actions.key(entry),
      entry.workspaceId,
      entry.connectionId,
      entry.id,
      entry.negotiationOffer,
      account?.workspaceId,
      account?.connectionId,
      account?.externalAccountId,
      this.accounts.selectionVersion(),
      this.accounts.selectedConversationId(),
    ]);
  });
  private destroyed = false;
  constructor() {
    effect(() => {
      const receipt = this.restoredReceipt();
      const key = this.actions.key(this.entry());
      if (receipt) untracked(() => this.actions.record(key, receipt, receipt.action));
    });
    effect(() => {
      this.context();
      untracked(() => {
        this.busy.set(false);
        this.error.set(null);
        this.dialogOpen.set(false);
        this.counterPrice.reset();
      });
    });
    const timer = setInterval(() => {
      if (this.receipt() && !this.busy() && document.visibilityState !== 'hidden')
        void this.refresh();
    }, 15_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
    });
  }
  private permitted() {
    const account = this.accounts.selectedConnection();
    const entry = this.entry();
    return (
      this.available() &&
      this.statusReady() &&
      this.accounts.canManage() &&
      account?.status === 'connected' &&
      account.workspaceId === entry.workspaceId &&
      account.connectionId === entry.connectionId &&
      account.externalAccountId === entry.negotiationOffer?.sellerId &&
      this.accounts.selectedConversationId() === entry.conversationId &&
      this.messaging.canSend() &&
      (account.executionMode === 'cloud'
        ? this.messaging.cloudSendAllowed()
        : this.local.hasValidBinding() && this.local.binding()?.messagesSend === true)
    );
  }
  openCounter() {
    if (!this.permitted() || this.busy() || this.receipt()) return;
    this.error.set(null);
    this.counterPrice.setValue(null);
    this.dialogOpen.set(true);
  }
  closeCounter() {
    if (!this.busy()) this.dialogOpen.set(false);
  }
  async queue(action: NegotiationAction) {
    const entry = this.entry();
    const offer = entry.negotiationOffer;
    const account = this.accounts.selectedConnection();
    if (
      !offer ||
      !account ||
      !entry.conversationId ||
      !this.permitted() ||
      this.busy() ||
      this.receipt()
    )
      return;
    const price =
      action === 'counter'
        ? validateCounterPrice(
            this.counterPrice.value,
            offer.originalPriceCents,
            offer.offeredPriceCents,
          )
        : null;
    if (action === 'counter' && price === null) {
      this.error.set(
        'Gib einen centgenauen Gegenpreis über dem Käuferangebot ein. Er darf höchstens den Artikelpreis und mindestens dessen Hälfte betragen.',
      );
      return;
    }
    const context = this.context();
    const key = this.actions.key(entry);
    const requestId = this.actions.request(key, action, price);
    if (!requestId) {
      this.error.set(
        'Eine frühere Anfrage ist noch offen. Wiederhole dieselbe Aktion mit demselben Preis und prüfe den Verlauf.',
      );
      return;
    }
    let definitive = false;
    this.busy.set(true);
    this.error.set(null);
    try {
      const receipt = await this.api.enqueue(
        account,
        entry.conversationId,
        entry.id,
        requestId,
        action,
        price,
      );
      definitive = true;
      this.actions.record(key, receipt, action);
      void this.overview?.refresh();
      if (!this.current(context)) return;
      this.dialogOpen.set(false);
    } catch (error) {
      definitive =
        error instanceof NegotiationApiError &&
        ['22023', '42501', '40001', '23505'].includes(error.code);
      if (this.current(context))
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Aktion konnte nicht vorgemerkt werden. Versuche dieselbe Aktion erneut.',
        );
    } finally {
      this.actions.finish(key, definitive);
      if (this.current(context)) this.busy.set(false);
    }
  }
  async refresh() {
    if (this.overview) {
      const context = this.context();
      await this.overview.refresh();
      if (this.current(context)) this.error.set(this.overview.error());
      return;
    }
    const receipt = this.receipt();
    const context = this.context();
    const account = this.accounts.selectedConnection();
    if (!receipt || !account || this.busy()) return;
    this.busy.set(true);
    try {
      const settings = await this.api.read(account);
      if (!this.current(context)) return;
      const event = settings.events.find((event) => event.id === receipt.id);
      if (event) this.actions.record(this.actions.key(this.entry()), event);
    } catch (error) {
      if (this.current(context))
        this.error.set(
          error instanceof Error ? error.message : 'Der Aktionsstatus konnte nicht geladen werden.',
        );
    } finally {
      if (this.current(context)) this.busy.set(false);
    }
  }
  private current(context: string) {
    return !this.destroyed && context === this.context();
  }
}
