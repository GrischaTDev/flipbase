import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { EbayCacheSync } from '../../../../../supabase/functions/_shared/ebay-cache-contracts';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type {
  EbayConnection,
  EbayListing,
  EbayOrder,
  EbayListingTraffic,
} from '../../../../../supabase/functions/_shared/ebay-contracts';
import { EbayAccountApiService, EbayAccountRequestError } from './ebay-account-api.service';
import type { EbayOrderBooking } from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';

@Injectable({ providedIn: 'root' })
export class EbayAccountStore {
  private readonly api = inject(EbayAccountApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private userId: string | null = null;
  private readonly scopeContext = signal<{ userId: string | null; workspaceId: string | null }>({
    userId: null,
    workspaceId: null,
  });
  private readonly pages = new Map<
    string,
    {
      total: number | null;
      nextPage: number | null;
      hasRead: boolean;
      sync: EbayCacheSync | null;
      error: string | null;
    }
  >();
  readonly sync = signal<EbayCacheSync | null>(null);
  readonly initialSyncPending = computed(
    () =>
      !this.sync()?.lastCompletedAt &&
      (this.sync()?.status === 'pending' || this.sync()?.status === 'syncing'),
  );
  constructor() {
    effect(() => {
      const userId = this.auth.currentUser()?.id ?? null;
      const workspaceId = this.workspace.currentWorkspace()?.id ?? null;
      untracked(() => {
        if (userId !== this.userId || workspaceId !== this.workspaceId) this.reset(null);
      });
    });
  }
  private revision = 0;
  private bookingRevision = 0;
  readonly orderBookings = signal<Readonly<Record<string, EbayOrderBooking>>>({});
  readonly bookingStatusesLoading = signal(false);
  readonly bookingError = signal<string | null>(null);
  private workspaceId: string | null = null;
  readonly isConfigured = signal(false);
  readonly importAvailable = signal(false);
  readonly listingManagementAvailable = signal(false);
  readonly traffic = signal<Readonly<Record<string, EbayListingTraffic>>>({});
  readonly trafficLoading = signal(false);
  readonly trafficError = signal<string | null>(null);
  readonly trafficPeriod = signal<{
    startDate: string;
    endDate: string;
    lastUpdatedDate: string | null;
  } | null>(null);
  private trafficRevision = 0;
  private readonly connectionData = signal<EbayConnection | null>(null);
  readonly connection = computed(() => (this.contextMatches() ? this.connectionData() : null));
  readonly isLoading = signal(false);
  readonly isReading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dataError = signal<string | null>(null);
  private readonly listingRows = signal<readonly EbayListing[]>([]);
  readonly listings = computed(() => (this.contextMatches() ? this.listingRows() : []));
  private readonly orderRows = signal<readonly EbayOrder[]>([]);
  readonly orders = computed(() => (this.contextMatches() ? this.orderRows() : []));
  readonly section = signal<'listings' | 'orders'>('listings');
  readonly total = signal<number | null>(null);
  readonly nextPage = signal<number | null>(null);
  readonly hasRead = signal(false);

  private contextMatches(): boolean {
    const workspace = this.workspace.currentWorkspace();
    const context = this.scopeContext();
    return (
      !!context.userId &&
      context.userId === this.auth.currentUser()?.id &&
      !!workspace &&
      !workspace.archived_at &&
      workspace.id === context.workspaceId
    );
  }
  private isCurrent(revision: number): boolean {
    return revision === this.revision && this.contextMatches();
  }
  reset(workspaceId: string | null): number {
    this.workspaceId = workspaceId;
    this.userId = this.auth.currentUser()?.id ?? null;
    this.scopeContext.set({ userId: this.userId, workspaceId });
    this.revision += 1;
    this.isConfigured.set(false);
    this.importAvailable.set(false);
    this.listingManagementAvailable.set(false);
    this.connectionData.set(null);
    this.isLoading.set(false);
    this.isReading.set(false);
    this.error.set(null);
    this.clearData();
    return this.revision;
  }
  private clearData(): void {
    this.pages.clear();
    this.sync.set(null);
    this.trafficRevision++;
    this.traffic.set({});
    this.trafficLoading.set(false);
    this.trafficError.set(null);
    this.trafficPeriod.set(null);
    this.bookingRevision++;
    this.orderBookings.set({});
    this.bookingStatusesLoading.set(false);
    this.bookingError.set(null);
    this.listingRows.set([]);
    this.orderRows.set([]);
    this.total.set(null);
    this.nextPage.set(null);
    this.hasRead.set(false);
    this.dataError.set(null);
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Die eBay-Anfrage konnte nicht bestätigt werden.';
  }
  async initialize(
    workspaceId: string | null,
    read: boolean,
    section: 'listings' | 'orders' = this.section(),
  ): Promise<void> {
    const userId = this.auth.currentUser()?.id ?? null;
    const previous = this.connection();
    const retained =
      userId !== null &&
      this.userId === userId &&
      this.workspaceId === workspaceId &&
      previous?.status === 'connected' &&
      Number.isSafeInteger(previous.authorizationVersion);
    this.rememberPage();
    const revision = retained ? ++this.revision : this.reset(workspaceId);
    this.section.set(section);
    if (retained) {
      this.restorePage();
      this.isReading.set(false);
      this.trafficRevision++;
      this.trafficLoading.set(false);
      this.bookingRevision++;
      this.bookingStatusesLoading.set(false);
    }
    if (!workspaceId) return;
    this.isLoading.set(true);
    try {
      const status = await this.api.loadStatus(workspaceId);
      if (!this.isCurrent(revision)) return;
      const current = status.connection;
      if (
        !retained ||
        !current ||
        current.status !== 'connected' ||
        current.connectionId !== previous?.connectionId ||
        current.environment !== previous.environment ||
        current.authorizationVersion === undefined ||
        current.authorizationVersion !== previous.authorizationVersion
      )
        this.clearData();
      this.isConfigured.set(status.configured);
      this.importAvailable.set(status.importAvailable === true);
      this.listingManagementAvailable.set(status.listingManagementAvailable === true);
      this.connectionData.set(status.connection);
      this.isLoading.set(false);
      if (read && status.configured && status.connection?.status === 'connected')
        await this.read(false);
    } catch (error) {
      if (this.isCurrent(revision)) {
        if (
          error instanceof EbayAccountRequestError &&
          ['unauthorized', 'forbidden', 'needs_login', 'connection_changed'].includes(
            error.code ?? '',
          )
        ) {
          this.clearData();
          this.connectionData.set(null);
        }
        this.error.set(this.message(error));
      }
    } finally {
      if (this.isCurrent(revision)) this.isLoading.set(false);
    }
  }
  async connect(): Promise<string | null> {
    const workspaceId = this.workspaceId;
    if (
      !workspaceId ||
      this.isLoading() ||
      this.isReading() ||
      this.trafficLoading() ||
      !this.isConfigured()
    )
      return null;
    const revision = this.revision;
    this.isLoading.set(true);
    this.error.set(null);
    this.clearData();
    try {
      const url = await this.api.connect(workspaceId);
      return this.isCurrent(revision) ? url : null;
    } catch (error) {
      if (this.isCurrent(revision)) this.error.set(this.message(error));
      return null;
    } finally {
      if (this.isCurrent(revision)) this.isLoading.set(false);
    }
  }
  async disconnect(): Promise<void> {
    const connection = this.connection();
    if (!connection || !this.contextMatches() || this.isLoading()) return;
    // Laufende Antworten werden bereits vor dem Trennen aus der Ansicht ausgeschlossen.
    const revision = ++this.revision;
    this.isLoading.set(true);
    this.isReading.set(false);
    this.error.set(null);
    this.clearData();
    try {
      await this.api.disconnect(connection);
      if (this.isCurrent(revision))
        this.connectionData.set({
          ...connection,
          status: 'disconnected',
          username: null,
          lastReadAt: null,
        });
    } catch (error) {
      if (this.isCurrent(revision)) this.error.set(this.message(error));
    } finally {
      if (this.isCurrent(revision)) this.isLoading.set(false);
    }
  }
  async selectSection(section: 'listings' | 'orders'): Promise<void> {
    if (this.isLoading() || this.isReading() || this.trafficLoading() || this.section() === section)
      return;
    this.rememberPage();
    this.section.set(section);
    this.restorePage();
    await this.read(false);
  }
  async read(append: boolean): Promise<void> {
    const connection = this.connection();
    if (
      !connection ||
      connection.status !== 'connected' ||
      this.isReading() ||
      this.trafficLoading() ||
      this.isLoading() ||
      !this.isConfigured()
    )
      return;
    const revision = this.revision;
    const section = this.section();
    const page = append ? this.nextPage() : 1;
    if (page === null) return;
    this.isReading.set(true);
    this.dataError.set(null);

    let shouldReadTraffic = false;
    try {
      if (section === 'listings') {
        const result = await this.api.loadListings(connection, page);
        if (!this.isCurrent(revision)) return;
        this.listingRows.update((items) =>
          append
            ? [...items, ...result.items].filter(
                (item, index, all) =>
                  all.findIndex((candidate) => candidate.id === item.id) === index,
              )
            : result.items,
        );
        this.total.set(result.total);
        this.nextPage.set(result.nextPage);
        this.sync.set(result.sync ?? null);
      } else {
        const result = await this.api.loadOrders(connection, page);
        if (!this.isCurrent(revision)) return;
        this.orderRows.update((items) =>
          append
            ? [...items, ...result.items].filter(
                (item, index, all) =>
                  all.findIndex((candidate) => candidate.id === item.id) === index,
              )
            : result.items,
        );
        this.total.set(result.total);
        this.nextPage.set(result.nextPage);
        this.sync.set(result.sync ?? null);
      }
      if (section === 'orders' && this.importAvailable()) void this.readBookingStatuses(connection);
      this.hasRead.set(true);
      this.rememberPage();
      shouldReadTraffic = section === 'listings' && this.listingManagementAvailable();
    } catch (error) {
      if (!this.isCurrent(revision)) return;
      const errorMessage = this.message(error);
      this.dataError.set(errorMessage);
      this.rememberPage();
      try {
        const status = await this.api.loadStatus(connection.workspaceId);
        if (this.isCurrent(revision)) {
          this.connectionData.set(status.connection);
          this.importAvailable.set(status.importAvailable === true);
          if (
            status.connection?.status !== 'connected' ||
            status.connection.connectionId !== connection.connectionId ||
            status.connection.authorizationVersion !== connection.authorizationVersion
          ) {
            this.clearData();
            this.dataError.set(errorMessage);
          }
        }
      } catch {
        /* Der ursprüngliche Abruffehler bleibt sichtbar. */
      }
    } finally {
      if (this.isCurrent(revision)) this.isReading.set(false);
    }
    if (shouldReadTraffic && this.isCurrent(revision)) await this.readTraffic();
  }
  private rememberPage(): void {
    this.pages.set(this.section(), {
      total: this.total(),
      nextPage: this.nextPage(),
      hasRead: this.hasRead(),
      sync: this.sync(),
      error: this.dataError(),
    });
  }
  private restorePage(): void {
    const page = this.pages.get(this.section());
    this.total.set(page?.total ?? null);
    this.nextPage.set(page?.nextPage ?? null);
    this.hasRead.set(page?.hasRead ?? false);
    this.sync.set(page?.sync ?? null);
    this.dataError.set(page?.error ?? null);
  }
  async readTraffic(): Promise<void> {
    const connection = this.connection();
    if (
      !connection ||
      connection.status !== 'connected' ||
      !this.listingManagementAvailable() ||
      this.section() !== 'listings' ||
      this.isReading() ||
      this.isLoading() ||
      this.trafficLoading() ||
      !this.listings().length
    )
      return;
    const revision = ++this.trafficRevision;
    const ids = this.listings().map((listing) => listing.id);
    this.trafficLoading.set(true);
    this.trafficError.set(null);
    this.traffic.set({});
    this.trafficPeriod.set(null);
    try {
      for (let offset = 0; offset < ids.length; offset += 50) {
        const report = await this.api.loadTraffic(connection, ids.slice(offset, offset + 50));
        if (revision !== this.trafficRevision) return;
        this.traffic.update((previous) => ({
          ...previous,
          ...Object.fromEntries(report.items.map((item) => [item.listingId, item])),
        }));
        this.trafficPeriod.set({
          startDate: report.startDate,
          endDate: report.endDate,
          lastUpdatedDate: report.lastUpdatedDate,
        });
      }
    } catch (error) {
      if (revision === this.trafficRevision) this.trafficError.set(this.message(error));
    } finally {
      if (revision === this.trafficRevision) this.trafficLoading.set(false);
    }
  }
  private async readBookingStatuses(connection: EbayConnection): Promise<void> {
    const revision = ++this.bookingRevision;
    const orders = this.orders();
    let next = 0;
    this.bookingStatusesLoading.set(true);
    this.bookingError.set(null);
    const worker = async () => {
      while (revision === this.bookingRevision && next < orders.length) {
        const order = orders[next++];
        try {
          const booking = await this.api.loadOrderStatus(connection, order.id);
          if (revision === this.bookingRevision)
            this.orderBookings.update((items) => ({ ...items, [order.id]: booking }));
        } catch {
          if (revision === this.bookingRevision)
            this.bookingError.set(
              'Einige Buchungsstände konnten nicht geprüft werden. Lade die Daten erneut.',
            );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, orders.length) }, worker));
    if (revision === this.bookingRevision) this.bookingStatusesLoading.set(false);
  }
}
