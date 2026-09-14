import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AuthService } from '../../core/services/auth.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { DealCardComponent } from './components/deal-card/deal-card.component';
import { DealDetailModalComponent } from './components/deal-detail-modal/deal-detail-modal.component';
import { WatchlistEditorComponent } from './components/watchlist-editor/watchlist-editor.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { DealFeedState } from './services/deal-feed-state';
import { FeedCategory, FeedItem, Watchlist, WatchlistDraft } from './models/deal-monitor.model';
import { matchesSize } from './utils/size-matcher';

@Component({
  selector: 'app-deal-monitor',
  imports: [
    DatePipe,
    UpperCasePipe,
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    CustomSelectComponent,
    ModalShellComponent,
    DealCardComponent,
    DealDetailModalComponent,
    WatchlistEditorComponent,
  ],
  templateUrl: './deal-monitor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealMonitorComponent {
  private readonly api = inject(DealMonitorService);
  readonly workspace = inject(WorkspaceService).currentWorkspace;
  readonly demo = inject(AuthService).isDemoMode;
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly editor = viewChild(WatchlistEditorComponent);
  readonly state = new DealFeedState((request) => this.api.feed(request));
  readonly watchlists = signal<Watchlist[]>([]);
  readonly watchlistsLoading = signal(false);
  readonly categories = signal<FeedCategory[]>([]);
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
    { value: 'xxl', label: 'XXL (2XL)' },
    { value: '3xl', label: '3XL+' },
  ];
  readonly view = signal<'articles' | 'deals' | 'watchlists'>('articles');
  readonly editing = signal<Watchlist | null>(null);
  readonly editorOpen = signal(false);
  readonly deleting = signal<Watchlist | null>(null);
  readonly discarding = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal('');
  readonly categoryError = signal<string | null>(null);
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
  readonly grid = computed(() => this.filteredItems().slice(3));
  readonly stale = computed(
    () => !this.state.reportedAt() || this.now() - Date.parse(this.state.reportedAt()!) > 120_000,
  );
  private listGeneration = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const workspace = this.demo() ? null : (this.workspace()?.id ?? null);
      untracked(() => {
        this.selected.set(null);
        this.selectedSize.set(null);
        this.watchlists.set([]);
        this.editorOpen.set(false);
        this.deleting.set(null);
        this.error.set(null);
        this.message.set('');
        this.listGeneration++;
        this.watchlistsLoading.set(Boolean(workspace));
        if (workspace) void this.loadWatchlists(workspace);
      });
    });
    effect(() => {
      const workspace = this.demo() ? null : this.workspace()?.id;
      const watchlist = this.selected();
      const dealsOnly = this.view() === 'deals';
      untracked(() =>
        this.state.setContext(workspace ? { workspace, watchlist, dealsOnly } : null),
      );
    });
    if (!this.demo()) void this.loadCategories();
    const tick = async () => {
      this.now.set(Date.now());
      if (!this.document.hidden && this.view() !== 'watchlists') await this.state.refresh();
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

  hasUnsavedChanges(): boolean {
    return this.editor()?.form.dirty ?? false;
  }
  isSaving(): boolean {
    return this.saving();
  }

  async loadWatchlists(workspace = this.workspace()?.id): Promise<void> {
    if (!workspace) {
      this.watchlistsLoading.set(false);
      return;
    }
    const generation = ++this.listGeneration;
    this.watchlistsLoading.set(true);
    try {
      const rows = await this.api.watchlists(workspace);
      if (generation !== this.listGeneration || this.destroyRef.destroyed) return;
      this.watchlists.set(rows);
    } catch (error) {
      if (generation === this.listGeneration)
        this.error.set(error instanceof Error ? error.message : 'Laden fehlgeschlagen.');
    } finally {
      if (generation === this.listGeneration && !this.destroyRef.destroyed) {
        this.watchlistsLoading.set(false);
      }
    }
  }
  async loadCategories(): Promise<void> {
    try {
      const rows = await this.api.categories();
      if (!this.destroyRef.destroyed) {
        this.categories.set(rows);
        this.categoryError.set(null);
      }
    } catch {
      if (!this.destroyRef.destroyed)
        this.categoryError.set('Kategorien konnten nicht geladen werden.');
    }
  }
  openEditor(row: Watchlist | null = null): void {
    this.editing.set(row);
    this.editorOpen.set(true);
    this.error.set(null);
    this.state.pause();
  }
  cancelEditor(): void {
    if (this.saving()) return;
    if (this.hasUnsavedChanges()) this.discarding.set(true);
    else this.closeEditor();
  }
  closeEditor(): void {
    this.editorOpen.set(false);
    this.discarding.set(false);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLButtonElement>('[data-new-watchlist] button')
          ?.focus(),
      { injector: this.injector },
    );
  }
  async save(draft: WatchlistDraft): Promise<void> {
    const workspace = this.workspace()?.id;
    if (!workspace || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.save(workspace, draft);
      if (workspace !== this.workspace()?.id || this.destroyRef.destroyed) return;
      if (this.editorOpen()) this.closeEditor();
      this.message.set(
        'Suchfilter gespeichert. Neue Suchkriterien gelten für künftig entdeckte Deals.',
      );
      await this.loadWatchlists(workspace);
      if (workspace !== this.workspace()?.id || this.destroyRef.destroyed) return;
      this.state.setContext({
        workspace,
        watchlist: this.selected(),
        dealsOnly: this.view() === 'deals',
      });
    } catch (error) {
      if (workspace === this.workspace()?.id)
        this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
    } finally {
      this.saving.set(false);
    }
  }
  toggle(row: Watchlist): void {
    void this.save({ ...row, is_active: !row.is_active });
  }
  async confirmDelete(): Promise<void> {
    const row = this.deleting();
    const workspace = this.workspace()?.id;
    if (!row || !workspace || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.delete(workspace, row.id);
      if (workspace !== this.workspace()?.id || this.destroyRef.destroyed) return;
      this.deleting.set(null);
      if (this.selected() === row.id) this.selected.set(null);
      await this.loadWatchlists(workspace);
      if (workspace !== this.workspace()?.id || this.destroyRef.destroyed) return;
      this.message.set('Suchfilter und seine Treffer gelöscht.');
    } catch (error) {
      if (workspace === this.workspace()?.id)
        this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
    } finally {
      this.saving.set(false);
    }
  }
}
