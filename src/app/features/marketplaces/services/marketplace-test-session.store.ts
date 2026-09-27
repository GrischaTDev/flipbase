import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceResponseError } from '../models/marketplace-response';
import type { MarketplaceTestSession } from '../models/marketplace-test-session';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  MarketplaceTestSessionApiError,
  MarketplaceTestSessionApiService,
} from './marketplace-test-session-api.service';

type TestAction = 'ping' | 'interrupt' | 'revoke';

function errorMessage(error: unknown): string {
  return error instanceof MarketplaceTestSessionApiError ||
    error instanceof MarketplaceResponseError
    ? error.message
    : 'Der Sitzungstest konnte nicht bestätigt werden. Prüfe den Zustand erneut.';
}

@Injectable()
export class MarketplaceTestSessionStore {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceTestSessionApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly contextKey = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const currentWorkspace = this.workspace.currentWorkspace();
    const account = this.accounts.selectedConnection();
    return userId &&
      currentWorkspace &&
      !currentWorkspace.archived_at &&
      this.accounts.canManage() &&
      account?.workspaceId === currentWorkspace.id
      ? JSON.stringify([
          userId,
          currentWorkspace.id,
          account.connectionId,
          this.accounts.selectionVersion(),
        ])
      : null;
  });
  private readonly sessionState = signal<{ key: string; value: MarketplaceTestSession } | null>(
    null,
  );
  private readonly busyState = signal<string | null>(null);
  private readonly errorState = signal<{ key: string; value: string } | null>(null);
  private requestRevision = 0;
  private destroyed = false;

  readonly connection = computed(() =>
    this.contextKey() === null ? null : this.accounts.selectedConnection(),
  );
  readonly session = computed(() => {
    const state = this.sessionState();
    return state?.key === this.contextKey() ? state.value : null;
  });
  readonly busy = computed(
    () => this.busyState() !== null && this.busyState() === this.contextKey(),
  );
  readonly error = computed(() => {
    const state = this.errorState();
    return state?.key === this.contextKey() ? state.value : null;
  });
  readonly canStart = computed(() => {
    const connection = this.connection();
    return (
      connection !== null &&
      connection.status !== 'paused' &&
      connection.status !== 'blocked' &&
      this.session()?.state !== 'active' &&
      !this.busy()
    );
  });
  readonly canAct = computed(() => this.session()?.state === 'active' && !this.busy());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.requestRevision++;
    });
  }

  async start(): Promise<void> {
    const connection = this.connection();
    if (!connection || !this.canStart()) return;
    const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
    await this.request(() => this.api.start(scope));
  }

  async refresh(): Promise<void> {
    const connection = this.connection();
    const session = this.session();
    if (!connection || !session || this.busy()) return;
    const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
    await this.request(() => this.api.status(scope, session.id));
  }

  async action(action: TestAction): Promise<void> {
    const connection = this.connection();
    const session = this.session();
    if (!connection || !session || !this.canAct()) return;
    if (Date.now() >= Date.parse(session.expiresAt)) {
      await this.refresh();
      return;
    }
    const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
    await this.request(() => this.api.action(scope, session.id, action));
  }

  private async request(operation: () => Promise<MarketplaceTestSession>): Promise<void> {
    const key = this.contextKey();
    if (!key || this.busy()) return;
    const revision = ++this.requestRevision;
    this.busyState.set(key);
    this.errorState.set(null);
    try {
      const result = await operation();
      if (this.isCurrent(key, revision)) this.sessionState.set({ key, value: result });
    } catch (error) {
      if (this.isCurrent(key, revision)) this.errorState.set({ key, value: errorMessage(error) });
    } finally {
      if (this.isCurrent(key, revision)) this.busyState.set(null);
    }
  }

  private isCurrent(key: string, revision: number): boolean {
    return !this.destroyed && this.contextKey() === key && this.requestRevision === revision;
  }
}
