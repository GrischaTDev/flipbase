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
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import type { MarketplaceOverviewListing } from '../../models/marketplace-overview.models';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';

@Component({
  selector: 'app-vinted-provider-drafts',
  imports: [
    CurrencyPipe,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
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
  readonly query = input('');
  readonly viewMode = input<'grid' | 'list'>('grid');
  readonly requestedAccount = signal<string | null>(null);
  readonly accounts = computed(() =>
    this.store
      .connections()
      .map((account) => ({ value: account.connectionId, label: account.displayName })),
  );
  readonly connectionId = computed(
    () =>
      this.accounts().find((account) => account.value === this.requestedAccount())?.value ??
      this.accounts().find(
        (account) => account.value === this.store.selectedConnection()?.connectionId,
      )?.value ??
      this.accounts()[0]?.value ??
      null,
  );
  private readonly context = computed(() => {
    const workspace = this.workspace.currentWorkspace(),
      user = this.auth.currentUser(),
      connectionId = this.connectionId();
    return this.store.canManage() && user && workspace && !workspace.archived_at && connectionId
      ? JSON.stringify([user.id, workspace.id, connectionId, this.query()])
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
    if (!context || !workspace || !connectionId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const page = await this.api.readOverviewPublications(
        { workspaceId: workspace.id, connectionId },
        { state: 'draft', search: this.query(), limit: 25, ...(cursor ? { cursor } : {}) },
      );
      if (!this.current(generation, context)) return;
      this.rows.update((rows) => [
        ...new Map(
          [...(more ? rows : []), ...page.items].map((row) => [row.reference.externalId, row]),
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
