import {
  VintedRelistingPlanStore,
  type VintedRelistingPlan,
} from '../../services/vinted-relisting-plan.store';
import {
  isVintedListingConfirmationPending,
  type VintedListingJob,
} from '../../models/vinted-listing-job';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import {
  VintedListingsTableComponent,
  type VintedWardrobeTableRow,
} from './vinted-listings-table.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  LucideLayoutGrid,
  LucideList,
  LucideBadgeEuro,
  LucideRotateCcw,
  LucideCopy,
  LucidePencil,
  LucideTrash2,
} from '@lucide/angular';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { VintedListingEditorComponent } from '../vinted-listing-editor/vinted-listing-editor.component';
import type { VintedListingEditorSource } from '../../models/vinted-listing-source';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { MarketplaceListingStatisticsStore } from '../../services/marketplace-listing-statistics.store';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingMetricsComponent } from './vinted-listing-metrics.component';
import { VintedListingAgeComponent } from '../vinted-listing-age/vinted-listing-age.component';
import { createVintedListingMetricDisplay } from './vinted-listing-metric-display';
import { vintedPublicationBadge } from '../../models/vinted-publication-state';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import { createVintedListingPriceEditor } from '../../services/vinted-listing-price-editor';
import { VintedListingPriceDialogComponent } from '../vinted-listing-price-dialog/vinted-listing-price-dialog.component';
import { VintedListingOperationStore } from '../../services/vinted-listing-operation.store';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';

@Component({
  selector: 'app-vinted-listings',
  imports: [
    CurrencyPipe,
    NgTemplateOutlet,
    VintedListingsTableComponent,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    CustomSelectComponent,
    ProductThumbnailComponent,
    VintedListingMetricsComponent,
    VintedListingAgeComponent,
    VintedListingPriceDialogComponent,
    ModalShellComponent,
    VintedListingEditorComponent,
    LoadingIndicatorComponent,
  ],
  templateUrl: './vinted-listings.component.html',
  providers: [MarketplaceListingStatisticsStore, VintedRelistingPlanStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block min-w-0 w-full max-w-full overflow-hidden' },
})
export class VintedListingsComponent {
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly gridIcon = LucideLayoutGrid;
  readonly listIcon = LucideList;
  readonly priceIcon = LucideBadgeEuro;
  readonly relistIcon = LucideRotateCcw;
  readonly templateIcon = LucideCopy;
  readonly editIcon = LucidePencil;
  readonly deleteIcon = LucideTrash2;
  private readonly confirm = inject(ConfirmDialogService);
  readonly plans = inject(VintedRelistingPlanStore);
  readonly editingPlan = signal<VintedListingJob | null>(null);
  readonly entries = computed(() => {
    const deleted = new Set(
      this.plans
        .plans()
        .flatMap((plan) =>
          plan.job.state === 'confirmed'
            ? [plan.job.relistExternalId, plan.job.externalId]
            : [plan.job.relistExternalId],
        ),
    );
    return (this.page()?.items ?? []).filter((entry) => !deleted.has(entry.externalId));
  });
  closeEditor(): void {
    this.editorSource.set(null);
    this.editingPlan.set(null);
    void this.plans.refresh();
  }
  focusEditorAction(): void {
    this.element?.nativeElement
      .querySelector<HTMLButtonElement>('app-modal-shell [data-review-opener] button')
      ?.focus();
  }
  readonly editorSource = signal<VintedListingEditorSource | null>(null);
  canCreateFrom(entry: MarketplaceEntry): boolean {
    return this.actionsVisible(entry) && !this.actionsBlocked(entry);
  }
  actionsVisible(entry: MarketplaceEntry): boolean {
    return this.canManageEntry(entry) && !!entry.externalId;
  }
  private canManageEntry(entry: MarketplaceEntry): boolean {
    return (
      this.store.canManage() &&
      entry.connectionId === this.store.selectedConnection()?.connectionId &&
      entry.workspaceId === this.store.selectedConnection()?.workspaceId &&
      this.store.selectedConnection()?.status === 'connected' &&
      this.store.selectedConnection()?.executionMode === 'cloud'
    );
  }
  priceActionVisible(entry: MarketplaceEntry): boolean {
    return this.canManageEntry(entry) && entry.publicationState !== 'draft';
  }
  actionsBlocked(entry: MarketplaceEntry): boolean {
    return (
      this.operations.isRunning(entry) ||
      this.operations
        .acceptedRelistings()
        .some((pending) => this.matchesPlan(pending.record.job, entry)) ||
      this.plans
        .plans()
        .some(
          (plan) =>
            plan.job.workspaceId === entry.workspaceId &&
            plan.job.connectionId === entry.connectionId &&
            this.matchesPlan(plan.job, entry),
        )
    );
  }
  isPreparingRelisting(entry: MarketplaceEntry): boolean {
    return this.operations
      .entries()
      .some(
        (action) =>
          action.kind === 'relist' &&
          action.state === 'running' &&
          action.workspaceId === entry.workspaceId &&
          action.connectionId === entry.connectionId &&
          action.entryId === entry.id,
      );
  }
  openEditor(entry: MarketplaceEntry, mode: 'relist' | 'template'): void {
    if (this.canCreateFrom(entry)) this.editorSource.set({ entry, mode });
  }
  editPlan(entry: MarketplaceEntry, plan: VintedRelistingPlan): void {
    if (!this.canManageEntry(entry) || this.operations.isRunning(entry)) return;
    const current = this.plans
      .plans()
      .find(
        (candidate) =>
          candidate.job.id === plan.job.id &&
          candidate.job.workspaceId === entry.workspaceId &&
          candidate.job.connectionId === entry.connectionId &&
          this.matchesPlan(candidate.job, entry),
      );
    // Ein bereits gestarteter Auftrag darf auch über einen alten Klickstand nicht geöffnet werden.
    if (current && this.plans.canEdit(current.job)) this.editingPlan.set(current.job);
  }
  readonly store = inject(MarketplaceAccountStore);
  readonly operations = inject(VintedListingOperationStore);
  readonly statistics = inject(MarketplaceListingStatisticsStore);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private handledConnectionId: string | null = null;
  readonly page = computed(() => this.store.snapshot()?.publications ?? null);
  readonly publicationBadge = vintedPublicationBadge;
  private readonly displayedEntries = signal<readonly MarketplaceEntry[]>([]);
  private displayedScope: string | null = null;
  readonly tableRows = computed<readonly VintedWardrobeTableRow[]>(() => {
    const account = this.store.selectedConnection();
    const plans = this.plans
      .plans()
      .filter(
        (plan) =>
          plan.job.workspaceId === account?.workspaceId &&
          plan.job.connectionId === account.connectionId,
      );
    const remaining = new Set(plans);
    const visible = new Set(this.entries().map((entry) => entry.id));
    const sources = this.displayedEntries().filter(
      (source) =>
        source.workspaceId === account?.workspaceId && source.connectionId === account.connectionId,
    );
    const rows = sources.flatMap((source) => {
      const plan = plans.find((candidate) => this.matchesPlan(candidate.job, source));
      if (plan) {
        const boundSource =
          sources.find((entry) => entry.id === plan.job.relistEntryId) ??
          sources.find((entry) => entry.externalId === plan.job.relistExternalId) ??
          sources.find((entry) => this.matchesPlan(plan.job, entry));
        if (source !== boundSource || !remaining.has(plan)) return [];
      }
      if (plan) remaining.delete(plan);
      return plan
        ? [this.listingRow(this.plannedEntry(plan, source), plan)]
        : visible.has(source.id)
          ? [this.listingRow(source)]
          : [];
    });
    return [
      ...rows,
      ...[...remaining].map((plan) => this.listingRow(this.plannedEntry(plan), plan)),
    ];
  });
  private matchesPlan(job: VintedListingJob, entry: MarketplaceEntry): boolean {
    return (
      job.workspaceId === entry.workspaceId &&
      job.connectionId === entry.connectionId &&
      (job.relistEntryId === entry.id ||
        job.relistExternalId === entry.externalId ||
        (!!job.externalId && job.externalId === entry.externalId))
    );
  }
  private listingRow(entry: MarketplaceEntry, plan?: VintedRelistingPlan): VintedWardrobeTableRow {
    const running =
      this.operations.isRunning(entry) ||
      plan?.job.state === 'claimed' ||
      plan?.job.state === 'writing' ||
      (!!plan && isVintedListingConfirmationPending(plan.job));
    return {
      entry,
      plan,
      change: this.statistics.change(entry),
      comparisonLabel: this.statistics.comparisonLabel(entry),
      highlighted: this.metricDisplay.highlighted().has(entry.id),
      running,
      runningLabel: plan?.label ?? (running ? this.operations.runningLabel(entry) : undefined),
    };
  }
  private plannedEntry(plan: VintedRelistingPlan, previous?: MarketplaceEntry): MarketplaceEntry {
    const content = plan.draft.content;
    const confirmed = plan.job.state === 'confirmed';
    const imported = confirmed
      ? this.page()?.items.find(
          (entry) =>
            entry.workspaceId === plan.job.workspaceId &&
            entry.connectionId === plan.job.connectionId &&
            entry.externalId === plan.job.externalId,
        )
      : undefined;
    return {
      workspaceId: plan.job.workspaceId,
      connectionId: plan.job.connectionId!,
      text: content.description,
      occurredAt: null,
      currency: 'EUR',
      status: content.conditionLabel || null,
      conversationId: null,
      direction: 'unknown',
      promoted: null,
      unread: null,
      brand: content.brandLabel || null,
      size: content.sizeLabel || null,
      shipmentStatus: null,
      messageType: null,
      priceLabel: null,
      publicationState: 'active',
      ...previous,
      ...imported,
      id: plan.job.relistEntryId ?? previous?.id ?? `relisting-${plan.job.id}`,
      externalId: confirmed ? plan.job.externalId : plan.job.relistExternalId,
      title: imported?.title ?? content.title,
      price: imported
        ? imported.price
        : content.priceCents === null
          ? null
          : content.priceCents / 100,
      imageUrl: imported?.imageUrl ?? plan.imageUrl ?? previous?.imageUrl ?? null,
      metrics: confirmed
        ? (imported?.metrics ?? { views: null, favorites: null, observedAt: null })
        : (previous?.metrics ?? { views: null, favorites: null, observedAt: null }),
      publishedAt: confirmed ? (imported?.publishedAt ?? null) : previous?.publishedAt,
      createdAt: confirmed ? (imported?.createdAt ?? null) : previous?.createdAt,
      publicationAge: confirmed ? (imported?.publicationAge ?? null) : previous?.publicationAge,
    };
  }
  readonly priceEntry = signal<MarketplaceEntry | null>(null);
  readonly savingPrice = signal(false);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
  private readonly priceContext = computed(() => {
    const connection = this.store.selectedConnection();
    return JSON.stringify([
      this.store.selectionVersion(),
      this.store.canManage(),
      connection?.workspaceId,
      connection?.connectionId,
      connection?.status,
      connection?.executionMode,
    ]);
  });
  private priceTrigger: HTMLElement | null = null;
  readonly priceEditor = createVintedListingPriceEditor({
    store: this.store,
    entry: () => this.priceEntry(),
    busy: this.savingPrice,
    priceRead: (price) => this.priceEntry.update((entry) => (entry ? { ...entry, price } : entry)),
    closed: () => {
      afterNextRender(
        () => {
          if (this.priceTrigger?.isConnected) this.priceTrigger.focus();
          else this.element?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
        },
        { injector: this.injector },
      );
    },
  });
  readonly metricDisplay = createVintedListingMetricDisplay(
    this.store,
    () => this.page()?.items ?? [],
  );

  constructor() {
    effect(() => {
      const account = this.store.selectedConnection();
      const scope = account
        ? JSON.stringify([account.workspaceId, account.connectionId, account.externalAccountId])
        : null;
      const entries = (this.page()?.items ?? []).filter(
        (entry) =>
          entry.workspaceId === account?.workspaceId && entry.connectionId === account.connectionId,
      );
      const plannedIds = new Set(
        this.plans
          .plans()
          .filter(
            (plan) =>
              plan.job.workspaceId === account?.workspaceId &&
              plan.job.connectionId === account.connectionId,
          )
          .map((plan) => plan.job.relistExternalId),
      );
      untracked(() => {
        const previous = scope === this.displayedScope ? this.displayedEntries() : [];
        const next = [...entries];
        // Beim Entfernen des alten Vinted-Inserats bleiben Karte und Aktionsleiste stehen.
        previous.forEach((entry, index) => {
          if (
            plannedIds.has(entry.externalId) &&
            !next.some(
              (current) => current.id === entry.id || current.externalId === entry.externalId,
            )
          )
            next.splice(Math.min(index, next.length), 0, entry);
        });
        this.displayedScope = scope;
        this.displayedEntries.set(next);
      });
    });
    effect(() => {
      this.priceContext();
      untracked(() => {
        this.priceEditor.reset();
        this.priceEntry.set(null);
        this.savingPrice.set(false);
      });
    });
    effect(() => {
      const entry = this.priceEntry();
      if (entry && this.actionsBlocked(entry) && !this.savingPrice()) {
        untracked(() => {
          this.priceEditor.reset();
          this.priceEntry.set(null);
        });
      }
    });
    effect(() => {
      const connectionId = this.queryParams().get('connectionId');
      const connections = this.store.connections();
      const loading = this.store.loading();
      const workspaceId = this.workspace.currentWorkspace()?.id;
      untracked(() => {
        if (!connectionId) {
          this.handledConnectionId = null;
          return;
        }
        if (this.handledConnectionId === connectionId || loading || !workspaceId) return;
        this.handledConnectionId = connectionId;
        const account = connections.find(
          (item) => item.connectionId === connectionId && item.workspaceId === workspaceId,
        );
        if (account) void this.selectLinkedConnection(connectionId, workspaceId);
      });
    });
  }

  async deleteListing(entry: MarketplaceEntry): Promise<void> {
    if (!this.canCreateFrom(entry)) return;
    const confirmed = await this.confirm.frage({
      titel: 'Inserat löschen?',
      text: entry.title,
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (!confirmed || !this.canCreateFrom(entry)) return;
    // Fehler bleiben in „Laufende Aktionen“ sichtbar, auch nach dem Schließen des Dialogs.
    await this.operations
      .deleteListing(entry, () => this.store.deleteListing(entry.connectionId, entry.id))
      .catch(() => undefined);
  }

  changePrice(entry: MarketplaceEntry, event: MouseEvent): void {
    if (this.actionsBlocked(entry) || this.priceEditor.open() || !this.priceEditor.available(entry))
      return;
    this.priceTrigger = event.target instanceof Element ? event.target.closest('button') : null;
    this.priceEntry.set(entry);
    this.priceEditor.show();
  }
  async savePrice(): Promise<void> {
    const entry = this.priceEntry();
    if (entry && !this.actionsBlocked(entry)) await this.priceEditor.save();
  }

  private async selectLinkedConnection(connectionId: string, workspaceId: string): Promise<void> {
    const selection = this.store.selectionVersion();
    const navigated = await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { connectionId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (
      !navigated ||
      this.workspace.currentWorkspace()?.id !== workspaceId ||
      selection !== this.store.selectionVersion()
    )
      return;
    if (this.store.selectedConnection()?.connectionId !== connectionId)
      await this.store.selectConnection(connectionId);
  }
}
