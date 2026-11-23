import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { PageLayoutService } from '../../../../core/services/page-layout.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { FeedItem, PersonalFeed, recentFeedItems } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { DealFeedState } from '../../services/deal-feed-state';
import { DealFeedUpdatesService } from '../../services/deal-feed-updates.service';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { FeedClockService } from '../../services/feed-clock.service';
import { DealCardComponent } from '../deal-card/deal-card.component';
import { DealDetailModalComponent } from '../deal-detail-modal/deal-detail-modal.component';

const SLOW_MODE_STORAGE_KEY = 'flipbase:vinted-feed:slow-mode';
const RECONCILE_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-deal-feed-search',
  imports: [
    ButtonComponent,
    CardComponent,
    CustomCheckboxComponent,
    DealCardComponent,
    DealDetailModalComponent,
  ],
  templateUrl: './deal-feed-search.component.html',
  host: { class: '@container block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealFeedSearchComponent {
  readonly workspaceId = input.required<string>();
  readonly feed = input.required<PersonalFeed>();
  private readonly feedId = computed(() => this.feed().id);
  private readonly startedAt = computed(() => this.feed().started_at);
  private readonly active = computed(() => this.feed().is_active);
  private readonly api = inject(DealMonitorService);
  private readonly updates = inject(DealFeedUpdatesService);
  private readonly document = inject(DOCUMENT);
  private readonly clock = inject(FeedClockService);
  private readonly widescreen = inject(PageLayoutService).widescreen;
  readonly favorites = inject(DealFavoritesService);
  readonly state = new DealFeedState((request) => this.api.feed(request));
  readonly selectedDeal = signal<FeedItem | null>(null);
  readonly gridColumns = computed(() =>
    this.widescreen()
      ? 'grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]'
      : 'grid-cols-1 @min-[30rem]:grid-cols-2 @min-[46rem]:grid-cols-3 @min-[62rem]:grid-cols-4 @min-[78rem]:grid-cols-5',
  );
  readonly feedItems = computed(() =>
    recentFeedItems(this.state.items(), this.clock.now().getTime()),
  );
  readonly cardMotion = computed(() =>
    this.state.slowMode()
      ? 'motion-safe:duration-500 motion-safe:ease-out motion-safe:starting:-translate-x-12'
      : 'motion-safe:duration-200 motion-safe:starting:-translate-x-3',
  );
  readonly stale = computed(() => {
    const reportedAt = this.state.reportedAt();
    return reportedAt !== null && this.clock.now().getTime() - Date.parse(reportedAt) > 120_000;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.state.setSlowMode(this.readSlowModePreference());
    effect((onCleanup) => {
      const workspace = this.workspaceId();
      const watchlist = this.feedId();
      const active = this.active();
      const startedAt = this.startedAt();
      untracked(() => {
        this.selectedDeal.set(null);
        this.state.setContext(active && startedAt ? { workspace, watchlist } : null);
      });
      if (!active || !startedAt) return;
      const refresh = (delta: boolean) => {
        if (!this.document.hidden) this.state.notifyUpdate(delta);
      };
      const cleanup = this.updates.watch(workspace, refresh);
      const onVisibilityChange = () => refresh(false);
      const timer = setInterval(onVisibilityChange, RECONCILE_INTERVAL_MS);
      this.document.addEventListener('visibilitychange', onVisibilityChange);
      onCleanup(() => {
        cleanup();
        clearInterval(timer);
        this.document.removeEventListener('visibilitychange', onVisibilityChange);
      });
    });
    destroyRef.onDestroy(() => this.state.destroy());
  }

  slowModeChanged(enabled: boolean): void {
    this.state.setSlowMode(enabled);
    try {
      this.document.defaultView?.localStorage.setItem(SLOW_MODE_STORAGE_KEY, String(enabled));
    } catch {
      // Ohne Browserspeicher gilt die Wahl nur für diesen Besuch.
    }
  }

  private readSlowModePreference(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(SLOW_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
