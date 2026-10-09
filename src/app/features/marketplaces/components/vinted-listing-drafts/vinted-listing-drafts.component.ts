import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucidePencil, LucidePlus } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import {
  VintedListingDraftService,
  type VintedListingDraftCursor,
} from '../../services/vinted-listing-draft.service';
import type { VintedListingDraft } from '../../models/vinted-listing-draft';

@Component({
  selector: 'app-vinted-listing-drafts',
  templateUrl: './vinted-listing-drafts.component.html',
  imports: [
    CurrencyPipe,
    DatePipe,
    ButtonComponent,
    DataTableComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  readonly search = signal('');
  private readonly query = signal('');
  private readonly context = computed(() => {
    const workspace = this.workspace.currentWorkspace(),
      user = this.auth.currentUser();
    return workspace && !workspace.archived_at && user && this.store.canManage()
      ? JSON.stringify([user.id, workspace.id, this.query()])
      : null;
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
  readonly editIcon = LucidePencil;
  readonly addIcon = LucidePlus;
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
        ...new Map([...rows, ...page.items].map((row) => [row.id, row])).values(),
      ]);
      this.cursor.set(page.nextCursor);
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
  private async load(context: string | null): Promise<void> {
    const generation = ++this.generation;
    this.loaded.set(context);
    this.rows.set([]);
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
        this.rows.set(page.items);
        this.cursor.set(page.nextCursor);
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
