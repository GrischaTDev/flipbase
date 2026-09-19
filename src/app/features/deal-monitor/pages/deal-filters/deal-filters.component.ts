import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  LucideAlertCircle,
  LucideCheckCircle2,
  LucideDynamicIcon,
  LucideEdit2,
  LucideFilter,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { WatchlistEditorComponent } from '../../components/watchlist-editor/watchlist-editor.component';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { UnsavedEntryPage } from '../../../../shared/guards/unsaved-entry.guard';
import { FeedCategory, Watchlist, WatchlistDraft } from '../../models/deal-monitor.model';

@Component({
  selector: 'app-deal-filters',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    ModalShellComponent,
    WatchlistEditorComponent,
    LucideDynamicIcon,
  ],
  templateUrl: './deal-filters.component.html',
  styleUrl: './deal-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealFiltersComponent implements UnsavedEntryPage {
  private readonly api = inject(DealMonitorService);
  readonly workspace = inject(WorkspaceService).currentWorkspace;
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly editor = viewChild(WatchlistEditorComponent);

  readonly watchlists = signal<Watchlist[]>([]);
  readonly watchlistsLoading = signal(false);
  readonly categories = signal<FeedCategory[]>([]);
  readonly editing = signal<Watchlist | null>(null);
  readonly editorOpen = signal(false);
  readonly deleting = signal<Watchlist | null>(null);
  readonly discarding = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal('');
  readonly categoryError = signal<string | null>(null);

  private listGeneration = 0;

  readonly icons = {
    plus: LucidePlus,
    filter: LucideFilter,
    edit: LucideEdit2,
    trash: LucideTrash2,
    check: LucideCheckCircle2,
    alert: LucideAlertCircle,
  };

  constructor() {
    effect(() => {
      const workspace = this.workspace()?.id ?? null;
      untracked(() => {
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

    void this.loadCategories();

    this.destroyRef.onDestroy(() => {
      this.listGeneration++;
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
      this.error.set(null);
    } catch (error) {
      if (generation === this.listGeneration) {
        this.error.set(error instanceof Error ? error.message : 'Laden fehlgeschlagen.');
      }
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
      if (!this.destroyRef.destroyed) {
        this.categoryError.set('Kategorien konnten nicht geladen werden.');
      }
    }
  }

  openEditor(row: Watchlist | null = null): void {
    this.editing.set(row);
    this.editorOpen.set(true);
    this.error.set(null);
  }

  cancelEditor(): void {
    if (this.saving()) return;
    if (this.hasUnsavedChanges()) {
      this.discarding.set(true);
    } else {
      this.closeEditor();
    }
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.discarding.set(false);
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLButtonElement>('[data-new-filter] button')
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
    } catch (error) {
      if (workspace === this.workspace()?.id) {
        this.error.set(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.');
      }
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
      await this.loadWatchlists(workspace);
      if (workspace !== this.workspace()?.id || this.destroyRef.destroyed) return;
      this.message.set('Suchfilter und seine Treffer gelöscht.');
    } catch (error) {
      if (workspace === this.workspace()?.id) {
        this.error.set(error instanceof Error ? error.message : 'Löschen fehlgeschlagen.');
      }
    } finally {
      this.saving.set(false);
    }
  }
}
