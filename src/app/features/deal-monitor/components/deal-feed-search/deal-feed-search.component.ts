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
import { LucideDynamicIcon, LucideRotateCcw, LucideSlidersHorizontal } from '@lucide/angular';
import { PageLayoutService } from '../../../../core/services/page-layout.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  FeedItem,
  LiveFeedFilter,
  PersonalFeed,
  availableLiveSizes,
  effectiveFeedPriceBounds,
  filterLiveFeedItems,
  recentFeedItems,
} from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { DealFeedState } from '../../services/deal-feed-state';
import { DealFeedUpdatesService } from '../../services/deal-feed-updates.service';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { FeedClockService } from '../../services/feed-clock.service';
import { discoveryAge } from '../../utils/discovery-date';
import { DealCardComponent } from '../deal-card/deal-card.component';
import { DealDetailModalComponent } from '../deal-detail-modal/deal-detail-modal.component';

const RECONCILE_INTERVAL_MS = 15_000;
const LIVE_FILTER_STORAGE_PREFIX = 'flipbase:vinted-feed:live-filters:';

export function liveFilterStorageKey(workspaceId: string, feedId: string): string {
  return `${LIVE_FILTER_STORAGE_PREFIX}${workspaceId}:${feedId}`;
}

function normalizePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

@Component({
  selector: 'app-deal-feed-search',
  imports: [
    ButtonComponent,
    CardComponent,
    CustomSearchInputComponent,
    DealCardComponent,
    DealDetailModalComponent,
    FormFieldComponent,
    LucideDynamicIcon,
    NumberInputComponent,
  ],
  templateUrl: './deal-feed-search.component.html',
  host: { class: '@container flex min-h-0 min-w-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealFeedSearchComponent {
  readonly workspaceId = input.required<string>();
  readonly feed = input.required<PersonalFeed>();
  readonly compact = input(false);
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
  readonly icons = {
    filter: LucideSlidersHorizontal,
    reset: LucideRotateCcw,
  };

  readonly liveQuery = signal('');
  readonly liveSizes = signal<string[]>([]);
  readonly liveMinPrice = signal<number | null>(null);
  readonly liveMaxPrice = signal<number | null>(null);
  readonly compactFiltersOpen = signal(false);

  readonly priceBounds = computed(() => effectiveFeedPriceBounds(this.feed()));
  readonly sizeChoices = computed(() => availableLiveSizes(this.feed()));
  readonly showSizeFilter = computed(() => this.sizeChoices().length > 1);
  readonly hasLiveFilters = computed(
    () =>
      this.liveQuery().trim().length > 0 ||
      this.liveSizes().length > 0 ||
      this.liveMinPrice() !== null ||
      this.liveMaxPrice() !== null,
  );
  readonly showFilterPanel = computed(() => !this.compact() || this.compactFiltersOpen());

  readonly priceBoundHint = computed(() => {
    const bounds = this.priceBounds();
    const min = this.liveMinPrice();
    const max = this.liveMaxPrice();
    if (min !== null && this.feed().price_from !== null && min < bounds.min) {
      return `Mindestpreis des Feeds ist ${bounds.min} €.`;
    }
    if (max !== null && bounds.max !== null && max > bounds.max) {
      return `Höchstpreis des Feeds ist ${bounds.max} €.`;
    }
    if (min !== null && max !== null && min > max) {
      return 'Mindestpreis darf nicht über dem Höchstpreis liegen.';
    }
    return null;
  });

  readonly gridColumns = computed(() => {
    if (this.compact()) {
      return 'grid-cols-3 @min-[42rem]:grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))]';
    }
    return this.widescreen()
      ? 'grid-cols-1 @min-[28rem]:grid-cols-2 @min-[42rem]:grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))]'
      : 'grid-cols-1 @min-[30rem]:grid-cols-2 @min-[46rem]:grid-cols-3 @min-[62rem]:grid-cols-4 @min-[78rem]:grid-cols-5';
  });

  readonly recentItems = computed(() =>
    recentFeedItems(this.state.items(), this.clock.now().getTime()),
  );
  readonly feedItems = computed(() =>
    filterLiveFeedItems(this.recentItems(), this.feed(), {
      query: this.liveQuery(),
      sizes: this.liveSizes(),
      minPrice: this.liveMinPrice(),
      maxPrice: this.liveMaxPrice(),
    }),
  );

  readonly stale = computed(() => {
    const reportedAt = this.state.reportedAt();
    return reportedAt !== null && this.clock.now().getTime() - Date.parse(reportedAt) > 120_000;
  });

  readonly checkedAgeLabel = computed(() => {
    const timestamp = this.state.lastCheckedAt();
    return timestamp ? discoveryAge(timestamp, this.clock.now()) : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect((onCleanup) => {
      const workspace = this.workspaceId();
      const watchlist = this.feedId();
      const active = this.active();
      const startedAt = this.startedAt();
      untracked(() => {
        this.selectedDeal.set(null);
        this.restoreLiveFilters(workspace, watchlist);
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

  setLiveQuery(query: string): void {
    this.liveQuery.set(query);
    this.persistLiveFilters();
  }

  setLiveMinPrice(value: number | null): void {
    this.liveMinPrice.set(normalizePrice(value));
    this.persistLiveFilters();
  }

  setLiveMaxPrice(value: number | null): void {
    this.liveMaxPrice.set(normalizePrice(value));
    this.persistLiveFilters();
  }

  toggleLiveSize(size: string): void {
    this.liveSizes.update((current) =>
      current.includes(size) ? current.filter((entry) => entry !== size) : [...current, size],
    );
    this.persistLiveFilters();
  }

  resetLiveFilters(): void {
    this.liveQuery.set('');
    this.liveSizes.set([]);
    this.liveMinPrice.set(null);
    this.liveMaxPrice.set(null);
    this.persistLiveFilters();
  }

  private restoreLiveFilters(workspaceId: string, feedId: string): void {
    const allowedSizes = new Set(this.sizeChoices().map((option) => option.value));
    const stored = this.readStoredLiveFilters(workspaceId, feedId);
    this.liveQuery.set(stored?.query ?? '');
    this.liveSizes.set((stored?.sizes ?? []).filter((size) => allowedSizes.has(size)));
    this.liveMinPrice.set(stored?.minPrice ?? null);
    this.liveMaxPrice.set(stored?.maxPrice ?? null);
  }

  private readStoredLiveFilters(workspaceId: string, feedId: string): LiveFeedFilter | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(
        liveFilterStorageKey(workspaceId, feedId),
      );
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const record = parsed as Record<string, unknown>;
      const sizes = Array.isArray(record['sizes'])
        ? Array.from(
            new Set(record['sizes'].filter((entry): entry is string => typeof entry === 'string')),
          )
        : [];
      return {
        query: typeof record['query'] === 'string' ? record['query'] : '',
        sizes,
        minPrice: normalizePrice(record['minPrice']),
        maxPrice: normalizePrice(record['maxPrice']),
      };
    } catch {
      return null;
    }
  }

  private persistLiveFilters(): void {
    const key = liveFilterStorageKey(this.workspaceId(), this.feedId());
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return;
      const filter: LiveFeedFilter = {
        query: this.liveQuery(),
        sizes: this.liveSizes(),
        minPrice: this.liveMinPrice(),
        maxPrice: this.liveMaxPrice(),
      };
      if (
        !filter.query.trim() &&
        filter.sizes.length === 0 &&
        filter.minPrice === null &&
        filter.maxPrice === null
      ) {
        storage.removeItem(key);
        return;
      }
      storage.setItem(key, JSON.stringify(filter));
    } catch {
      // Ohne Browserspeicher gelten Live-Filter nur für die aktuelle Ansicht.
    }
  }
}
