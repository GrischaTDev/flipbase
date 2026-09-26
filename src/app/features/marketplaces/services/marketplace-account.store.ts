import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { AccountScope, MarketplaceConnection } from '../models/marketplace.models';
import type {
  MarketplaceEntry,
  MarketplaceEntryKind,
  MarketplacePage,
  MarketplaceSnapshot,
} from '../models/marketplace-read.models';
import { MarketplaceResponseError } from '../models/marketplace-response';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';

const snapshotPages = {
  publication: 'publications',
  conversation: 'conversations',
  sale: 'sales',
  activity: 'activity',
} as const;
function errorMessage(error: unknown): string {
  return error instanceof MarketplaceApiError || error instanceof MarketplaceResponseError
    ? error.message
    : 'Die Kontodaten konnten nicht geladen werden. Bitte versuche es erneut.';
}

/** Ein eigener Zustand je geöffneter Marktplatz-/Einstellungsseite, kein globales aktives Konto. */
@Injectable()
export class MarketplaceAccountStore {
  private readonly api = inject(MarketplaceApiService);
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
  private readonly accountSnapshot = signal<MarketplaceSnapshot | null>(null);
  private readonly conversationId = signal<string | null>(null);
  private readonly messagePage = signal<MarketplacePage<MarketplaceEntry> | null>(null);
  private readonly access = signal(false);
  private readonly fetching = signal(false);
  private readonly fetchingSnapshot = signal(false);
  private readonly fetchingMessages = signal(false);
  private readonly fetchingPage = signal<MarketplaceEntryKind | null>(null);
  private readonly writing = signal(false);
  private readonly loadError = signal<string | null>(null);
  private readonly writeError = signal<string | null>(null);
  private connectionsRevision = 0;
  private selectionRevision = 0;
  private conversationRevision = 0;
  private mutationRevision = 0;
  private destroyed = false;

  readonly connections = computed(() => (this.current() ? this.accountList() : []));
  readonly canManage = computed(() => this.current() && this.access());
  readonly selectedConnection = computed(
    () => this.connections().find((item) => item.connectionId === this.activeId()) ?? null,
  );
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
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.reset();
    });
  }

  async reloadConnections(preferredId?: string): Promise<void> {
    const key = this.contextKey();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!key || !workspaceId || !this.current()) return;
    const previousId = preferredId ?? this.activeId();
    const revision = ++this.connectionsRevision;
    this.selectionRevision++;
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
        this.loadError.set('Du hast keinen Verwaltungszugriff auf diese Marktplatzkonten.');
        return;
      }
      const selected =
        result.connections.find((item) => item.connectionId === previousId) ??
        result.connections[0];
      if (selected) await this.selectConnection(selected.connectionId);
    } catch (error) {
      if (this.isCurrent(key) && revision === this.connectionsRevision) this.handleError(error);
    } finally {
      if (this.isCurrent(key) && revision === this.connectionsRevision) this.fetching.set(false);
    }
  }

  async selectConnection(connectionId: string | null): Promise<void> {
    const connection = this.connections().find((item) => item.connectionId === connectionId);
    const key = this.contextKey();
    if (!connection || !key || !this.canManage()) return;
    const revision = ++this.selectionRevision;
    this.conversationRevision++;
    this.activeId.set(connection.connectionId);
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
      if (this.isCurrent(key) && revision === this.selectionRevision)
        this.accountSnapshot.set(result);
    } catch (error) {
      if (this.isCurrent(key) && revision === this.selectionRevision) this.handleError(error);
    } finally {
      if (this.isCurrent(key) && revision === this.selectionRevision)
        this.fetchingSnapshot.set(false);
    }
  }

  async openConversation(id: string): Promise<void> {
    const connection = this.selectedConnection();
    const key = this.contextKey();
    if (!key || !connection || !this.snapshot()?.conversations.items.some((item) => item.id === id))
      return;
    const revision = ++this.conversationRevision;
    const selection = this.selectionRevision;
    if (this.fetchingPage() === 'message') this.fetchingPage.set(null);
    this.conversationId.set(id);
    this.messagePage.set(null);
    this.fetchingMessages.set(true);
    this.loadError.set(null);
    try {
      const result = await this.api.readPage(this.scope(connection), 'message', null, id);
      if (
        this.isCurrent(key) &&
        revision === this.conversationRevision &&
        selection === this.selectionRevision
      )
        this.messagePage.set(result);
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
      if (kind === 'message') this.messagePage.set(combined);
      else
        this.accountSnapshot.update((value) =>
          value ? { ...value, [snapshotPages[kind]]: combined } : value,
        );
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

  async createConnection(name: string): Promise<boolean> {
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId || !this.validName(name)) return false;
    return this.mutate(
      async () => (await this.api.createConnection(workspaceId, name.trim())).connectionId,
    );
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
  private async mutate(operation: () => Promise<string | undefined>): Promise<boolean> {
    const key = this.contextKey();
    if (!key || !this.canManage() || this.busy()) return false;
    const revision = ++this.mutationRevision;
    this.writing.set(true);
    this.writeError.set(null);
    try {
      const selectedId = await operation();
      if (!this.isCurrent(key) || revision !== this.mutationRevision) return false;
      await this.reloadConnections(selectedId);
      return this.isCurrent(key) && revision === this.mutationRevision;
    } catch (error) {
      if (this.isCurrent(key) && revision === this.mutationRevision) {
        if (error instanceof MarketplaceApiError && error.code === 'forbidden')
          this.handleError(error);
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
      this.conversationRevision++;
      this.reset();
    }
    this.loadError.set(errorMessage(error));
  }
  private reset(): void {
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
  }
}
