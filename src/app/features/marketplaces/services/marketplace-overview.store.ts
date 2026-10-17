import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceId } from '../../../core/services/marketplace-settings.service';
import {
  DEFAULT_LISTING_QUERY,
  type MarketplaceListingReference,
  type MarketplaceOverviewAccount,
  type MarketplaceOverviewPage,
  type MarketplaceListingQuery,
} from '../models/marketplace-overview.models';
import {
  overviewAccountKey,
  overviewListingKey,
} from '../models/marketplace-overview-normalization';
import {
  selectVisibleListings,
  toggleListingSelection,
} from '../models/marketplace-listing-selection';
import { MarketplaceOverviewService } from './marketplace-overview.service';

export interface MarketplaceOverviewPlatformState {
  readonly platform: MarketplaceId;
  readonly accounts: readonly MarketplaceOverviewAccount[];
  readonly loading: boolean;
  readonly error: string | null;
}
export interface MarketplaceOverviewSection {
  readonly account: MarketplaceOverviewAccount;
  readonly query: MarketplaceListingQuery;
  readonly page: MarketplaceOverviewPage | null;
  readonly expanded: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly selection: readonly MarketplaceListingReference[];
  readonly history: readonly (string | undefined)[];
}
@Injectable()
export class MarketplaceOverviewStore {
  private readonly api = inject(MarketplaceOverviewService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private generation = 0;
  private readonly owner = signal<{ userId: string; workspaceId: string } | null>(null);
  private readonly requests = new Map<string, number>();
  private readonly platformRequests = new Map<MarketplaceId, number>();
  private readonly platformState = signal<readonly MarketplaceOverviewPlatformState[]>([]);
  private readonly sectionState = signal<Readonly<Record<string, MarketplaceOverviewSection>>>({});
  private readonly filters = signal<Readonly<Partial<Record<MarketplaceId, string>>>>({});
  private readonly current = computed(() => {
    const workspace = this.workspace.currentWorkspace();
    const owner = this.owner();
    return (
      !!owner &&
      this.auth.currentUser()?.id === owner.userId &&
      workspace?.id === owner.workspaceId &&
      !workspace.archived_at
    );
  });
  readonly platforms = computed(() => (this.current() ? this.platformState() : []));
  readonly sections = computed(() => (this.current() ? this.sectionState() : {}));

  async load(
    workspaceId: string,
    enabled: readonly MarketplaceId[] = ['vinted', 'ebay', 'kleinanzeigen'],
  ): Promise<void> {
    const generation = ++this.generation;
    const userId = this.auth.currentUser()?.id;
    this.owner.set(userId ? { userId, workspaceId } : null);
    this.sectionState.set({});
    this.filters.set({});
    this.requests.clear();
    this.platformState.set(
      enabled.map((platform) => ({ platform, accounts: [], loading: true, error: null })),
    );
    if (!userId || !this.current()) return;
    await Promise.all(
      enabled.map((platform) => this.fetchPlatform(workspaceId, platform, generation)),
    );
  }

  async retryPlatform(platform: MarketplaceId): Promise<void> {
    const owner = this.owner();
    const group = this.platforms().find((item) => item.platform === platform);
    if (!owner || !this.current() || !group?.error || group.loading) return;
    this.platformState.update((items) =>
      items.map((item) =>
        item.platform === platform ? { ...item, loading: true, error: null } : item,
      ),
    );
    await this.fetchPlatform(owner.workspaceId, platform, this.generation);
  }

  async refreshPlatform(platform: MarketplaceId): Promise<void> {
    const owner = this.owner();
    const group = this.platforms().find((item) => item.platform === platform);
    if (!owner || !this.current() || !group || group.loading) return;
    await this.fetchPlatform(owner.workspaceId, platform, this.generation, true);
  }

  private async fetchPlatform(
    workspaceId: string,
    platform: MarketplaceId,
    generation: number,
    preserveSections = false,
  ): Promise<void> {
    const version = (this.platformRequests.get(platform) ?? 0) + 1;
    this.platformRequests.set(platform, version);
    try {
      const accounts = await this.api.loadAccounts(workspaceId, platform);
      if (!this.isCurrent(generation) || this.platformRequests.get(platform) !== version) return;
      this.platformState.update((items) =>
        items.map((item) =>
          item.platform === platform ? { ...item, accounts, loading: false, error: null } : item,
        ),
      );
      this.sectionState.update((sections) => {
        const next = { ...sections };
        const accountKeys = new Set(accounts.map(overviewAccountKey));
        for (const [key, section] of Object.entries(sections)) {
          if (section.account.platform === platform && !accountKeys.has(key)) {
            delete next[key];
            this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
          }
        }
        for (const account of accounts) {
          const key = overviewAccountKey(account);
          const previous = preserveSections ? sections[key] : undefined;
          next[key] = previous
            ? {
                ...previous,
                account,
                page: previous.expanded ? previous.page : null,
              }
            : {
                account,
                query: DEFAULT_LISTING_QUERY,
                page: null,
                expanded: false,
                loading: false,
                error: null,
                selection: [],
                history: [],
              };
        }
        return next;
      });
      const filter = this.accountFilter(platform);
      if (filter && !accounts.some((account) => account.connectionId === filter))
        this.filters.update((filters) => ({ ...filters, [platform]: '' }));
      if (preserveSections)
        await Promise.all(
          accounts.map(async (account) => {
            const section = this.section(account);
            if (section?.expanded)
              await this.fetch(overviewAccountKey(account), section.query, section.history, true);
          }),
        );
    } catch {
      if (this.isCurrent(generation) && this.platformRequests.get(platform) === version)
        this.platformState.update((items) =>
          items.map((item) =>
            item.platform === platform
              ? {
                  ...item,
                  loading: false,
                  error: 'Die Konten konnten nicht geladen werden. Versuche es erneut.',
                }
              : item,
          ),
        );
    }
  }

  section(account: MarketplaceOverviewAccount): MarketplaceOverviewSection | undefined {
    return this.sections()[overviewAccountKey(account)];
  }
  accountFilter(platform: MarketplaceId): string {
    return this.current() ? (this.filters()[platform] ?? '') : '';
  }
  visibleAccounts(
    platform: MarketplaceOverviewPlatformState,
  ): readonly MarketplaceOverviewAccount[] {
    const filter = this.accountFilter(platform.platform);
    return filter
      ? platform.accounts.filter((account) => account.connectionId === filter)
      : platform.accounts;
  }
  selectAccount(platform: MarketplaceId, connectionId: string): void {
    if (!this.current()) return;
    const group = this.platforms().find((item) => item.platform === platform);
    if (connectionId && !group?.accounts.some((account) => account.connectionId === connectionId))
      return;
    this.filters.update((value) => ({ ...value, [platform]: connectionId }));
    this.sectionState.update((sections) =>
      Object.fromEntries(
        Object.entries(sections).map(([key, section]) => [
          key,
          section.account.platform === platform ? { ...section, selection: [] } : section,
        ]),
      ),
    );
  }
  async expand(account: MarketplaceOverviewAccount): Promise<void> {
    const key = overviewAccountKey(account);
    const section = this.section(account);
    if (!section) return;
    this.update(key, { expanded: !section.expanded, selection: [] });
    if (!section.expanded && !section.page && !section.loading)
      await this.fetch(key, section.query, section.history);
  }
  async setQuery(key: string, query: MarketplaceListingQuery): Promise<void> {
    await this.fetch(key, query, []);
  }
  async retry(account: MarketplaceOverviewAccount): Promise<void> {
    const section = this.section(account);
    if (section) await this.fetch(overviewAccountKey(account), section.query, section.history);
  }
  async next(account: MarketplaceOverviewAccount): Promise<void> {
    const section = this.section(account);
    if (!section?.page?.nextCursor || section.loading) return;
    await this.fetch(
      overviewAccountKey(account),
      { ...section.query, cursor: section.page.nextCursor },
      [...section.history, section.query.cursor],
    );
  }
  async previous(account: MarketplaceOverviewAccount): Promise<void> {
    const section = this.section(account);
    if (!section?.history.length || section.loading) return;
    await this.fetch(
      overviewAccountKey(account),
      { ...section.query, cursor: section.history.at(-1) },
      section.history.slice(0, -1),
    );
  }
  toggleSelection(reference: MarketplaceListingReference, checked: boolean): void {
    const key = overviewAccountKey(reference),
      section = this.sections()[key];
    if (!section?.expanded || section.loading || section.error) return;
    this.update(key, {
      selection: toggleListingSelection(
        section.selection,
        reference,
        checked,
        section.page?.items.map((item) => item.reference) ?? [],
      ),
    });
  }
  selectAll(account: MarketplaceOverviewAccount, checked: boolean): void {
    const section = this.section(account);
    if (!section?.expanded || section.loading || section.error) return;
    this.update(overviewAccountKey(account), {
      selection: selectVisibleListings(
        section.page?.items.map((item) => item.reference) ?? [],
        checked,
      ),
    });
  }
  private update(key: string, change: Partial<MarketplaceOverviewSection>): void {
    if (!this.current() || !this.sectionState()[key]) return;
    this.sectionState.update((state) => ({ ...state, [key]: { ...state[key], ...change } }));
  }
  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.current();
  }
  private async fetch(
    key: string,
    query: MarketplaceListingQuery,
    history: readonly (string | undefined)[],
    preserveSelection = false,
  ): Promise<void> {
    const section = this.sections()[key];
    if (!section) return;
    const generation = this.generation,
      version = (this.requests.get(key) ?? 0) + 1;
    this.requests.set(key, version);
    const selection = preserveSelection ? section.selection : [];
    this.update(key, { query, history, loading: true, error: null, selection });
    try {
      const page = await this.api.loadListings(section.account, query);
      if (this.isCurrent(generation) && this.requests.get(key) === version) {
        const visible = new Set(page.items.map((item) => overviewListingKey(item.reference)));
        this.update(key, {
          page,
          loading: false,
          selection: selection.filter((reference) => visible.has(overviewListingKey(reference))),
        });
        if (section.account.platform === 'ebay')
          this.platformState.update((groups) =>
            groups.map((group) => ({
              ...group,
              accounts: group.accounts.map((account) =>
                overviewAccountKey(account) === key
                  ? {
                      ...account,
                      activeCount: page.total,
                      listingCount: page.total,
                      completeness: page.completeness,
                    }
                  : account,
              ),
            })),
          );
      }
    } catch {
      if (this.isCurrent(generation) && this.requests.get(key) === version)
        this.update(key, {
          loading: false,
          error: 'Die Inserate konnten nicht geladen werden. Versuche es erneut.',
          selection: [],
        });
    }
  }
}
