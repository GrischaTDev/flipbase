import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { StockService } from '../../../core/services/stock.service';
import type { AppNotification } from '../../../core/models/webhook.models';
import type { EbayConnection } from '../../../../../supabase/functions/_shared/ebay-contracts';
import type {
  EbaySaleDraft,
  EbaySaleNotification,
  EbayStockReservation,
  EbaySaleNotificationAction,
} from '../../../../../supabase/functions/_shared/ebay-sale-draft-contracts';
import { EbayOrderImportApiService } from '../../marketplaces/services/ebay-order-import-api.service';
import { EbayAccountApiService } from '../../marketplaces/services/ebay-account-api.service';

export function ebayDraftStateLabel(state: string): string {
  const labels: Readonly<Record<string, string>> = {
    needs_mapping: 'Zuordnung fehlt',
    needs_stock: 'Bestand prüfen',
    needs_costs: 'Kosten ergänzen',
    ready_for_review: 'Bereit zur Prüfung',
    blocked: 'Quelle klären',
    booked: 'Gebucht',
    linked_existing: 'Bestehendem Verkauf zugeordnet',
    dismissed: 'Geklärt',
  };
  return labels[state] ?? 'Prüfen';
}
function connectionKey(connection: EbayConnection | null): string | null {
  return connection?.status === 'connected' && Number.isSafeInteger(connection.authorizationVersion)
    ? JSON.stringify([
        connection.workspaceId,
        connection.connectionId,
        connection.environment,
        connection.authorizationVersion,
      ])
    : null;
}
@Injectable({ providedIn: 'root' })
export class EbaySaleActivityStore {
  private readonly api = inject(EbayOrderImportApiService);
  private readonly accounts = inject(EbayAccountApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly stock = inject(StockService);
  private readonly inventory = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    return userId && workspace && !workspace.archived_at
      ? JSON.stringify([userId, workspace.id])
      : null;
  });
  private readonly loadedContext = signal<string | null>(null);
  private readonly rows = signal<readonly EbaySaleDraft[]>([]);
  private readonly events = signal<readonly EbaySaleNotification[]>([]);
  private readonly held = signal<readonly EbayStockReservation[]>([]);
  readonly connection = signal<EbayConnection | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly resolving = signal(false);
  private loadRevision = 0;
  private mutationRevision = 0;
  private resolutionRevision = 0;
  private feedRevision = 0;
  private inFlight: Promise<void> | null = null;
  readonly drafts = computed(() =>
    this.context() === this.loadedContext() && connectionKey(this.connection()) ? this.rows() : [],
  );
  readonly reservations = computed(() =>
    this.context() && this.context() === this.loadedContext() ? this.held() : [],
  );
  readonly notifications = computed<readonly AppNotification[]>(() =>
    this.context() === this.loadedContext() && connectionKey(this.connection())
      ? this.events().map((event) => ({
          id: event.eventKey,
          type: 'sale',
          title: 'eBay-Verkauf prüfen',
          message: `${event.orderId} · ${ebayDraftStateLabel(event.state)}`,
          timestamp: event.createdAt,
          read: event.readAt !== null,
          link: this.reviewLink(event.orderId),
        }))
      : [],
  );
  readonly unreadCount = computed(() => this.notifications().filter((row) => !row.read).length);
  constructor() {
    effect(() => {
      const key = this.context();
      untracked(() => {
        this.loadRevision++;
        this.mutationRevision++;
        this.resolutionRevision++;
        this.inFlight = null;
        this.rows.set([]);
        this.events.set([]);
        this.held.set([]);
        this.connection.set(null);
        this.error.set(null);
        this.loadedContext.set(key);
        this.loading.set(false);
        this.resolving.set(false);
        if (key) void this.reload();
      });
    });
    const timer = setInterval(() => {
      if (this.context()) void this.reload();
    }, 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.loadRevision++;
      this.mutationRevision++;
      this.resolutionRevision++;
      this.rows.set([]);
      this.events.set([]);
      this.held.set([]);
    });
  }
  reviewLink(orderId: string): string {
    const connection = this.connection();
    return connection
      ? `/sales/ebay/${encodeURIComponent(connection.connectionId)}/${encodeURIComponent(orderId)}`
      : '/sales';
  }
  reload(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const key = this.context();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || this.destroyRef.destroyed) return Promise.resolve();
    const revision = ++this.loadRevision;
    const feedRevision = this.feedRevision;
    const current = () =>
      !this.destroyRef.destroyed && key === this.context() && revision === this.loadRevision;
    this.loading.set(true);
    const operation = async () => {
      try {
        const [statusResult, reservationResult] = await Promise.allSettled([
          this.accounts.loadStatus(workspaceId),
          this.api.loadReservations(workspaceId),
        ]);
        if (!current()) return;
        if (reservationResult.status === 'rejected') throw reservationResult.reason;
        const reservations = reservationResult.value;
        const reservationChanged = JSON.stringify(reservations) !== JSON.stringify(this.held());
        this.held.set(reservations);
        this.loadedContext.set(key);
        if (statusResult.status === 'rejected') {
          this.rows.set([]);
          this.events.set([]);
          this.connection.set(null);
          this.mutationRevision++;
          this.error.set(
            'Die private eBay-Kontofreigabe konnte nicht bestätigt werden. Interne Reservierungen bleiben klärbar.',
          );
          if (reservationChanged) await this.refreshLoadedStock(workspaceId, current);
          return;
        }
        const status = statusResult.value;
        const connection = status.importAvailable && status.configured ? status.connection : null;
        const changed = connectionKey(connection) !== connectionKey(this.connection());
        if (changed) {
          this.mutationRevision++;
          this.rows.set([]);
          this.events.set([]);
        }
        this.connection.set(connection);
        const [drafts, events] = await Promise.all([
          connectionKey(connection) && connection ? this.api.loadDrafts(connection) : [],
          connectionKey(connection) && connection
            ? this.readAllNotifications(connection, current)
            : [],
        ]);
        if (!current()) return;
        this.held.set(reservations);
        this.rows.set(drafts);
        if (feedRevision === this.feedRevision) this.events.set(events);
        this.loadedContext.set(key);
        this.error.set(null);
        if (reservationChanged) await this.refreshLoadedStock(workspaceId, current);
      } catch (error) {
        if (current()) {
          this.rows.set([]);
          this.events.set([]);
          this.connection.set(null);
          this.mutationRevision++;
          this.error.set(
            error instanceof Error
              ? error.message
              : 'Die eBay-Prüfung konnte nicht geladen werden.',
          );
        }
      } finally {
        if (current()) {
          this.loading.set(false);
          this.inFlight = null;
        }
      }
    };
    this.inFlight = operation();
    return this.inFlight;
  }
  private async readAllNotifications(
    connection: EbayConnection,
    current: () => boolean,
  ): Promise<readonly EbaySaleNotification[]> {
    const rows: EbaySaleNotification[] = [];
    // Endliche RPC-Seitengrenze; kein überlappender Poll und Abbruch bei Kontextwechsel.
    for (let page = 1; page <= 100000; page++) {
      if (!current()) return [];
      const batch = await this.api.loadNotifications(connection, page);
      if (!current()) return [];
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return [...new Map(rows.map((row) => [row.eventId, row])).values()];
  }
  private async refreshLoadedStock(workspaceId: string, current: () => boolean): Promise<void> {
    if (!current()) return;
    await Promise.all([
      this.stock.loadedWorkspaceId() === workspaceId
        ? this.stock.loadPositions(workspaceId)
        : undefined,
      this.inventory.loadedWorkspaceId() === workspaceId
        ? this.inventory.loadInventory(workspaceId, true)
        : undefined,
    ]);
  }
  async markAsRead(id: string): Promise<void> {
    await this.mark(id, 'read');
  }
  async markAsUnread(id: string): Promise<void> {
    await this.mark(id, 'unread');
  }
  async markAllAsRead(): Promise<void> {
    await this.mark(null, 'read');
  }
  async clearNotifications(): Promise<void> {
    await this.mark(null, 'dismiss');
  }
  private async mark(id: string | null, action: EbaySaleNotificationAction): Promise<void> {
    const key = this.context();
    const connection = this.connection();
    const signature = connectionKey(connection);
    const revision = this.mutationRevision;
    if (
      !key ||
      !connection ||
      !signature ||
      this.destroyRef.destroyed ||
      this.loadedContext() !== key
    )
      return;
    const current = () =>
      !this.destroyRef.destroyed &&
      key === this.context() &&
      revision === this.mutationRevision &&
      signature === connectionKey(this.connection());
    let selected = this.events().filter((event) =>
      id === null ? action !== 'read' || event.readAt === null : event.eventKey === id,
    );
    if (!selected.length) return;
    const status = await this.accounts.loadStatus(connection.workspaceId);
    if (!current()) return;
    if (
      !status.configured ||
      !status.importAvailable ||
      connectionKey(status.connection) !== signature
    ) {
      this.mutationRevision++;
      this.events.set([]);
      this.rows.set([]);
      this.connection.set(null);
      return;
    }
    this.feedRevision++;
    if (id === null) {
      const history: EbaySaleNotification[] = [];
      for (let page = 1; page <= 100000; page++) {
        if (!current()) return;
        const batch = await this.api.loadNotifications(connection, page);
        if (!current()) return;
        history.push(...batch);
        if (batch.length < 100) break;
      }
      selected = history.filter((event) => action !== 'read' || event.readAt === null);
    }
    for (const event of selected) {
      if (!current()) return;
      await this.api.updateNotification(connection, event.eventId, action);
      if (!current()) return;
      this.feedRevision++;
      this.events.update((rows) =>
        action === 'dismiss'
          ? rows.filter((row) => row.eventId !== event.eventId)
          : rows.map((row) =>
              row.eventId === event.eventId
                ? { ...row, readAt: action === 'read' ? new Date().toISOString() : null }
                : row,
            ),
      );
    }
  }
  async resolveReservation(draftId: string, reason: string): Promise<boolean> {
    const key = this.context();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (
      !key ||
      !workspaceId ||
      this.resolving() ||
      !reason.trim() ||
      reason.trim().length > 500 ||
      !this.reservations().some((row) => row.draftId === draftId)
    )
      return false;
    const revision = ++this.resolutionRevision;
    this.resolving.set(true);
    this.error.set(null);
    const current = () =>
      !this.destroyRef.destroyed && key === this.context() && revision === this.resolutionRevision;
    let saved = false;
    try {
      if (!current()) return false;
      await this.api.resolveReservation(workspaceId, draftId, reason.trim());
      if (!current()) return false;
      saved = true;
      // Einen älteren Poll erst abschließen, bevor der bestätigte interne Stand neu gelesen wird.
      if (this.inFlight) await this.inFlight;
      if (!current()) return false;
      this.held.update((rows) => rows.filter((row) => row.draftId !== draftId));
      await this.refreshLoadedStock(workspaceId, current);
      if (!current()) return false;
      await this.reload();
      return current();
    } catch (error) {
      if (current())
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Reservierung konnte nicht freigegeben werden.',
        );
      return saved && current();
    } finally {
      if (current()) this.resolving.set(false);
    }
  }
}
