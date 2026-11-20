import { DatePipe, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucideListTodo, LucideLoader2, LucideX, type LucideIconData } from '@lucide/angular';
import { ActionStatusIndicatorComponent } from '../../../../shared/components/action-status-indicator/action-status-indicator.component';
import { ActionStatusThumbnailComponent } from '../../../../shared/components/action-status-thumbnail/action-status-thumbnail.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import {
  SegmentedTabsComponent,
  type SegmentedTab,
} from '../../../../shared/components/segmented-tabs/segmented-tabs.component';
import { isVintedListingConfirmationPending } from '../../models/vinted-listing-job';
import {
  actionDrawerItems,
  pastActions,
  runningActionQueue,
  vintedAccountActionIndicator,
} from '../../models/vinted-action-drawer';
import { VintedActionOverviewHeaderStore } from '../../services/vinted-action-overview-header.store';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenActionStore } from '../../services/kleinanzeigen-action.store';
import { VintedListingOperationStore } from '../../services/vinted-listing-operation.store';
import {
  VintedAccountActionStore,
  type VintedAccountActionEntry,
} from '../../services/vinted-account-action.store';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';
import {
  vintedAccountActionStatus,
  vintedAccountActionTitle,
  type VintedAccountAction,
} from '../../models/vinted-account-action';
import { VintedActionOverviewComponent } from '../vinted-action-overview/vinted-action-overview.component';
import { VintedListingActionOverviewComponent } from '../vinted-listing-action-overview/vinted-listing-action-overview.component';

type ActionTab = 'running' | 'past';

@Component({
  selector: 'app-vinted-action-overview-menu',
  imports: [
    DatePipe,
    NgOptimizedImage,
    NgTemplateOutlet,
    ActionStatusIndicatorComponent,
    ActionStatusThumbnailComponent,
    ButtonComponent,
    LoadingIndicatorComponent,
    NoticeBannerComponent,
    ModalShellComponent,
    SegmentedTabsComponent,
    VintedActionOverviewComponent,
    VintedListingActionOverviewComponent,
  ],
  templateUrl: './vinted-action-overview-menu.component.html',
  providers: [KleinanzeigenExtensionBridge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex' },
})
export class VintedActionOverviewMenuComponent {
  readonly store = inject(VintedActionOverviewHeaderStore);
  readonly extension = inject(KleinanzeigenExtensionBridge);
  readonly kleinanzeigen = inject(KleinanzeigenActionStore);
  readonly listingOperations = inject(VintedListingOperationStore);
  readonly accountActions = inject(VintedAccountActionStore);
  private readonly images = inject(VintedListingImageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly accountActionTitle = vintedAccountActionTitle;
  readonly accountActionStatus = vintedAccountActionStatus;
  readonly accountActionIndicator = vintedAccountActionIndicator;
  readonly opened = signal(false);
  readonly tab = signal<ActionTab>('running');
  /** Signierte erste Entwurfsfotos je Speicherpfad. */
  readonly coverUrls = signal<ReadonlyMap<string, string>>(new Map());

  readonly items = computed(() =>
    actionDrawerItems({
      accountActions: this.accountActions.entries(),
      operations: this.listingOperations.entries(),
      overviewGroups: this.store.groups(),
      listings: this.store.listings(),
      kleinanzeigen: this.kleinanzeigen.entries(),
    }),
  );
  readonly runningQueue = computed(() => runningActionQueue(this.items()));
  readonly past = computed(() => pastActions(this.items()));
  readonly tabs = computed<readonly SegmentedTab[]>(() => [
    { value: 'running', label: 'Laufend', count: this.runningQueue().length },
    { value: 'past', label: 'Vergangen', count: this.past().length },
  ]);

  readonly count = computed(
    () =>
      this.store.count() +
      this.accountActions.count() +
      this.kleinanzeigen.runningCount() +
      this.listingOperations.runningCount(),
  );
  readonly hasRunning = computed(
    () =>
      this.store.hasRunning() ||
      this.accountActions.hasRunning() ||
      this.kleinanzeigen.runningCount() > 0 ||
      this.listingOperations.runningCount() > 0,
  );
  readonly hasFailure = computed(
    () =>
      this.kleinanzeigen.hasFailure() ||
      this.accountActions.hasFailure() ||
      this.listingOperations.entries().some((action) => action.state === 'error') ||
      !!this.store.error() ||
      this.store
        .groups()
        .some((group) =>
          group.actions.some((action) => ['failed', 'outcome_unknown'].includes(action.state)),
        ) ||
      this.store
        .listings()
        .some(
          ({ job }) =>
            ['failed', 'outcome_unknown'].includes(job.state) &&
            !isVintedListingConfirmationPending(job),
        ),
  );
  readonly label = computed(() => `Laufende Aktionen (${this.count()})`);
  readonly queueIcon = LucideListTodo;
  readonly runningIcon: LucideIconData = {
    ...LucideLoader2.icon,
    node: LucideLoader2.icon.node.map(([element, attributes]) => [
      element,
      { ...attributes, class: 'origin-center animate-spin motion-reduce:animate-none' },
    ]),
  };
  readonly closeIcon = LucideX;

  constructor() {
    effect(() => {
      this.store.context();
      untracked(() => this.close(false));
    });
    // Entwurfsfotos werden erst beim Öffnen und nur für Aufträge ohne Vinted-Bild signiert.
    effect(() => {
      if (!this.opened()) return;
      const known = untracked(this.coverUrls);
      const paths = this.store
        .listings()
        .flatMap(({ job }) =>
          !job.imageUrl && job.coverStoragePath && !known.has(job.coverStoragePath)
            ? [job.coverStoragePath]
            : [],
        );
      if (!paths.length) return;
      void this.images.coverUrls(paths).then((urls) => {
        if (urls.size) this.coverUrls.update((current) => new Map([...current, ...urls]));
      });
    });
  }

  coverUrl(path: string | null | undefined): string | null {
    return path ? (this.coverUrls().get(path) ?? null) : null;
  }

  toggle(): void {
    if (this.opened()) return this.close();
    this.tab.set(this.runningQueue().length || !this.past().length ? 'running' : 'past');
    this.opened.set(true);
    void this.store.refresh();
    void this.accountActions.refresh();
  }

  close(restoreFocus = true): void {
    if (!this.opened()) return;
    this.opened.set(false);
    if (restoreFocus)
      this.host.nativeElement
        .querySelector<HTMLElement>('[data-action-overview-trigger] button')
        ?.focus();
  }

  selectTab(value: string): void {
    this.tab.set(value === 'past' ? 'past' : 'running');
  }

  blockedByEntry(action: VintedAccountAction): VintedAccountActionEntry | undefined {
    if (
      action.state !== 'queued' ||
      action.waitReason !== 'dependency_unresolved' ||
      !action.blockedByActionId
    )
      return undefined;
    return this.accountActions
      .entries()
      .find(
        (candidate) =>
          candidate.action.id === action.blockedByActionId &&
          candidate.action.state === 'outcome_unknown',
      );
  }
}
