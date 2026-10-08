import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type {
  AccountScope,
  MarketplaceConnection,
  MarketplaceMetrics,
} from '../models/marketplace.models';
import type { VintedListingDescription } from '../models/vinted-listing-description';
import {
  observeVintedListingMetrics,
  type VintedListingMetricChange,
  type VintedListingMetricChanges,
} from '../models/vinted-listing-metric-change';
import type {
  MarketplaceEntry,
  MarketplaceEntryKind,
  MarketplacePage,
  MarketplaceSnapshot,
} from '../models/marketplace-read.models';
import { MarketplaceResponseError } from '../models/marketplace-response';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import {
  MarketplaceBrowserTestApiService,
  MarketplaceConnectionRemovalError,
  MarketplaceWorkerOutdatedError,
  MarketplaceImportError,
  type MarketplaceSyncProgress,
  type VintedListingEditFields,
} from './marketplace-browser-test-api.service';

const snapshotPages = {
  publication: 'publications',
  conversation: 'conversations',
  sale: 'sales',
  activity: 'activity',
} as const;
function errorMessage(error: unknown): string {
  return error instanceof MarketplaceApiError ||
    error instanceof MarketplaceResponseError ||
    error instanceof MarketplaceConnectionRemovalError ||
    error instanceof MarketplaceWorkerOutdatedError ||
    error instanceof MarketplaceImportError
    ? error.message
    : 'Die Kontodaten konnten nicht geladen werden. Bitte versuche es erneut.';
}

/** Ein eigener Zustand je geöffneter Marktplatz-/Einstellungsseite, kein globales aktives Konto. */
@Injectable()
export class MarketplaceAccountStore {
  private readonly api = inject(MarketplaceApiService);
  private readonly browserApi = inject(MarketplaceBrowserTestApiService);
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly contextKey = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    return userId && workspace && !workspace.archived_at
      ? JSON.stringify([userId, workspace.id])
      : null;
  });
  private readonly loadedContext = signal<string | null>(null);
  private readonly current = computed(
    () => this.contextKey() !== null && this.loadedContext() === this.contextKey(),
  );
  private readonly accountList = signal<readonly MarketplaceConnection[]>([]);
  private readonly activeId = signal<string | null>(null);
  readonly hasExplicitConnectionSelection = signal(false);
  private readonly selectionEpoch = signal(0);
  private readonly accountSnapshot = signal<MarketplaceSnapshot | null>(null);
  private readonly conversationId = signal<string | null>(null);
  private readonly messagePage = signal<MarketplacePage<MarketplaceEntry> | null>(null);
  private readonly conversationPages = new Map<string, MarketplacePage<MarketplaceEntry>>();
  private readonly access = signal(false);
  private readonly fetching = signal(false);
  private readonly fetchingSnapshot = signal(false);
  private readonly fetchingMessages = signal(false);
  private readonly fetchingPage = signal<MarketplaceEntryKind | null>(null);
  private readonly writing = signal(false);
  private readonly loadError = signal<string | null>(null);
  private readonly writeError = signal<string | null>(null);
  private readonly syncStatus = signal<MarketplaceSyncProgress | null>(null);
  private syncConnectionId: string | null = null;
  private connectionsRevision = 0;
  private selectionRevision = 0;
  private conversationRevision = 0;
  private mutationRevision = 0;
  private destroyed = false;
  private disconnectImports: (() => void) | null = null;
  private readonly backgroundFetching = signal(false);
  private readonly pendingImport = signal<{
    scope: AccountScope;
    lastSyncedAt: string | null;
    force?: boolean;
  } | null>(null);
  private checkingImport = false;
  private forceImportCheck = false;
  private pageRevision = 0;
  private readonly descriptions = new Map<string, VintedListingDescription>();
  private readonly descriptionRequests = new Map<string, Promise<VintedListingDescription>>();
  private metricConnectionId: string | null = null;
  private readonly metricBaselines = new Map<string, MarketplaceMetrics>();
  private readonly displayedMetricObservations = new Map<string, string>();
  private readonly metricChanges = signal<Readonly<Record<string, VintedListingMetricChange>>>({});
  readonly listingMetricChanges = computed<VintedListingMetricChanges>(() =>
    this.current() && this.activeId() === this.metricConnectionId ? this.metricChanges() : {},
  );

  readonly connections = computed(() => (this.current() ? this.accountList() : []));
  readonly accountLimit = 10;
  readonly remainingSlots = computed(() =>
    Math.max(0, this.accountLimit - this.connections().length),
  );
  readonly canManage = computed(() => this.current() && this.access());
  readonly selectedConnection = computed(
    () => this.connections().find((item) => item.connectionId === this.activeId()) ?? null,
  );
  readonly localInboxUnavailable = computed(() => {
    const connection = this.selectedConnection();
    return (
      connection?.executionMode === 'local' &&
      connection.capabilities['conversations.read'] !== 'verified'
    );
  });
  readonly localSalesUnavailable = computed(() => {
    const connection = this.selectedConnection();
    return (
      connection?.executionMode === 'local' && connection.capabilities['sales.read'] !== 'verified'
    );
  });
  readonly selectionVersion = this.selectionEpoch.asReadonly();
  readonly snapshot = computed(() =>
    this.current() && this.canManage() ? this.accountSnapshot() : null,
  );
  readonly messages = computed(() =>
    this.current() && this.canManage() ? this.messagePage() : null,
  );
  readonly selectedConversationId = computed(() => (this.current() ? this.conversationId() : null));
  readonly loading = computed(
    () => this.contextKey() !== null && (!this.current() || this.fetching()),
  );
  readonly loadingSnapshot = computed(() => this.current() && this.fetchingSnapshot());
  readonly loadingMessages = computed(() => this.current() && this.fetchingMessages());
  readonly loadingPage = computed(() => (this.current() ? this.fetchingPage() : null));
  readonly busy = computed(() => this.current() && this.writing());
  readonly error = computed(() => (this.current() ? this.loadError() : null));
  readonly mutationError = computed(() => (this.current() ? this.writeError() : null));
  readonly syncProgress = computed(() => (this.current() ? this.syncStatus() : null));
  private readonly importChannelKey = computed(() => {
    const connection = this.selectedConnection();
    return connection && this.canManage()
      ? JSON.stringify([this.contextKey(), connection.workspaceId, connection.connectionId])
      : null;
  });

  constructor() {
    effect(() => {
      const key = this.contextKey();
      untracked(() => {
        this.connectionsRevision++;
        this.selectionRevision++;
        this.conversationRevision++;
        this.mutationRevision++;
        this.reset();
        this.loadedContext.set(key);
        if (key) void this.reloadConnections();
      });
    });
    effect(() => {
      const key = this.importChannelKey();
      untracked(() => {
        const connection = this.selectedConnection();
        this.disconnectImports?.();
        this.disconnectImports = null;
        if (!key || !connection) return;
        const scope = this.scope(connection);
        try {
          this.disconnectImports = this.api.listenAccountImports(
            scope,
            (lastSyncedAt) => {
              void this.refreshImportedSnapshot(scope, lastSyncedAt);
            },
            () => {
              void this.checkLatestImport();
            },
          );
        } catch {
          /* Die Kontrollabfrage bleibt bei fehlendem Livekanal aktiv. */
        }
      });
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token && this.canManage()) this.api.authenticateImports?.(token);
    });
    effect(() => {
      const pending = this.pendingImport();
      const blocked =
        this.loading() ||
        this.loadingSnapshot() ||
        this.loadingMessages() ||
        this.loadingPage() ||
        this.busy() ||
        this.backgroundFetching();
      if (pending && !blocked)
        untracked(() => {
          void this.drainPendingImport();
        });
    });
    const importTimer = setInterval(() => {
      void this.checkLatestImport();
    }, 30_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(importTimer);
      this.disconnectImports?.();
      this.disconnectImports = null;
      this.pendingImport.set(null);
      this.reset();
    });
  }

  private readSavedConnection(context: string): string | null {
    try {
      return localStorage.getItem(`flipbase:vinted:last-account:${context}`);
    } catch {
      return null;
    }
  }

  private saveConnection(context: string, connectionId: string): void {
    try {
      // Ausschließlich die Konto-ID speichern; keine Profildaten oder Zugangsdaten.
      localStorage.setItem(`flipbase:vinted:last-account:${context}`, connectionId);
    } catch {
      // Kontowechsel bleiben auch bei gesperrtem Browserspeicher möglich.
    }
  }

  async reloadConnections(preferredId?: string): Promise<void> {
    const key = this.contextKey();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || !this.current()) return;
    const savedId = this.readSavedConnection(key);
    const previousId = preferredId ?? this.activeId() ?? savedId;
    const wasExplicit = this.hasExplicitConnectionSelection();
    const revision = ++this.connectionsRevision;
    this.selectionRevision++;
    this.clearDescriptions();
    this.conversationPages.clear();
    this.selectionEpoch.update((value) => value + 1);
    this.conversationRevision++;
    this.accountList.set([]);
    this.activeId.set(null);
    this.accountSnapshot.set(null);
    this.messagePage.set(null);
    this.conversationId.set(null);
    this.access.set(false);
    this.fetching.set(true);
    this.fetchingSnapshot.set(false);
    this.fetchingMessages.set(false);
    this.fetchingPage.set(null);
    this.loadError.set(null);
    try {
      const result = await this.api.listConnections(workspaceId);
      if (!this.isCurrent(key) || revision !== this.connectionsRevision) return;
      this.accountList.set(result.connections);
      this.access.set(result.canManage);
      this.fetching.set(false);
      if (!result.canManage) {
        this.clearListingMetrics();
        this.loadError.set('Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.');
        return;
      }
      const selected =
        result.connections.find((item) => item.connectionId === previousId) ??
        result.connections[0];
      if (selected) {
        this.hasExplicitConnectionSelection.set(
          (wasExplicit && selected.connectionId === previousId) ||
            (savedId !== null && selected.connectionId === savedId) ||
            (preferredId !== undefined && selected.connectionId === preferredId),
        );
        await this.selectConnection(selected.connectionId, false);
      } else this.clearListingMetrics();
    } catch (error) {
      if (this.isCurrent(key) && revision === this.connectionsRevision) this.handleError(error);
    } finally {
      if (this.isCurrent(key) && revision === this.connectionsRevision) this.fetching.set(false);
    }
  }

  async suggestConnection(connectionId: string): Promise<void> {
    if (
      this.hasExplicitConnectionSelection() ||
      this.selectedConnection()?.connectionId === connectionId
    )
      return;
    await this.selectConnection(connectionId, false);
  }

  async selectConnection(connectionId: string | null, rememberSelection = true): Promise<void> {
    const connection = this.connections().find((item) => item.connectionId === connectionId);
    const key = this.contextKey();
    if (!connection || !key || !this.canManage()) return;
    this.clearDescriptions();
    this.conversationPages.clear();
    if (this.metricConnectionId !== connection.connectionId) {
      this.clearListingMetrics();
      this.metricConnectionId = connection.connectionId;
    }
    if (this.syncConnectionId !== connectionId) {
      this.syncConnectionId = null;
      this.syncStatus.set(null);
    }
    const revision = ++this.selectionRevision;
    this.selectionEpoch.update((value) => value + 1);
    this.conversationRevision++;
    this.activeId.set(connection.connectionId);
    if (rememberSelection) {
      this.hasExplicitConnectionSelection.set(true);
      this.saveConnection(key, connection.connectionId);
    }
    this.accountSnapshot.set(null);
    this.messagePage.set(null);
    this.conversationId.set(null);
    this.fetchingSnapshot.set(true);
    this.fetchingMessages.set(false);
    this.fetchingPage.set(null);
    this.loadError.set(null);
    try {
      const scope = this.scope(connection);
      const result = await this.api.readSnapshot(scope);
      if (this.isCurrent(key) && revision === this.selectionRevision) this.acceptSnapshot(result);
    } catch (error) {
      if (this.isCurrent(key) && revision === this.selectionRevision) this.handleError(error);
    } finally {
      if (this.isCurrent(key) && revision === this.selectionRevision)
        this.fetchingSnapshot.set(false);
    }
  }

  async refreshImportedSnapshot(scope: AccountScope, lastSyncedAt: string | null): Promise<void> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    if (
      !key ||
      !lastSyncedAt ||
      !Number.isFinite(Date.parse(lastSyncedAt)) ||
      !this.canManage() ||
      connection?.connectionId !== scope.connectionId ||
      connection.workspaceId !== scope.workspaceId ||
      connection.status !== 'connected' ||
      (connection.lastSyncedAt !== null &&
        Date.parse(lastSyncedAt) <= Date.parse(connection.lastSyncedAt))
    )
      return;
    const pending = this.pendingImport();
    if (
      !pending ||
      pending.scope.connectionId !== scope.connectionId ||
      Date.parse(lastSyncedAt) > Date.parse(pending.lastSyncedAt ?? '')
    ) {
      this.pendingImport.set({ scope, lastSyncedAt });
    }
    if (
      this.loading() ||
      this.loadingSnapshot() ||
      this.loadingMessages() ||
      this.loadingPage() ||
      this.busy() ||
      this.backgroundFetching()
    )
      return;
    await this.drainPendingImport();
  }

  private async drainPendingImport(): Promise<void> {
    const pending = this.pendingImport();
    if (!pending || this.destroyed || this.backgroundFetching()) return;
    this.pendingImport.set(null);
    const { scope, lastSyncedAt } = pending;
    const connection = this.selectedConnection();
    const key = this.contextKey();
    if (
      !key ||
      !connection ||
      !this.canManage() ||
      connection.connectionId !== scope.connectionId ||
      connection.workspaceId !== scope.workspaceId
    )
      return;
    if (
      !pending.force &&
      connection.lastSyncedAt &&
      Date.parse(lastSyncedAt ?? '') <= Date.parse(connection.lastSyncedAt)
    )
      return;
    const selection = this.selectionRevision;
    const pageRevision = this.pageRevision;
    const conversation = this.conversationId();
    const conversationRevision = this.conversationRevision;
    const isCurrent = () => this.isCurrent(key) && selection === this.selectionRevision;
    this.backgroundFetching.set(true);
    try {
      const previous = this.snapshot();
      let result = await this.api.readSnapshot(this.scope(connection));
      // Bereits geladene Listenlänge behalten; die sichtbaren Karten bleiben stehen.
      for (const kind of ['publication', 'conversation', 'sale', 'activity'] as const) {
        const pageKey = snapshotPages[kind];
        const target = previous?.[pageKey].items.length ?? 0;
        const seen = new Set<string>();
        while (isCurrent() && result[pageKey].items.length < target && result[pageKey].nextCursor) {
          const cursor = result[pageKey].nextCursor!;
          if (seen.has(cursor) || seen.size >= 100) throw new MarketplaceResponseError();
          seen.add(cursor);
          const next = await this.api.readPage(this.scope(connection), kind, cursor);
          result = {
            ...result,
            [pageKey]: {
              ...next,
              items: [
                ...new Map(
                  [...result[pageKey].items, ...next.items].map((item) => [item.id, item]),
                ).values(),
              ],
            },
          };
        }
      }
      if (!isCurrent()) return;
      if (pageRevision !== this.pageRevision || this.loadingPage()) {
        // Nachladen während des Hintergrundabrufs zuerst abschließen und dann neu lesen.
        const queued = this.pendingImport();
        if (!queued || Date.parse(queued.lastSyncedAt ?? '') < Date.parse(lastSyncedAt ?? ''))
          this.pendingImport.set(pending);
        return;
      }
      this.acceptSnapshot(result);
      this.loadError.set(null);
      this.accountList.update((connections) =>
        connections.map((account) =>
          account.connectionId === scope.connectionId ? { ...account, lastSyncedAt } : account,
        ),
      );
      // Nur bereits gespeicherte Nachrichten lesen; keine Vinted-Lesebestätigung.
      if (
        conversation &&
        conversation === this.conversationId() &&
        conversationRevision === this.conversationRevision
      ) {
        const messages = await this.readConversationMessages(
          this.scope(connection),
          conversation,
          () =>
            isCurrent() &&
            conversation === this.conversationId() &&
            conversationRevision === this.conversationRevision,
        );
        if (
          isCurrent() &&
          conversation === this.conversationId() &&
          conversationRevision === this.conversationRevision
        )
          this.acceptConversationMessages(conversation, messages);
      }
    } catch (error) {
      if (isCurrent()) this.handleError(error);
    } finally {
      this.backgroundFetching.set(false);
    }
  }

  private async checkLatestImport(force = false): Promise<void> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const selection = this.selectionRevision;
    if (!key || !connection || !this.canManage() || this.destroyed) return;
    if (this.checkingImport) {
      this.forceImportCheck ||= force;
      return;
    }
    this.checkingImport = true;
    try {
      const result = await this.api.listConnections(connection.workspaceId);
      if (!this.isCurrent(key) || selection !== this.selectionRevision) return;
      if (!result.canManage) throw new MarketplaceApiError('forbidden');
      const latest = result.connections.find(
        (account) => account.connectionId === connection.connectionId,
      );
      if (!latest) {
        await this.reloadConnections();
        return;
      }
      this.accountList.update((accounts) =>
        result.connections.map((account) =>
          account.connectionId === latest.connectionId
            ? {
                ...account,
                lastSyncedAt:
                  accounts.find((previous) => previous.connectionId === account.connectionId)
                    ?.lastSyncedAt ?? null,
              }
            : account,
        ),
      );
      if (force) {
        this.pendingImport.set({
          scope: this.scope(latest),
          lastSyncedAt: latest.lastSyncedAt,
          force: true,
        });
        if (
          !this.loading() &&
          !this.loadingSnapshot() &&
          !this.loadingMessages() &&
          !this.loadingPage() &&
          !this.busy()
        )
          await this.drainPendingImport();
      } else await this.refreshImportedSnapshot(latest, latest.lastSyncedAt);
    } catch (error) {
      if (
        this.isCurrent(key) &&
        selection === this.selectionRevision &&
        error instanceof MarketplaceApiError &&
        error.code === 'forbidden'
      )
        this.handleError(error);
    } finally {
      this.checkingImport = false;
      if (this.forceImportCheck) {
        this.forceImportCheck = false;
        void this.checkLatestImport(true);
      }
    }
  }

  async refreshCloudConversation(
    id: string,
    isCurrent: () => boolean,
  ): Promise<
    | { status: 'success'; observedAt: string }
    | { status: 'failed'; error: string }
    | { status: 'cancelled' }
  > {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const selection = this.selectionRevision;
    const token = this.auth.session()?.access_token;
    const valid = () =>
      !!key &&
      this.isCurrent(key) &&
      selection === this.selectionRevision &&
      this.canManage() &&
      this.selectedConnection()?.executionMode === 'cloud' &&
      this.selectedConnection()?.status === 'connected' &&
      this.selectedConnection()?.externalAccountId === connection?.externalAccountId &&
      this.selectedConversationId() === id &&
      isCurrent();
    if (
      !connection ||
      connection.executionMode !== 'cloud' ||
      connection.status !== 'connected' ||
      !token ||
      !valid() ||
      !this.snapshot()?.conversations.items.some((entry) => entry.id === id)
    )
      return { status: 'cancelled' };
    try {
      const observedAt = await this.browserApi.readConversation(this.scope(connection), id, token);
      if (!valid()) return { status: 'cancelled' };
      await this.checkLatestImport(true);
      if (!valid()) return { status: 'cancelled' };
      return { status: 'success', observedAt };
    } catch (error) {
      return valid()
        ? {
            status: 'failed',
            error:
              error instanceof Error
                ? error.message
                : 'Das Gespräch konnte nicht aktualisiert werden.',
          }
        : { status: 'cancelled' };
    }
  }

  async openConversation(id: string): Promise<void> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const alreadySelected = this.conversationId() === id;
    if (
      !key ||
      !connection ||
      !this.canManage() ||
      (!alreadySelected && !this.snapshot()?.conversations.items.some((item) => item.id === id))
    )
      return;
    const revision = ++this.conversationRevision;
    const selection = this.selectionRevision;
    if (this.fetchingPage() === 'message') this.fetchingPage.set(null);
    this.conversationId.set(id);
    if (!alreadySelected) this.messagePage.set(this.conversationPages.get(id) ?? null);
    this.fetchingMessages.set(true);
    this.loadError.set(null);
    try {
      const result = await this.readConversationMessages(
        this.scope(connection),
        id,
        () =>
          this.isCurrent(key) &&
          revision === this.conversationRevision &&
          selection === this.selectionRevision,
      );
      if (
        this.isCurrent(key) &&
        revision === this.conversationRevision &&
        selection === this.selectionRevision
      )
        this.acceptConversationMessages(id, result);
    } catch (error) {
      if (
        this.isCurrent(key) &&
        revision === this.conversationRevision &&
        selection === this.selectionRevision
      )
        this.handleError(error);
    } finally {
      if (
        this.isCurrent(key) &&
        revision === this.conversationRevision &&
        selection === this.selectionRevision
      )
        this.fetchingMessages.set(false);
    }
  }

  async loadMore(kind: MarketplaceEntryKind): Promise<void> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const data = this.snapshot();
    const page = kind === 'message' ? this.messages() : data?.[snapshotPages[kind]];
    if (!key || !connection || !page?.nextCursor || this.loadingPage()) return;
    const selection = this.selectionRevision;
    const conversation = this.conversationRevision;
    this.pageRevision++;
    this.fetchingPage.set(kind);
    this.loadError.set(null);
    try {
      const result =
        kind === 'message'
          ? await this.api.readPage(
              this.scope(connection),
              kind,
              page.nextCursor,
              this.selectedConversationId(),
            )
          : await this.api.readPage(this.scope(connection), kind, page.nextCursor);
      if (
        !this.isCurrent(key) ||
        selection !== this.selectionRevision ||
        (kind === 'message' && conversation !== this.conversationRevision)
      )
        return;
      const items = [
        ...new Map([...page.items, ...result.items].map((item) => [item.id, item])).values(),
      ];
      const combined = { ...result, items };
      if (kind === 'message') {
        const conversationId = this.selectedConversationId();
        if (conversationId) this.acceptConversationMessages(conversationId, combined);
      } else {
        if (kind === 'publication') this.observeListingMetrics(result.items);
        this.accountSnapshot.update((value) =>
          value ? { ...value, [snapshotPages[kind]]: combined } : value,
        );
      }
    } catch (error) {
      if (
        this.isCurrent(key) &&
        selection === this.selectionRevision &&
        (kind !== 'message' || conversation === this.conversationRevision)
      )
        this.handleError(error);
    } finally {
      if (
        this.isCurrent(key) &&
        selection === this.selectionRevision &&
        (kind !== 'message' || conversation === this.conversationRevision)
      )
        this.fetchingPage.set(null);
    }
  }

  clearConversation(): void {
    if (this.fetchingPage() === 'message') this.fetchingPage.set(null);
    this.conversationRevision++;
    this.conversationId.set(null);
    this.messagePage.set(null);
    this.fetchingMessages.set(false);
  }
  clearMutationError(): void {
    this.writeError.set(null);
  }

  async createConnection(name: string): Promise<string | null> {
    if (!this.remainingSlots()) {
      this.writeError.set('Du kannst höchstens zehn Vinted-Konten pro Workspace hinzufügen.');
      return null;
    }
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId || !this.validName(name)) return null;
    let connectionId: string | null = null;
    const created = await this.mutate(async () => {
      connectionId = (await this.api.createConnection(workspaceId, name.trim())).connectionId;
      return connectionId;
    });
    return created && this.canManage() ? connectionId : null;
  }
  async reorderConnections(connectionIds: readonly string[]): Promise<boolean> {
    const key = this.contextKey();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || this.loading()) return false;
    const orderedIds = [...connectionIds];
    const connections = this.connections();
    if (
      orderedIds.length !== connections.length ||
      new Set(orderedIds).size !== connections.length ||
      orderedIds.some(
        (connectionId) =>
          !connections.some((connection) => connection.connectionId === connectionId),
      )
    )
      return false;
    const initialRevision = this.connectionsRevision;
    let isConfirmed = false;
    const saved = await this.mutate(async () => {
      await this.api.reorderConnections(workspaceId, orderedIds);
      if (!this.isCurrent(key) || !this.canManage() || initialRevision !== this.connectionsRevision)
        return undefined;
      const revision = ++this.connectionsRevision;
      const result = await this.api.listConnections(workspaceId);
      if (!this.isCurrent(key) || revision !== this.connectionsRevision) return undefined;
      if (!result.canManage) throw new MarketplaceApiError('forbidden');
      // Die bestätigte Metadatenreihenfolge verändert weder Auswahl noch geöffnete Kontodaten.
      this.accountList.set(result.connections);
      isConfirmed = true;
      return undefined;
    }, false);
    return saved && isConfirmed;
  }
  async renameConnection(id: string, name: string): Promise<boolean> {
    const connection = this.connections().find((item) => item.connectionId === id);
    if (!connection || !this.validName(name)) return false;
    const scope = this.scope(connection);
    return this.mutate(async () => {
      await this.api.renameConnection(scope, name.trim());
      return undefined;
    });
  }
  async setPaused(id: string, paused: boolean): Promise<boolean> {
    const connection = this.connections().find((item) => item.connectionId === id);
    if (!connection || connection.status === 'blocked') return false;
    const scope = this.scope(connection);
    return this.mutate(async () => {
      await this.api.setPaused(scope, paused);
      return undefined;
    });
  }
  async deleteConnection(id: string): Promise<boolean> {
    const connection = this.connections().find((item) => item.connectionId === id);
    const token = this.auth.session()?.access_token;
    if (!connection || !token) return false;
    const scope = this.scope(connection);
    return this.mutate(async () => {
      await this.browserApi.deleteConnection(scope, token);
      return undefined;
    });
  }
  async syncSelectedConnection(): Promise<boolean> {
    const connection = this.selectedConnection();
    const token = this.auth.session()?.access_token;
    if (
      !connection ||
      connection.executionMode === 'local' ||
      connection.status !== 'connected' ||
      !token ||
      this.busy()
    )
      return false;
    const scope = this.scope(connection);
    this.syncConnectionId = connection.connectionId;
    this.syncStatus.set(null);
    const completed = await this.mutate(async () => {
      await this.browserApi.syncConnection(scope, token, (progress) => {
        if (this.syncConnectionId === connection.connectionId && this.contextKey())
          this.syncStatus.set(progress);
      });
      return this.selectedConnection()?.connectionId ?? connection.connectionId;
    }, false);
    if (completed && this.selectedConnection()?.connectionId === scope.connectionId)
      await this.checkLatestImport(true);
    return completed;
  }
  async readPublication(connectionId: string, entryId: string): Promise<MarketplaceEntry | null> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const selection = this.selectionRevision;
    if (!key || !this.canManage() || connection?.connectionId !== connectionId) return null;
    const known = this.snapshot()?.publications.items.find((entry) => entry.id === entryId);
    if (known) return known;
    let entry: MarketplaceEntry | null;
    try {
      entry = await this.api.readPublication(this.scope(connection), entryId);
    } catch (error) {
      if (this.isCurrent(key) && selection === this.selectionRevision) this.handleError(error);
      throw error;
    }
    if (!this.isCurrent(key) || selection !== this.selectionRevision) return null;
    if (
      entry &&
      entry.connectionId === connectionId &&
      entry.workspaceId === connection.workspaceId
    ) {
      this.rememberStoredDescription(entry);
      this.observeListingMetrics([entry]);
      return entry;
    }
    return null;
  }

  async refreshLocalConnection(
    scope: AccountScope,
    preserveConversation = false,
  ): Promise<MarketplaceConnection | null> {
    const key = this.contextKey();
    if (!key || !this.canManage() || this.workspace.currentWorkspace()?.id !== scope.workspaceId)
      return null;
    const result = await this.api.listConnections(scope.workspaceId);
    if (!this.isCurrent(key)) return null;
    if (!result.canManage) {
      this.handleError(new MarketplaceApiError('forbidden'));
      return null;
    }
    this.accountList.set(result.connections);
    const connection =
      result.connections.find((account) => account.connectionId === scope.connectionId) ?? null;
    if (connection && this.activeId() === scope.connectionId) {
      if (preserveConversation) {
        this.pendingImport.set({ scope, lastSyncedAt: connection.lastSyncedAt, force: true });
        if (
          !this.loading() &&
          !this.loadingSnapshot() &&
          !this.loadingMessages() &&
          !this.loadingPage() &&
          !this.busy() &&
          !this.backgroundFetching()
        )
          await this.drainPendingImport();
      } else await this.selectConnection(scope.connectionId);
    }
    return this.isCurrent(key) ? connection : null;
  }

  cachedListingDescription(
    connectionId: string,
    entry: MarketplaceEntry,
  ): VintedListingDescription | null {
    const connection = this.selectedConnection();
    if (
      !this.canManage() ||
      connection?.connectionId !== connectionId ||
      entry.connectionId !== connectionId ||
      entry.workspaceId !== connection.workspaceId
    )
      return null;
    return this.rememberStoredDescription(entry);
  }

  async readListingDescription(
    connectionId: string,
    entryId: string,
  ): Promise<VintedListingDescription> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    const selection = this.selectionRevision;
    if (!key || !this.canManage() || connection?.connectionId !== connectionId)
      throw new Error('Wähle zuerst das Vinted-Konto aus.');
    const cached = this.descriptions.get(entryId);
    if (cached) {
      this.cacheDescription(entryId, cached);
      return cached;
    }
    const known = this.snapshot()?.publications.items.find((entry) => entry.id === entryId);
    if (known && (known.textState === 'loaded' || known.text !== null)) {
      return this.rememberStoredDescription(known)!;
    }
    const running = this.descriptionRequests.get(entryId);
    if (running) return running;
    const token = this.auth.session()?.access_token;
    if (connection.status !== 'connected' || !token)
      throw new Error('Verbinde Dein Vinted-Konto, um die Beschreibung zu laden.');
    if (connection.executionMode === 'local')
      throw new Error(
        'Übernimm die Inserate über die lokale Erweiterung, um die Beschreibung zu laden.',
      );
    const request = this.browserApi
      .readListingData(this.scope(connection), entryId, token)
      .then((read) => {
        if (!this.isCurrent(key) || selection !== this.selectionRevision)
          throw new Error('Die Kontoauswahl hat sich geändert.');
        // Eine inzwischen bestätigte Bearbeitung hat Vorrang vor diesem früher begonnenen Lesen.
        const current = this.descriptions.get(entryId);
        if (current && current.cacheState !== 'stored') {
          this.cacheDescription(entryId, current);
          return current;
        }
        const result: VintedListingDescription = {
          description: read.fields.description,
          cacheState: read.cacheState,
        };
        this.cacheDescription(entryId, result);
        return result;
      });
    this.descriptionRequests.set(entryId, request);
    try {
      return await request;
    } finally {
      if (this.descriptionRequests.get(entryId) === request)
        this.descriptionRequests.delete(entryId);
    }
  }

  consumeListingMetricChanges(entryIds: readonly string[]): VintedListingMetricChanges {
    const changes = this.listingMetricChanges();
    const result: Record<string, VintedListingMetricChange> = {};
    for (const id of entryIds) {
      const change = changes[id];
      if (!change || this.displayedMetricObservations.get(id) === change.observedAt) continue;
      this.displayedMetricObservations.set(id, change.observedAt);
      result[id] = change;
    }
    return result;
  }
  async readListingEdit(connectionId: string, entryId: string): Promise<VintedListingEditFields> {
    const key = this.contextKey();
    const selection = this.selectionRevision;
    const connection = this.selectedConnection();
    const token = this.auth.session()?.access_token;
    if (
      !this.canManage() ||
      connection?.executionMode === 'local' ||
      connection?.connectionId !== connectionId ||
      connection.status !== 'connected' ||
      !token
    )
      throw new Error('Wähle zuerst das verbundene Vinted-Konto aus.');
    const fields = await this.browserApi.readListingEdit(this.scope(connection), entryId, token);
    if (!key || !this.isCurrent(key) || selection !== this.selectionRevision)
      throw new Error('Die Kontoauswahl hat sich geändert.');
    return fields;
  }
  async saveListingEdit(
    connectionId: string,
    entryId: string,
    fields: VintedListingEditFields,
  ): Promise<void> {
    const key = this.contextKey();
    const selection = this.selectionRevision;
    const connection = this.selectedConnection();
    const token = this.auth.session()?.access_token;
    if (
      !this.canManage() ||
      connection?.executionMode === 'local' ||
      connection?.connectionId !== connectionId ||
      connection.status !== 'connected' ||
      !token
    )
      throw new Error('Wähle zuerst das verbundene Vinted-Konto aus.');
    await this.browserApi.saveListingEdit(this.scope(connection), entryId, fields, token);
    if (!key || !this.isCurrent(key) || selection !== this.selectionRevision)
      throw new Error('Die Kontoauswahl hat sich geändert. Prüfe die Änderung bei Vinted.');
    this.cacheDescription(entryId, { description: fields.description, cacheState: 'unconfirmed' });
    this.accountSnapshot.update((value) =>
      value && value.connectionId === connectionId
        ? {
            ...value,
            publications: {
              ...value.publications,
              items: value.publications.items.map((entry) =>
                entry.id === entryId
                  ? {
                      ...entry,
                      title: fields.title,
                      text: fields.description,
                      textState: 'loaded',
                      price: Number(fields.price.replace(',', '.')),
                    }
                  : entry,
              ),
            },
          }
        : value,
    );
  }
  async readProfileAbout(connectionId: string): Promise<string> {
    const connection = this.selectedConnection();
    const token = this.auth.session()?.access_token;
    if (
      !this.canManage() ||
      connection?.executionMode === 'local' ||
      connection?.connectionId !== connectionId ||
      connection.status !== 'connected' ||
      !token
    )
      throw new Error('Wähle zuerst das verbundene Vinted-Konto aus.');
    return this.browserApi.readProfileAbout(this.scope(connection), token);
  }
  async saveProfileAbout(
    connectionId: string,
    about: string,
    expectedAbout?: string,
  ): Promise<void> {
    const connection = this.selectedConnection();
    const token = this.auth.session()?.access_token;
    if (
      !this.canManage() ||
      connection?.executionMode === 'local' ||
      connection?.connectionId !== connectionId ||
      connection.status !== 'connected' ||
      !token
    )
      throw new Error('Wähle zuerst das verbundene Vinted-Konto aus.');
    await this.browserApi.saveProfileAbout(this.scope(connection), about, token, expectedAbout);
    this.accountSnapshot.update((value) =>
      value && value.connectionId === connectionId && value.profile
        ? { ...value, profile: { ...value.profile, bio: about, bioState: 'loaded' } }
        : value,
    );
  }
  private async mutate(
    operation: () => Promise<string | undefined>,
    reload = true,
  ): Promise<boolean> {
    const key = this.contextKey();
    if (!key || !this.canManage() || this.busy()) return false;
    const revision = ++this.mutationRevision;
    this.writing.set(true);
    this.writeError.set(null);
    try {
      const selectedId = await operation();
      if (!this.isCurrent(key) || revision !== this.mutationRevision) return false;
      if (reload) await this.reloadConnections(selectedId);
      return this.isCurrent(key) && revision === this.mutationRevision;
    } catch (error) {
      if (this.isCurrent(key) && revision === this.mutationRevision) {
        if (error instanceof MarketplaceApiError && error.code === 'forbidden')
          this.handleError(error);
        if (error instanceof MarketplaceConnectionRemovalError) await this.reloadConnections();
        if (this.isCurrent(key) && revision === this.mutationRevision)
          this.writeError.set(errorMessage(error));
      }
      return false;
    } finally {
      if (this.isCurrent(key) && revision === this.mutationRevision) this.writing.set(false);
    }
  }
  private validName(name: string): boolean {
    if (!name.trim() || [...name.trim()].length > 120 || /\p{Cc}/u.test(name)) {
      this.writeError.set('Gib einen Namen mit 1 bis 120 Zeichen ohne Steuerzeichen ein.');
      return false;
    }
    return true;
  }
  private scope(connection: MarketplaceConnection): AccountScope {
    return Object.freeze({
      workspaceId: connection.workspaceId,
      connectionId: connection.connectionId,
    });
  }
  private isCurrent(key: string): boolean {
    return !this.destroyed && this.current() && this.contextKey() === key;
  }
  private handleError(error: unknown): void {
    if (error instanceof MarketplaceApiError && error.code === 'forbidden') {
      this.connectionsRevision++;
      this.selectionRevision++;
      this.selectionEpoch.update((value) => value + 1);
      this.conversationRevision++;
      this.reset();
    }
    this.loadError.set(errorMessage(error));
  }
  private reset(): void {
    this.hasExplicitConnectionSelection.set(false);
    this.clearDescriptions();
    this.conversationPages.clear();
    this.clearListingMetrics();
    this.selectionEpoch.update((value) => value + 1);
    this.accountList.set([]);
    this.activeId.set(null);
    this.accountSnapshot.set(null);
    this.messagePage.set(null);
    this.conversationId.set(null);
    this.access.set(false);
    this.fetching.set(false);
    this.fetchingSnapshot.set(false);
    this.fetchingMessages.set(false);
    this.fetchingPage.set(null);
    this.writing.set(false);
    this.loadError.set(null);
    this.writeError.set(null);
    this.syncStatus.set(null);
    this.syncConnectionId = null;
    this.pendingImport.set(null);
  }

  private clearDescriptions(): void {
    this.descriptions.clear();
    this.descriptionRequests.clear();
  }
  private acceptConversationMessages(id: string, page: MarketplacePage<MarketplaceEntry>): void {
    this.conversationPages.delete(id);
    this.conversationPages.set(id, page);
    if (this.conversationPages.size > 50) {
      const oldest = this.conversationPages.keys().next().value;
      if (oldest) this.conversationPages.delete(oldest);
    }
    this.messagePage.set(page);
  }
  private async readConversationMessages(
    scope: AccountScope,
    id: string,
    isCurrent: () => boolean,
  ): Promise<MarketplacePage<MarketplaceEntry>> {
    const target = this.conversationPages.get(id)?.items.length ?? 0;
    let page = await this.api.readPage(scope, 'message', null, id);
    const seen = new Set<string>();
    // Bereits geöffnete ältere Nachrichten bleiben auch beim Abgleich sichtbar.
    while (isCurrent() && page.items.length < target && page.nextCursor) {
      const cursor = page.nextCursor;
      if (seen.has(cursor) || seen.size >= 100) throw new MarketplaceResponseError();
      seen.add(cursor);
      const next = await this.api.readPage(scope, 'message', cursor, id);
      page = {
        ...next,
        items: [
          ...new Map([...page.items, ...next.items].map((entry) => [entry.id, entry])).values(),
        ],
      };
    }
    return page;
  }
  private cacheDescription(id: string, description: VintedListingDescription): void {
    this.descriptions.delete(id);
    this.descriptions.set(id, description);
    if (this.descriptions.size > 50)
      this.descriptions.delete(this.descriptions.keys().next().value!);
  }
  private rememberStoredDescription(entry: MarketplaceEntry): VintedListingDescription | null {
    const cached = this.descriptions.get(entry.id);
    if (entry.textState !== 'loaded' && entry.text === null) return cached ?? null;
    // Kennzahlenzeit belegt keine Textfassung: Listenimporte können alten Text übernehmen.
    const value: VintedListingDescription =
      cached && cached.cacheState !== 'stored'
        ? cached
        : { description: entry.text ?? '', cacheState: 'stored' };
    this.cacheDescription(entry.id, value);
    return value;
  }
  private clearListingMetrics(): void {
    this.metricConnectionId = null;
    this.metricBaselines.clear();
    this.displayedMetricObservations.clear();
    this.metricChanges.set({});
  }
  private acceptSnapshot(snapshot: MarketplaceSnapshot): void {
    this.observeListingMetrics(snapshot.publications.items);
    for (const entry of snapshot.publications.items) this.rememberStoredDescription(entry);
    this.accountSnapshot.set(snapshot);
  }
  private observeListingMetrics(entries: readonly MarketplaceEntry[]): void {
    const changes = { ...this.metricChanges() };
    for (const entry of entries) {
      if (
        entry.connectionId !== this.metricConnectionId ||
        entry.workspaceId !== this.workspace.currentWorkspace()?.id
      )
        continue;
      const observation = observeVintedListingMetrics(
        this.metricBaselines.get(entry.id) ?? null,
        entry.metrics,
      );
      if (!observation) continue;
      this.metricBaselines.set(entry.id, observation.metrics);
      if (observation.change) changes[entry.id] = observation.change;
      else delete changes[entry.id];
    }
    this.metricChanges.set(changes);
  }
}
