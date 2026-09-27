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
import { LucideBot } from '@lucide/angular';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../shared/components/number-input/number-input.component';
import { DealCardComponent } from './components/deal-card/deal-card.component';
import { DealDetailModalComponent } from './components/deal-detail-modal/deal-detail-modal.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { DealFeedState } from './services/deal-feed-state';
import { FeedItem, Watchlist } from './models/deal-monitor.model';

@Component({
  selector: 'app-deal-monitor',
  imports: [
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    NumberInputComponent,
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
  readonly brands = signal<string[]>([]);
  readonly selected = signal<string | null>(null);
  readonly selectedBrand = signal<string | null>(null);
  readonly selectedSize = signal<string | null>(null);
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
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
  readonly error = signal<string | null>(null);
  readonly brandError = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly pageIcon = LucideBot;
  readonly options = computed(() => [
    { value: null as string | null, label: 'Alle Suchfilter' },
    ...this.watchlists().map((row) => ({ value: row.id, label: row.title })),
  ]);
  readonly brandOptions = computed(() => [
    { value: null as string | null, label: 'Alle Marken' },
    ...this.brands().map((brand) => ({ value: brand, label: brand })),
  ]);
  readonly selectedWatchlist = computed(() =>
    this.watchlists().find((row) => row.id === this.selected()),
  );
  readonly feedItems = this.state.items;
  readonly priceError = computed(() => {
    const min = this.minPrice();
    const max = this.maxPrice();
    if (
      (min !== null && (!Number.isFinite(min) || min < 0)) ||
      (max !== null && (!Number.isFinite(max) || max < 0))
    )
      return 'Bitte gültige, nicht negative Preise eingeben.';
    if (min !== null && max !== null && min > max)
      return 'Der Mindestpreis darf nicht über dem Höchstpreis liegen.';
    return null;
  });
  readonly stale = computed(
    () => !this.state.reportedAt() || this.now() - Date.parse(this.state.reportedAt()!) > 120_000,
  );
  private listGeneration = 0;
  private brandGeneration = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const workspace = this.workspace()?.id ?? null;
      untracked(() => {
        this.selected.set(null);
        this.selectedBrand.set(null);
        this.selectedSize.set(null);
        this.minPrice.set(null);
        this.maxPrice.set(null);
        this.watchlists.set([]);
        this.brands.set([]);
        this.error.set(null);
        this.brandError.set(null);
        this.listGeneration++;
        this.brandGeneration++;
        if (workspace) {
          void this.loadWatchlists(workspace);
          void this.loadBrands(workspace);
        }
      });
    });
    effect(() => {
      const workspace = this.workspace()?.id;
      const watchlist = this.selected();
      const brand = this.selectedBrand();
      const size = this.selectedSize();
      const minPrice = this.minPrice();
      const maxPrice = this.maxPrice();
      const priceError = this.priceError();
      if (priceError) return;
      untracked(() =>
        this.state.setContext(
          workspace ? { workspace, watchlist, brand, size, minPrice, maxPrice } : null,
        ),
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
      this.brandGeneration++;
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

  async loadBrands(workspace = this.workspace()?.id): Promise<void> {
    if (!workspace) return;
    const generation = ++this.brandGeneration;
    try {
      const brands = await this.api.supportedBrands(workspace);
      if (generation !== this.brandGeneration || this.destroyRef.destroyed) return;
      this.brands.set(brands);
      this.brandError.set(null);
    } catch (error) {
      if (generation === this.brandGeneration && !this.destroyRef.destroyed) {
        this.brandError.set(
          error instanceof Error ? error.message : 'Marken konnten nicht geladen werden.',
        );
      }
    }
  }
}
