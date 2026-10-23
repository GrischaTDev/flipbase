import { VintedProviderDraftsComponent } from '../vinted-provider-drafts/vinted-provider-drafts.component';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideLayoutGrid, LucideList, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedListingDraftService,
  type VintedListingDraftCursor,
} from '../../services/vinted-listing-draft.service';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';

@Component({
  selector: 'app-vinted-listing-drafts',
  templateUrl: './vinted-listing-drafts.component.html',
  imports: [
    VintedProviderDraftsComponent,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    CardComponent,
    DataTableComponent,
    ProductThumbnailComponent,
    PageHeaderComponent,
    NoticeBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedListingDraftsComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly api = inject(VintedListingDraftService);
  private readonly images = inject(VintedListingImageService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly draftLinks = viewChildren<ElementRef<HTMLAnchorElement>>('draftLink');
  private readonly viewSwitcher = viewChild<ElementRef<HTMLDivElement>>('viewSwitcher');
  readonly viewMode = signal<'grid' | 'list'>('grid');
  readonly thumbnails = signal<ReadonlyMap<string, string>>(new Map());
  readonly deletingId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly announcement = signal('');
  readonly search = signal('');
  readonly query = signal('');
  private readonly scope = computed(() => {
    const workspace = this.workspace.currentWorkspace(),
      user = this.auth.currentUser();
    return workspace && !workspace.archived_at && user && this.store.canManage()
      ? JSON.stringify([user.id, workspace.id])
      : null;
  });
  private readonly context = computed(() => {
    const scope = this.scope();
    return scope ? JSON.stringify([scope, this.query()]) : null;
  });
  private readonly loaded = signal<string | null>(null);
  private readonly rows = signal<readonly VintedListingDraft[]>([]);
  private readonly cursor = signal<VintedListingDraftCursor | null>(null);
  private readonly fetching = signal(false);
  private readonly failure = signal<string | null>(null);
  readonly loadingMore = signal(false);
  readonly moreError = signal<string | null>(null);
  readonly drafts = computed(() => (this.context() === this.loaded() ? this.rows() : []));
  readonly nextCursor = computed(() => (this.context() === this.loaded() ? this.cursor() : null));
  readonly loading = computed(
    () => this.context() !== null && (this.fetching() || this.context() !== this.loaded()),
  );
  readonly error = computed(() => (this.context() === this.loaded() ? this.failure() : null));
  readonly gridIcon = LucideLayoutGrid;
  readonly listIcon = LucideList;
  readonly deleteIcon = LucideTrash2;
  readonly addIcon = LucidePlus;
  private readonly deletedIds = new Set<string>();
  private activeDelete: { readonly scope: string } | null = null;
  private loadedScope: string | null = null;
  private generation = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => void this.load(context));
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }
  setSearch(value: string): void {
    this.search.set(value.slice(0, 160));
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.query.set(this.search().trim());
    }, 250);
  }
  async reload(): Promise<void> {
    await this.load(this.context());
  }
  accountName(id: string | null): string {
    return id === null
      ? 'Noch kein Konto'
      : (this.store.connections().find((account) => account.connectionId === id)?.displayName ??
          'Konto nicht verfügbar');
  }
  async deleteDraft(draft: VintedListingDraft, event?: MouseEvent): Promise<void> {
    const context = this.context(),
      scope = this.scope(),
      generation = this.generation;
    if (
      !context ||
      !scope ||
      this.loading() ||
      this.activeDelete ||
      !this.drafts().some((row) => row.id === draft.id && row.revision === draft.revision)
    )
      return;
    const trigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const operation = { scope };
    let deleted = false;
    this.activeDelete = operation;
    this.actionError.set(null);
    this.announcement.set('');
    try {
      const confirmed = await this.dialog.frage({
        titel: 'Entwurf löschen?',
        text: `Der Entwurf „${draft.content.title || 'Unbenannter Entwurf'}“ wird gelöscht.`,
        bestaetigenText: 'Löschen',
        gefahr: true,
      });
      if (!confirmed || !this.current(generation, context)) return;
      this.deletingId.set(draft.id);
      await this.api.remove(draft);
      if (!this.currentDeletion(operation)) return;
      deleted = true;
      const removedIndex = this.rows().findIndex((row) => row.id === draft.id);
      this.deletedIds.add(draft.id);
      this.rows.update((rows) => rows.filter((row) => row.id !== draft.id));
      this.thumbnails.update((urls) => {
        const remaining = new Map(urls);
        remaining.delete(draft.id);
        return remaining;
      });
      this.announcement.set('Entwurf gelöscht.');
      if (!this.rows().length && this.nextCursor()) await this.loadMore();
      afterNextRender(
        () => {
          if (!this.current(generation, context)) return;
          const links = this.draftLinks();
          const target =
            links[Math.min(removedIndex, links.length - 1)]?.nativeElement ??
            this.viewSwitcher()?.nativeElement;
          target?.focus();
        },
        { injector: this.injector },
      );
    } catch (error) {
      if (this.currentDeletion(operation))
        this.actionError.set(
          error instanceof Error ? error.message : 'Der Entwurf konnte nicht gelöscht werden.',
        );
    } finally {
      if (this.currentDeletion(operation)) {
        this.activeDelete = null;
        this.deletingId.set(null);
        if (!deleted && trigger)
          afterNextRender(
            () => {
              if (this.current(generation, context) && trigger.isConnected) trigger.focus();
            },
            { injector: this.injector },
          );
      }
    }
  }
  async loadMore(): Promise<void> {
    const cursor = this.nextCursor(),
      context = this.context(),
      generation = this.generation,
      workspace = this.workspace.currentWorkspace();
    if (!cursor || !context || !workspace || this.loadingMore() || this.loading()) return;
    this.loadingMore.set(true);
    this.moreError.set(null);
    try {
      const page = await this.api.list(workspace.id, this.query(), cursor);
      if (!this.current(generation, context)) return;
      this.rows.update((rows) => [
        ...new Map(
          [...rows, ...page.items]
            .filter((row) => !this.deletedIds.has(row.id))
            .map((row) => [row.id, row]),
        ).values(),
      ]);
      this.cursor.set(page.nextCursor);
      void this.loadThumbnails(page.items, generation, context);
    } catch (error) {
      if (this.current(generation, context))
        this.moreError.set(
          error instanceof Error ? error.message : 'Weitere Entwürfe konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(generation, context)) this.loadingMore.set(false);
    }
  }
  private current(generation: number, context: string): boolean {
    return (
      !this.destroyRef.destroyed && generation === this.generation && this.context() === context
    );
  }
  private currentDeletion(operation: { readonly scope: string }): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.activeDelete === operation &&
      this.scope() === operation.scope
    );
  }
  private async loadThumbnails(
    drafts: readonly VintedListingDraft[],
    generation: number,
    context: string,
  ): Promise<void> {
    try {
      const urls = await this.images.thumbnailUrls(drafts);
      if (!this.current(generation, context)) return;
      const visibleIds = new Set(this.rows().map((row) => row.id));
      this.thumbnails.update(
        (current) => new Map([...current, ...urls].filter(([id]) => visibleIds.has(id))),
      );
    } catch {
      // Ohne Vorschaubild bleibt der gemeinsame Kleidungsplatzhalter sichtbar.
    }
  }
  private async load(context: string | null): Promise<void> {
    const generation = ++this.generation;
    const scope = this.scope();
    this.loaded.set(context);
    this.rows.set([]);
    this.thumbnails.set(new Map());
    if (this.loadedScope !== scope) {
      this.loadedScope = scope;
      this.deletedIds.clear();
      this.activeDelete = null;
      this.deletingId.set(null);
    }
    this.actionError.set(null);
    this.announcement.set('');
    this.cursor.set(null);
    this.failure.set(null);
    this.moreError.set(null);
    this.loadingMore.set(false);
    const workspace = this.workspace.currentWorkspace();
    if (!context || !workspace) {
      this.fetching.set(false);
      return;
    }
    this.fetching.set(true);
    try {
      const page = await this.api.list(workspace.id, this.query());
      if (this.current(generation, context)) {
        this.rows.set(page.items.filter((row) => !this.deletedIds.has(row.id)));
        this.cursor.set(page.nextCursor);
        void this.loadThumbnails(page.items, generation, context);
      }
    } catch (error) {
      if (this.current(generation, context))
        this.failure.set(
          error instanceof Error ? error.message : 'Die Entwürfe konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(generation, context)) this.fetching.set(false);
    }
  }
}
