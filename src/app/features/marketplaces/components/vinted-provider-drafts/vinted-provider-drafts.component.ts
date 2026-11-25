import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceOverviewListing } from '../../models/marketplace-overview.models';
import {
  normalizeVintedPublication,
  overviewListingKey,
} from '../../models/marketplace-overview-normalization';
import { vintedAccountLabels } from '../../models/vinted-account-labels';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { VintedAccountViewService } from '../../services/vinted-account-view.service';

@Component({
  selector: 'app-vinted-provider-drafts',
  imports: [
    CurrencyPipe,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    ProductThumbnailComponent,
  ],
  templateUrl: './vinted-provider-drafts.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VintedProviderDraftsComponent {
  private readonly store = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceApiService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly accountView = inject(VintedAccountViewService);
  readonly query = input('');
  readonly viewMode = input<'grid' | 'list'>('grid');
  readonly showAllAccounts = this.accountView.showAllAccounts;
  readonly accountLabels = computed(() => vintedAccountLabels(this.store.connections()));
  readonly listingKey = overviewListingKey;
  private readonly connectionId = computed(() =>
    this.showAllAccounts() ? null : (this.store.selectedConnection()?.connectionId ?? null),
  );
  private readonly context = computed(() => {
    const workspace = this.workspace.currentWorkspace(),
      user = this.auth.currentUser(),
      connectionId = this.connectionId();
    const showAllAccounts = this.showAllAccounts();
    return this.store.canManage() &&
      user &&
      workspace &&
      !workspace.archived_at &&
      (showAllAccounts || connectionId)
      ? JSON.stringify([
          user.id,
          workspace.id,
          connectionId,
          this.query(),
          this.store
            .connections()
            .filter((account) => showAllAccounts || account.connectionId === connectionId)
            .map((account) => [account.connectionId, account.lastSyncedAt]),
        ])
      : null;
  });
  private readonly loaded = signal<string | null>(null);
  private readonly rows = signal<readonly MarketplaceOverviewListing[]>([]);
  readonly items = computed(() => (this.loaded() === this.context() ? this.rows() : []));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly cursor = signal<string | null>(null);
  private generation = 0;
  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => void this.load(false, context));
    });
    this.destroyRef.onDestroy(() => this.generation++);
  }
  async load(more = false, context = this.context()): Promise<void> {
    if (more && (this.loading() || !this.cursor())) return;
    const generation = ++this.generation,
      workspace = this.workspace.currentWorkspace(),
      connectionId = this.connectionId(),
      cursor = more ? this.cursor() : null;
    if (!more) {
      this.rows.set([]);
      this.cursor.set(null);
      this.loaded.set(context);
    }
    this.error.set(null);
    if (!context || !workspace) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const paging = cursor ? { cursor } : {};
      const page = connectionId
        ? await this.api.readOverviewPublications(
            { workspaceId: workspace.id, connectionId },
            { state: 'draft', search: this.query(), limit: 25, ...paging },
          )
        : await this.api
            .readVintedList({
              workspaceId: workspace.id,
              kind: 'provider_draft',
              query: this.query(),
              ...paging,
            })
            .then(({ items, nextCursor }) => ({
              items: items.map(normalizeVintedPublication),
              nextCursor,
            }));
      if (!this.current(generation, context)) return;
      this.rows.update((rows) => [
        ...new Map(
          [...(more ? rows : []), ...page.items].map((row) => [
            this.listingKey(row.reference),
            row,
          ]),
        ).values(),
      ]);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (this.current(generation, context))
        this.error.set(
          error instanceof Error ? error.message : 'Vinted-Entwürfe konnten nicht geladen werden.',
        );
    } finally {
      if (this.current(generation, context)) this.loading.set(false);
    }
  }
  private current(generation: number, context: string): boolean {
    return (
      !this.destroyRef.destroyed && generation === this.generation && this.context() === context
    );
  }
}
