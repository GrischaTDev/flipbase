import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { DealCardComponent } from './components/deal-card/deal-card.component';
import { DealDetailModalComponent } from './components/deal-detail-modal/deal-detail-modal.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { DealFeedState } from './services/deal-feed-state';
import { FeedItem, Watchlist } from './models/deal-monitor.model';
import { matchesSize } from './utils/size-matcher';

@Component({
  selector: 'app-deal-monitor',
  imports: [
    UpperCasePipe,
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    DealCardComponent,
    DealDetailModalComponent,
  ],
  templateUrl: './deal-monitor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealMonitorComponent {
  private readonly api = inject(DealMonitorService);
  readonly workspace = inject(WorkspaceService).currentWorkspace;
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly state = new DealFeedState((request) => this.api.feed(request));
  readonly watchlists = signal<Watchlist[]>([]);
  readonly selected = signal<string | null>(null);
  readonly selectedSize = signal<string | null>(null);
  readonly selectedDeal = signal<FeedItem | null>(null);
  readonly sizeOptions = [
    { value: null as string | null, label: 'Alle Größen' },
    { value: 'xs', label: 'XS' },
    { value: 's', label: 'S' },
    { value: 'm', label: 'M' },
    { value: 'l', label: 'L' },
    { value: 'xl', label: 'XL' },
    { value: 'xxl', label: 'XXL' },
    { value: '3xl', label: '3XL+' },
  ];
  readonly view = signal<'articles' | 'deals'>('articles');
  readonly error = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly options = computed(() => [
    { value: null as string | null, label: 'Alle Artikel' },
    ...this.watchlists().map((row) => ({ value: row.id, label: row.title })),
  ]);
  readonly selectedWatchlist = computed(() =>
    this.watchlists().find((row) => row.id === this.selected()),
  );
  readonly filteredItems = computed(() => {
    const size = this.selectedSize();
    const items = this.state.items();
    if (!size) return items;
    return items.filter((item) => matchesSize(item.size, size));
  });
  readonly highlights = computed(() => this.filteredItems().slice(0, 3));
  readonly featuredLead = computed(() => this.highlights()[0] ?? null);
  readonly featuredSupport = computed(() => this.highlights().slice(1));
  readonly grid = computed(() => this.filteredItems().slice(3));
  readonly stale = computed(
    () => !this.state.reportedAt() || this.now() - Date.parse(this.state.reportedAt()!) > 120_000,
  );
  private listGeneration = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const workspace = this.workspace()?.id ?? null;
      untracked(() => {
        this.selected.set(null);
        this.selectedSize.set(null);
        this.watchlists.set([]);
        this.error.set(null);
        this.listGeneration++;
        if (workspace) void this.loadWatchlists(workspace);
      });
    });
    effect(() => {
      const workspace = this.workspace()?.id;
      const watchlist = this.selected();
      const dealsOnly = this.view() === 'deals';
      untracked(() =>
        this.state.setContext(workspace ? { workspace, watchlist, dealsOnly } : null),
      );
    });
    const tick = async () => {
      this.now.set(Date.now());
      if (!this.document.hidden) await this.state.refresh();
      if (!this.destroyRef.destroyed)
        this.timer = setTimeout(() => void tick(), this.state.error() ? 10_000 : 2_000);
    };
    this.timer = setTimeout(() => void tick(), 2_000);
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      this.listGeneration++;
      this.state.destroy();
    });
  }

  async loadWatchlists(workspace = this.workspace()?.id): Promise<void> {
    if (!workspace) return;
    const generation = ++this.listGeneration;
    try {
      const rows = await this.api.watchlists(workspace);
      if (generation !== this.listGeneration || this.destroyRef.destroyed) return;
      this.watchlists.set(rows);
      this.error.set(null);
    } catch (error) {
      if (generation === this.listGeneration) {
        this.error.set(error instanceof Error ? error.message : 'Laden fehlgeschlagen.');
      }
    }
  }
}
