import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LucidePlus, LucideRefreshCcw, LucideX } from '@lucide/angular';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CategoryPickerSource } from '../../../../core/models/category-picker-source';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { DealCardComponent } from '../deal-card/deal-card.component';
import { DealDetailModalComponent } from '../deal-detail-modal/deal-detail-modal.component';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { DealFeedState } from '../../services/deal-feed-state';
import { DealFeedUpdatesService } from '../../services/deal-feed-updates.service';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import {
  FEED_CLOTHING_SIZES,
  FeedBot,
  FeedItem,
  Watchlist,
  feedSizeValues,
} from '../../models/deal-monitor.model';
import { vintedCategorySource } from '../../../platform-admin/models/vinted-category-source';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { VintedAiSearchModalComponent } from '../vinted-ai-search-modal/vinted-ai-search-modal.component';

const SLOW_MODE_STORAGE_KEY = 'flipbase:vinted-feed:slow-mode';

@Component({
  selector: 'app-deal-feed-search',
  imports: [
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    CategoryPickerComponent,
    AttributePickerComponent,
    ReactiveFormsModule,
    CustomCheckboxComponent,
    NumberInputComponent,
    CustomSearchInputComponent,
    DealCardComponent,
    DealDetailModalComponent,
    VintedAiSearchModalComponent,
  ],
  templateUrl: './deal-feed-search.component.html',
  // Jede Suche richtet Filter und Raster nach ihrer eigenen Spaltenbreite aus.
  host: { class: '@container block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Eine Feed-Suche mit eigenen Filtern, eigenem Abruf und eigenem Raster. */
export class DealFeedSearchComponent {
  /** Die erste Suche behält die bisherigen Feld-IDs; weitere hängen ihre Nummer an. */
  readonly searchNumber = input(1);
  /** Im Widescreen-Modus füllt das Raster die ganze Spaltenbreite mit Karten. */
  readonly widescreen = input(false);
  readonly canAddSearch = input(false);
  readonly removable = input(false);
  readonly categorySource = input<CategoryPickerSource>(vintedCategorySource([]));
  readonly addSearch = output<void>();
  readonly remove = output<void>();
  readonly idSuffix = computed(() => (this.searchNumber() === 1 ? '' : `-${this.searchNumber()}`));
  readonly gridColumns = computed(() =>
    this.widescreen()
      ? 'grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]'
      : 'grid-cols-1 @min-[30rem]:grid-cols-2 @min-[46rem]:grid-cols-3 @min-[62rem]:grid-cols-4 @min-[78rem]:grid-cols-5',
  );
  private readonly api = inject(DealMonitorService);
  private readonly updates = inject(DealFeedUpdatesService);
  readonly favorites = inject(DealFavoritesService);
  readonly searchEntry = signal('');
  readonly titleQuery = signal('');
  private searchTimer?: ReturnType<typeof setTimeout>;
  readonly workspace = inject(WorkspaceService).currentWorkspace;
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly state = new DealFeedState((request) => this.api.feed(request));
  readonly watchlists = signal<Watchlist[]>([]);
  readonly bots = signal<FeedBot[]>([]);
  readonly brands = signal<string[]>([]);
  readonly selected = signal<string | null>(null);
  readonly selectedBot = signal<string | null>(null);
  readonly category = new FormControl<string | null>(null);
  readonly brand = new FormControl('', { nonNullable: true });
  readonly sizes = new FormControl('', { nonNullable: true });
  private readonly selectedCategory = toSignal(this.category.valueChanges, { initialValue: null });
  private readonly selectedBrand = toSignal(this.brand.valueChanges, { initialValue: '' });
  private readonly selectedSizes = toSignal(this.sizes.valueChanges, { initialValue: '' });
  private brandQuery = '';
  private brandTimer?: ReturnType<typeof setTimeout>;
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly selectedDeal = signal<FeedItem | null>(null);
  readonly selectedAnalysis = signal<FeedItem | null>(null);
  readonly operator = inject(PlatformOperatorService);
  readonly sizeOptions = FEED_CLOTHING_SIZES.map((option) => option.label);
  readonly error = signal<string | null>(null);
  readonly botError = signal<string | null>(null);
  readonly brandError = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly resetIcon = LucideRefreshCcw;
  readonly addIcon = LucidePlus;
  readonly removeIcon = LucideX;
  readonly options = computed(() => [
    { value: null as string | null, label: 'Alle Suchfilter' },
    ...this.watchlists().map((row) => ({ value: row.id, label: row.title })),
  ]);
  readonly botOptions = computed(() => [
    { value: null as string | null, label: 'Alle Vinted-Bots' },
    ...this.bots().map((bot) => ({ value: bot.id, label: bot.title })),
  ]);
  readonly selectedWatchlist = computed(() =>
    this.watchlists().find((row) => row.id === this.selected()),
  );
  readonly feedItems = this.state.items;
  readonly slowMode = this.state.slowMode;
  // Im langsamen Modus rückt jeder Fund sichtbar von links herein.
  readonly cardMotion = computed(() =>
    this.slowMode()
      ? 'motion-safe:duration-500 motion-safe:ease-out motion-safe:starting:-translate-x-12'
      : 'motion-safe:duration-200 motion-safe:starting:-translate-x-3',
  );
  readonly filtersActive = computed(
    () =>
      this.selected() !== null ||
      this.selectedBot() !== null ||
      Boolean(this.selectedBrand() || this.selectedSizes() || this.selectedCategory()) ||
      this.minPrice() !== null ||
      this.maxPrice() !== null ||
      this.searchEntry().trim().length > 0,
  );
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
  private botGeneration = 0;
  private brandGeneration = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.operator.isOperator();
    effect(() => {
      this.workspace();
      this.operator.operator();
      untracked(() => this.selectedAnalysis.set(null));
    });
    this.state.setSlowMode(this.readSlowModePreference());
    effect(() => {
      const workspace = this.workspace()?.id ?? null;
      untracked(() => {
        this.selected.set(null);
        this.selectedBot.set(null);
        this.resetDirectFilters();
        this.minPrice.set(null);
        this.maxPrice.set(null);
        clearTimeout(this.searchTimer);
        this.searchEntry.set('');
        this.titleQuery.set('');
        this.watchlists.set([]);
        this.bots.set([]);
        this.brands.set([]);
        this.error.set(null);
        this.botError.set(null);
        this.brandError.set(null);
        this.listGeneration++;
        this.botGeneration++;
        this.brandGeneration++;
        if (workspace) {
          void this.loadWatchlists(workspace);
          void this.loadBots(workspace);
          void this.loadBrands(workspace);
        }
      });
    });
    effect(() => {
      const workspace = this.workspace()?.id;
      const watchlist = this.selected();
      const botId = this.selectedBot();
      const brand = this.selectedBrand() || null;
      const category = this.selectedCategory();
      const categoryId = category === null ? null : Number(category);
      const sizes = feedSizeValues(this.selectedSizes());
      const minPrice = this.minPrice();
      const maxPrice = this.maxPrice();
      const priceError = this.priceError();
      const titleQuery = this.titleQuery();
      if (priceError) return;
      untracked(() =>
        this.state.setContext(
          workspace
            ? {
                workspace,
                watchlist,
                botId,
                brand,
                size: null,
                sizes,
                categoryId,
                audience: null,
                minPrice,
                maxPrice,
                titleQuery,
              }
            : null,
        ),
      );
    });
    effect((onCleanup) => {
      const workspace = this.workspace()?.id;
      if (!workspace) return;
      const cleanup = untracked(() =>
        this.updates.watch(workspace, (delta) => {
          if (
            !this.destroyRef.destroyed &&
            !this.document.hidden &&
            !this.state.error() &&
            this.workspace()?.id === workspace
          )
            this.state.notifyUpdate(delta);
        }),
      );
      onCleanup(cleanup);
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
      clearTimeout(this.searchTimer);
      clearTimeout(this.brandTimer);
      this.listGeneration++;
      this.botGeneration++;
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

  async loadBots(workspace = this.workspace()?.id): Promise<void> {
    if (!workspace) return;
    const generation = ++this.botGeneration;
    try {
      const rows = await this.api.feedBots(workspace);
      if (generation !== this.botGeneration || this.destroyRef.destroyed) return;
      this.bots.set(rows);
      this.botError.set(null);
    } catch (error) {
      if (generation === this.botGeneration && !this.destroyRef.destroyed) {
        this.botError.set(
          error instanceof Error ? error.message : 'Vinted-Bots konnten nicht geladen werden.',
        );
      }
    }
  }

  async loadBrands(workspace = this.workspace()?.id): Promise<void> {
    if (!workspace) return;
    const generation = ++this.brandGeneration;
    try {
      const brands = await this.api.searchBrands(workspace, this.brandQuery);
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

  searchBrand(term: string): void {
    this.brandQuery = term.trim();
    this.brandGeneration++;
    clearTimeout(this.brandTimer);
    if (this.brandQuery.length <= 100)
      this.brandTimer = setTimeout(() => void this.loadBrands(), 250);
  }

  searchChanged(value: string): void {
    this.searchEntry.set(value);
    clearTimeout(this.searchTimer);
    if (!value.trim()) {
      this.titleQuery.set('');
      return;
    }
    this.searchTimer = setTimeout(() => this.titleQuery.set(value.trim()), 250);
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

  resetFilters(): void {
    clearTimeout(this.searchTimer);
    this.searchEntry.set('');
    this.titleQuery.set('');
    this.selected.set(null);
    this.selectedBot.set(null);
    this.resetDirectFilters();
    void this.loadBrands();
    this.minPrice.set(null);
    this.maxPrice.set(null);
  }

  private resetDirectFilters(): void {
    this.category.reset();
    this.brand.reset();
    this.sizes.reset();
    this.brandQuery = '';
    clearTimeout(this.brandTimer);
  }
}
