import type {
  CloudSetupRequest,
  CloudSetupResult,
  CloudSetupView,
} from './marketplace-cloud-setup-contracts.d.ts';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  SupabaseMarketplaceCloudSetupStore,
  PrivateCloudSetup,
} from './supabase-marketplace-cloud-setup-store.ts';
import type { VintedAccountIdentity } from './vinted-browser-reader.ts';
import type { ServerResponse } from 'node:http';
import {
  actionRecord,
  actionUuid,
  type AccountActionClaim,
  type SupabaseMarketplaceAccountActionStore,
} from './supabase-marketplace-account-action-store.ts';

interface SetupPresence {
  scope: BrowserSessionScope;
  setupId: string;
  dialogId: string;
  response: ServerResponse;
  connected: boolean;
  sessionId?: string;
  heartbeat?: ReturnType<typeof setInterval>;
}

interface SetupOptions {
  actions?: Pick<SupabaseMarketplaceAccountActionStore, 'enqueue' | 'finish' | 'read'>;
  wake?: () => void;
  refreshInventory?: () => Promise<void>;
  purchaseIp?: (
    request: CloudSetupRequest,
    userId: string,
    token: string,
  ) => Promise<
    | 'available'
    | 'purchase_pending'
    | 'purchase_failed'
    | 'limit_reached'
    | 'no_capacity'
    | 'price_limit_exceeded'
  >;
  purchaseCompleted?: (request: CloudSetupRequest, userId: string) => Promise<void>;
  reconcilePurchases?: (request: CloudSetupRequest, userId: string) => Promise<void>;
  store: Pick<
    SupabaseMarketplaceCloudSetupStore,
    'availability' | 'begin' | 'read' | 'cancel' | 'readAuthorized' | 'step' | 'rows' | 'presence'
  >;
  profiles: {
    prepareCloudSetup(scope: BrowserSessionScope, setupId: string): Promise<void>;
    cleanupCloudSetup(scope: BrowserSessionScope, setup: PrivateCloudSetup): Promise<void>;
  };
  broker: {
    open(scope: BrowserSessionScope): Promise<string>;
    run<T>(
      scope: BrowserSessionScope,
      id: string,
      operation: (browser: BrowserInfo) => Promise<T>,
    ): Promise<T>;
    close(scope: BrowserSessionScope, id: string): Promise<void>;
    handoffCloudSetup?(
      scope: BrowserSessionScope,
      id: string,
      setupId: string,
      token: string,
    ): Promise<void>;
    discardUnstartedAction?(scope: BrowserSessionScope): Promise<void>;
  };
}
function record(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

/** Einrichtungssitzungen erhalten ausschließlich eine interne Anmeldeberechtigung. */
export class MarketplaceCloudSetup {
  private readonly options: SetupOptions;
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly preparations = new Map<string, Promise<CloudSetupResult>>();
  private readonly presences = new Map<string, SetupPresence>();
  constructor(options: SetupOptions) {
    this.options = options;
  }
  availability(workspaceId: string, accessToken: string): Promise<boolean> {
    return this.options.store.availability(workspaceId, accessToken);
  }
  async begin(
    request: CloudSetupRequest,
    userId: string,
    accessToken: string,
  ): Promise<CloudSetupResult> {
    const key = JSON.stringify([userId, request.workspaceId, request.requestId, request]);
    let preparation = this.preparations.get(key);
    if (preparation && !(await this.options.store.availability(request.workspaceId, accessToken)))
      throw new Error('Cloud-Einrichtung ist nicht freigegeben');
    if (!preparation) {
      preparation = this.prepare(request, userId, accessToken);
      this.preparations.set(key, preparation);
      const current = preparation;
      const expire = () => {
        // Ein geschlossener Dialog darf kein fertiges Ergebnis dauerhaft im Speicher halten.
        setTimeout(() => {
          if (this.preparations.get(key) === current) this.preparations.delete(key);
        }, 60_000).unref();
      };
      void preparation.then(expire, expire);
    }
    const waiting = Symbol('preparation_pending');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        preparation,
        new Promise<typeof waiting>((resolve) => {
          timeout = setTimeout(() => resolve(waiting), 1000);
        }),
      ]);
      if (result === waiting) return { status: 'purchase_pending' };
      if (this.preparations.get(key) === preparation) this.preparations.delete(key);
      return result;
    } catch (failure) {
      if (this.preparations.get(key) === preparation) this.preparations.delete(key);
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  }
  private async prepare(
    request: CloudSetupRequest,
    userId: string,
    accessToken: string,
  ): Promise<CloudSetupResult> {
    if (this.options.refreshInventory) {
      if (!(await this.options.store.availability(request.workspaceId, accessToken)))
        throw new Error('Cloud-Einrichtung ist nicht freigegeben');
      await this.options.refreshInventory();
      await this.options.reconcilePurchases?.(request, userId);
    }
    let result = await this.options.store.begin(request, accessToken);
    if (result.status === 'no_capacity' && this.options.purchaseIp) {
      const purchase = await this.options.purchaseIp(request, userId, accessToken);
      if (purchase !== 'available') return { status: purchase };
      await this.options.refreshInventory?.();
      result = await this.options.store.begin(request, accessToken);
    }
    if (result.status === 'ready') await this.options.purchaseCompleted?.(request, userId);
    return result;
  }
  read(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    return this.options.store.read(scope, setupId);
  }
  async authorize(scope: BrowserSessionScope, setupId: string): Promise<BrowserSessionScope> {
    const setup = await this.options.store.readAuthorized(scope, setupId);
    if (!['login', 'verified'].includes(setup.setup.state))
      throw new Error('Einrichtungssitzung nicht verfügbar');
    return { ...scope, cloudSetup: { setupId } };
  }
  requestOpen(
    scope: BrowserSessionScope,
    setupId: string,
    dialogId: string,
  ): Promise<CloudSetupView> {
    return this.exclusive(setupId, async () => {
      actionUuid(dialogId);
      const presence = this.presences.get(setupId);
      if (!presence || !this.present(presence, scope, dialogId) || !this.options.actions)
        throw new Error('Öffne die Einrichtung erneut.');
      await this.options.profiles.prepareCloudSetup(scope, setupId);
      const setup = await this.read(scope, setupId);
      if (setup.startState === 'running' && setup.sessionId) return setup;
      if (!this.present(presence, scope, dialogId))
        throw new Error('Einrichtungsdialog wurde geschlossen.');
      actionRecord(
        await this.options.actions.enqueue(scope, dialogId, 'cloud_setup_open', {
          setupId,
          dialogId,
        }),
      );
      this.options.wake?.();
      return this.read(scope, setupId);
    });
  }
  private present(presence: SetupPresence, scope: BrowserSessionScope, dialogId: string): boolean {
    return (
      this.presences.get(presence.setupId) === presence &&
      presence.connected &&
      !presence.response.destroyed &&
      !presence.response.writableEnded &&
      presence.dialogId === dialogId &&
      presence.scope.userId === scope.userId &&
      presence.scope.workspaceId === scope.workspaceId &&
      presence.scope.connectionId === scope.connectionId
    );
  }
  shutdownPresence(): void {
    for (const presence of this.presences.values()) {
      presence.connected = false;
      clearInterval(presence.heartbeat);
      presence.response.end();
    }
  }
  async connectPresence(
    scope: BrowserSessionScope,
    setupId: string,
    dialogId: string,
    response: ServerResponse,
  ): Promise<void> {
    actionUuid(dialogId);
    const setup = await this.options.store.presence(scope, setupId, dialogId, true);
    const previous = this.presences.get(setupId);
    const presence: SetupPresence = {
      scope,
      setupId,
      dialogId,
      response,
      connected: true,
      ...(setup.startState === 'running' && setup.sessionId ? { sessionId: setup.sessionId } : {}),
    };
    this.presences.set(setupId, presence);
    if (previous) {
      previous.connected = false;
      clearInterval(previous.heartbeat);
      previous.response.end();
    }
    let refreshing = false;
    const disconnect = async () => {
      presence.connected = false;
      clearInterval(presence.heartbeat);
      if (this.presences.get(setupId) !== presence) return;
      this.presences.delete(setupId);
      try {
        await this.options.store.presence(scope, setupId, dialogId, false);
      } finally {
        await this.exclusive(setupId, async () => {
          if (presence.sessionId)
            await this.options.broker.close(
              { ...scope, cloudSetup: { setupId } },
              presence.sessionId,
            );
        });
      }
    };
    response.once('close', () => {
      void disconnect().catch(() => {
        // Lokaler Widerruf gilt sofort; fehlgeschlagene Stopps bleiben für Recovery reserviert.
      });
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
    if (!response.write('event: setup_changed\ndata: ' + JSON.stringify(setup) + '\n\n')) {
      response.end();
      return;
    }
    presence.heartbeat = setInterval(() => {
      if (refreshing || !this.present(presence, scope, dialogId)) return;
      refreshing = true;
      void this.options.store
        .presence(scope, setupId, dialogId, true)
        .then((view) => {
          if (
            this.present(presence, scope, dialogId) &&
            !response.write('event: setup_changed\ndata: ' + JSON.stringify(view) + '\n\n')
          )
            response.end();
        })
        .catch(() => response.end())
        .finally(() => {
          refreshing = false;
        });
    }, 10_000);
    presence.heartbeat.unref();
  }
  runQueuedSetup(claim: AccountActionClaim): Promise<void> {
    return this.exclusive(actionUuid(claim.payload.setupId), async () => {
      const setupId = actionUuid(claim.payload.setupId),
        dialogId = actionUuid(claim.payload.dialogId);
      const presence = this.presences.get(setupId);
      const actions = this.options.actions;
      if (
        !actions ||
        !this.options.broker.handoffCloudSetup ||
        !this.options.broker.discardUnstartedAction
      )
        throw new Error('Einrichtungswarteschlange ist nicht verfügbar.');
      if (!presence || !this.present(presence, claim.scope, dialogId)) {
        await this.options.broker.discardUnstartedAction(claim.scope);
        await actions.finish(claim.scope, 'failed', null, 'setup_dialog_closed');
        return;
      }
      let opened: string | undefined;
      let handedOff = false;
      let finishAttempted = false;
      let finishConfirmed = false;
      try {
        opened = await this.options.broker.open(claim.scope);
        if (!this.present(presence, claim.scope, dialogId)) {
          await this.options.broker.close(claim.scope, opened);
          await actions.finish(claim.scope, 'failed', null, 'setup_dialog_closed');
          return;
        }
        await this.options.broker.handoffCloudSetup(
          claim.scope,
          opened,
          setupId,
          presence.scope.userAccessToken,
        );
        handedOff = true;
        finishAttempted = true;
        // Der Datenbankabschluss veröffentlicht die Sitzung erst nach der lokalen Übergabe.
        try {
          await actions.finish(claim.scope, 'succeeded', { id: opened });
        } catch (failure) {
          const receipt = actionRecord(
            actionRecord(await actions.read(presence.scope, claim.actionId)).action,
          );
          if (
            receipt.id !== claim.actionId ||
            receipt.workspaceId !== claim.scope.workspaceId ||
            receipt.connectionId !== claim.scope.connectionId ||
            receipt.state !== 'succeeded' ||
            actionRecord(receipt.result).id !== opened
          )
            throw failure;
        }
        finishConfirmed = true;
        presence.sessionId = opened;
        if (!this.present(presence, claim.scope, dialogId)) {
          await this.options.broker.close({ ...presence.scope, cloudSetup: { setupId } }, opened);
          return;
        }
        const view = await this.read(presence.scope, setupId);
        if (
          this.present(presence, claim.scope, dialogId) &&
          !presence.response.write('event: setup_changed\ndata: ' + JSON.stringify(view) + '\n\n')
        )
          presence.response.end();
      } catch {
        if (opened)
          await this.options.broker.close(
            handedOff ? { ...presence.scope, cloudSetup: { setupId } } : claim.scope,
            opened,
          );
        else if (!opened) await this.options.broker.discardUnstartedAction(claim.scope);
        if (finishAttempted && !finishConfirmed)
          throw new Error('Einrichtungsabschluss muss geprüft werden.');
        if (!finishAttempted)
          await actions.finish(claim.scope, 'failed', null, 'browser_unavailable');
      }
    });
  }
  async verify(
    scope: BrowserSessionScope,
    setupId: string,
    identity: VintedAccountIdentity,
  ): Promise<void> {
    await this.options.store.readAuthorized(scope, setupId);
    await this.options.store.step(scope, setupId, 'verify', {
      externalAccountId: identity.id,
      username: identity.username,
    });
  }
  complete(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    return this.exclusive(setupId, async () => {
      let setup = await this.read(scope, setupId);
      if (setup.state === 'completed') return setup;
      if (setup.state !== 'finalizing') {
        if (!setup.sessionId) throw new Error('Bestätigte Anmeldesitzung fehlt');
        const setupScope = await this.authorize(scope, setupId);
        const identity = await this.options.broker.run(
          setupScope,
          setup.sessionId,
          async (browser) => {
            if (!browser.identify) throw new Error('Identitätsprüfung fehlt');
            return browser.identify();
          },
        );
        if (!identity) throw new Error('Vinted-Anmeldung fehlt');
        await this.verify(scope, setupId, identity);
        setup = (await this.options.store.step(scope, setupId, 'finalize')).setup;
      }
      if (setup.sessionId)
        await this.options.broker.close({ ...scope, cloudSetup: { setupId } }, setup.sessionId);
      try {
        return (await this.options.store.step(scope, setupId, 'complete')).setup;
      } catch {
        // Ein verlorenes Commit-ACK darf das inzwischen aktive Cloudkonto nicht zurücksetzen.
        const committed = await this.read(scope, setupId);
        if (committed.state === 'completed') return committed;
        throw new Error('Cloudwechsel konnte nicht abgeschlossen werden');
      }
    });
  }
  cancel(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    return this.exclusive(setupId, async () => {
      const setup = await this.options.store.cancel(scope, setupId);
      if (setup.state === 'completed' || setup.state === 'cancelled') return setup;
      if (setup.sessionId)
        await this.options.broker.close({ ...scope, cloudSetup: { setupId } }, setup.sessionId);
      return this.cleanup(scope, setupId);
    });
  }
  private async cleanup(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    const setup = await this.options.store.step(scope, setupId, 'recover');
    if (setup.setup.state === 'cancelled') return setup.setup;
    if (setup.setup.state !== 'cleanup_pending') throw new Error('Cloudkonto bleibt zugeordnet');
    await this.options.profiles.cleanupCloudSetup(scope, setup);
    return (await this.options.store.step(scope, setupId, 'cleanup')).setup;
  }
  async recover(allInterrupted = false): Promise<void> {
    const rows = await this.options.store.rows('marketplace_cloud_setups', {
      select:
        'public_id,workspace_id,connection_id,requested_by,state,expires_at,marketplace_connections(execution_mode)',
      state: 'neq.cancelled',
    });
    let failed = false;
    for (const row of rows) {
      if (
        !record(row) ||
        ['public_id', 'workspace_id', 'connection_id', 'requested_by', 'state', 'expires_at'].some(
          (field) => typeof row[field] !== 'string',
        ) ||
        !record(row['marketplace_connections'])
      )
        throw new Error('Cloudbereinigung konnte nicht geprüft werden');
      const scope = {
        workspaceId: row['workspace_id'] as string,
        connectionId: row['connection_id'] as string,
        userId: row['requested_by'] as string,
        userAccessToken: '',
      };
      const setupId = row['public_id'] as string;
      const local = row['marketplace_connections']['execution_mode'] === 'local';
      if (
        row['state'] === 'completed'
          ? !local
          : !allInterrupted &&
            row['state'] !== 'cleanup_pending' &&
            !(Date.parse(row['expires_at'] as string) <= Date.now())
      )
        continue;
      try {
        await this.exclusive(setupId, async () => {
          if (row['state'] === 'completed') {
            await this.options.store.step(scope, setupId, 'recover');
            await this.options.store.step(scope, setupId, 'release');
          }
          await this.cleanup(scope, setupId);
        });
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error('Cloudbereinigung bleibt ausstehend');
  }
  async releaseConnection(scope: BrowserSessionScope): Promise<void> {
    const rows = await this.options.store.rows('marketplace_cloud_setups', {
      select: 'public_id,requested_by,state',
      workspace_id: `eq.${scope.workspaceId}`,
      connection_id: `eq.${scope.connectionId}`,
      state: 'neq.cancelled',
    });
    if (!rows.length) return;
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !record(row) ||
      typeof row['public_id'] !== 'string' ||
      typeof row['requested_by'] !== 'string'
    )
      throw new Error('Cloudzuordnung konnte nicht geprüft werden');
    const setupId = row['public_id'];
    const owner = { ...scope, userId: row['requested_by'] };
    await this.exclusive(setupId, async () => {
      await this.options.store.step(owner, setupId, 'recover');
      if (row['state'] === 'completed') await this.options.store.step(owner, setupId, 'release');
      await this.cleanup(owner, setupId);
    });
  }
  private async exclusive<T>(setupId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(setupId);
    if (existing) {
      await existing.catch(() => undefined);
      return this.exclusive(setupId, operation);
    }
    const current = operation().finally(() => this.pending.delete(setupId));
    this.pending.set(setupId, current);
    return current;
  }
}
