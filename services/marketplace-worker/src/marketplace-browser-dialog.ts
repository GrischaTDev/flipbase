import type { ServerResponse } from 'node:http';
import type {
  BrowserSessionScope,
  MarketplaceBrowserSessionBroker,
} from './marketplace-browser-session-broker.ts';
import {
  actionUuid,
  actionRecord,
  type AccountActionClaim,
  type SupabaseMarketplaceAccountActionStore,
} from './supabase-marketplace-account-action-store.ts';

interface DialogPresence {
  scope: BrowserSessionScope;
  dialogId: string;
  response: ServerResponse;
  connected: boolean;
  heartbeat?: ReturnType<typeof setInterval>;
  sessionId?: string;
}
interface DialogOptions {
  actions: SupabaseMarketplaceAccountActionStore;
  profiles: { prepare(scope: BrowserSessionScope): Promise<void> };
  broker: Pick<
    MarketplaceBrowserSessionBroker,
    'open' | 'close' | 'discardUnstartedAction' | 'handoffAccountSession'
  >;
  wake(): void;
}
/** Eine wartende Anmeldung darf ausschließlich den noch verbundenen Kontodialog öffnen. */
export class MarketplaceBrowserDialog {
  private readonly options: DialogOptions;
  private readonly presences = new Map<string, DialogPresence>();
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(options: DialogOptions) {
    this.options = options;
  }
  private key(scope: BrowserSessionScope): string {
    return `${scope.workspaceId}:${scope.connectionId}`;
  }
  private present(presence: DialogPresence, scope: BrowserSessionScope, dialogId: string): boolean {
    return (
      this.presences.get(this.key(scope)) === presence &&
      presence.connected &&
      presence.dialogId === dialogId &&
      presence.scope.userId === scope.userId &&
      !presence.response.destroyed &&
      !presence.response.writableEnded
    );
  }
  private presence(
    scope: BrowserSessionScope,
    dialogId: string,
    connected: boolean,
  ): Promise<unknown> {
    return this.options.actions.rpc(
      'marketplace_browser_dialog_presence',
      {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_dialog_id: dialogId,
        p_connected: connected,
      },
      scope.userAccessToken,
    );
  }
  async connectPresence(
    scope: BrowserSessionScope,
    dialogId: string,
    response: ServerResponse,
  ): Promise<void> {
    actionUuid(dialogId);
    await this.presence(scope, dialogId, true);
    const key = this.key(scope),
      previous = this.presences.get(key);
    const presence: DialogPresence = {
      scope: { ...scope },
      dialogId,
      response,
      connected: true,
      ...(previous?.dialogId === dialogId && previous.scope.userId === scope.userId
        ? { sessionId: previous.sessionId }
        : {}),
    };
    this.presences.set(key, presence);
    if (previous) {
      previous.connected = false;
      clearInterval(previous.heartbeat);
      previous.response.end();
    }
    const disconnect = async () => {
      presence.connected = false;
      clearInterval(presence.heartbeat);
      if (this.presences.get(key) !== presence) return;
      this.presences.delete(key);
      try {
        await this.presence(scope, dialogId, false);
      } finally {
        await this.exclusive(key, async () => {
          if (presence.sessionId)
            await this.options.broker.close(presence.scope, presence.sessionId);
        });
      }
    };
    response.once('close', () => {
      void disconnect().catch(() => undefined);
    });
    if (response.destroyed || response.writableEnded) {
      await disconnect();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    const emit = () =>
      response.write('event: dialog_ready\ndata: ' + JSON.stringify({ dialogId }) + '\n\n');
    if (!emit()) {
      response.end();
      return;
    }
    let refreshing = false;
    presence.heartbeat = setInterval(() => {
      if (refreshing || !this.present(presence, scope, dialogId)) return;
      refreshing = true;
      void this.presence(scope, dialogId, true)
        .then(() => {
          if (this.present(presence, scope, dialogId) && !emit()) response.end();
        })
        .catch(() => response.end())
        .finally(() => {
          refreshing = false;
        });
    }, 10_000);
    presence.heartbeat.unref();
  }
  requestOpen(scope: BrowserSessionScope, dialogId: string): Promise<unknown> {
    return this.exclusive(this.key(scope), async () => {
      const presence = this.presences.get(this.key(scope));
      if (!presence || !this.present(presence, scope, actionUuid(dialogId)))
        throw new Error('Der Anmeldedialog ist nicht verbunden.');
      await this.options.profiles.prepare(scope);
      if (!this.present(presence, scope, dialogId))
        throw new Error('Der Anmeldedialog wurde geschlossen.');
      const accepted = await this.options.actions.enqueue(scope, dialogId, 'cloud_session_open', {
        dialogId,
      });
      this.options.wake();
      return accepted;
    });
  }
  run(claim: AccountActionClaim): Promise<void> {
    return this.exclusive(this.key(claim.scope), async () => {
      const { actions, broker } = this.options,
        dialogId = actionUuid(claim.payload.dialogId),
        presence = this.presences.get(this.key(claim.scope));
      if (!presence || !this.present(presence, claim.scope, dialogId)) {
        await broker.discardUnstartedAction(claim.scope);
        await actions.finish(claim.scope, 'failed', null, 'dialog_closed');
        return;
      }
      let opened: string | undefined,
        handedOff = false,
        finishAttempted = false;
      try {
        opened = await broker.open(claim.scope);
        if (!this.present(presence, claim.scope, dialogId)) {
          await broker.close(claim.scope, opened);
          await actions.finish(claim.scope, 'failed', null, 'dialog_closed');
          return;
        }
        await broker.handoffAccountSession(
          claim.scope,
          opened,
          dialogId,
          presence.scope.userAccessToken,
        );
        handedOff = true;
        presence.sessionId = opened;
        if (!this.present(presence, claim.scope, dialogId)) {
          await broker.close(presence.scope, opened);
          await actions.finish(claim.scope, 'failed', null, 'dialog_closed');
          return;
        }
        finishAttempted = true;
        await actions.finish(claim.scope, 'succeeded', { id: opened });
        if (!this.present(presence, claim.scope, dialogId))
          await broker.close(presence.scope, opened);
      } catch {
        if (opened) await broker.close(handedOff ? presence.scope : claim.scope, opened);
        else if (!opened) await broker.discardUnstartedAction(claim.scope);
        if (finishAttempted) {
          const current = actionRecord(
            actionRecord(await actions.read(presence.scope, claim.actionId)).action,
          );
          if (current.id !== claim.actionId) throw new Error('Anmeldeabschluss nicht bestätigt');
          if (current.state === 'succeeded' && actionRecord(current.result).id !== opened)
            throw new Error('Anmeldeabschluss nicht bestätigt');
          if (current.state !== 'running') return;
        }
        await actions.finish(claim.scope, 'failed', null, 'browser_unavailable');
      }
    });
  }
  shutdownPresence(): void {
    for (const presence of this.presences.values()) {
      presence.connected = false;
      clearInterval(presence.heartbeat);
      presence.response.end();
    }
  }
  private async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const running = previous.catch(() => undefined).then(operation);
    this.pending.set(key, running);
    try {
      return await running;
    } finally {
      if (this.pending.get(key) === running) this.pending.delete(key);
    }
  }
}
