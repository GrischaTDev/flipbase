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

interface SetupOptions {
  refreshInventory?: () => Promise<void>;
  store: Pick<
    SupabaseMarketplaceCloudSetupStore,
    'availability' | 'begin' | 'read' | 'cancel' | 'readAuthorized' | 'step' | 'rows'
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
  };
}
function record(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

/** Einrichtungssitzungen erhalten ausschließlich eine interne Anmeldeberechtigung. */
export class MarketplaceCloudSetup {
  private readonly options: SetupOptions;
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(options: SetupOptions) {
    this.options = options;
  }
  availability(workspaceId: string, accessToken: string): Promise<boolean> {
    return this.options.store.availability(workspaceId, accessToken);
  }
  async begin(
    request: CloudSetupRequest,
    _userId: string,
    accessToken: string,
  ): Promise<CloudSetupResult> {
    if (this.options.refreshInventory) {
      if (!(await this.options.store.availability(request.workspaceId, accessToken)))
        throw new Error('Cloud-Einrichtung ist nicht freigegeben');
      await this.options.refreshInventory();
    }
    return this.options.store.begin(request, accessToken);
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
  open(scope: BrowserSessionScope, setupId: string): Promise<string> {
    return this.exclusive(setupId, async () => {
      await this.options.profiles.prepareCloudSetup(scope, setupId);
      const setup = await this.read(scope, setupId);
      if (setup.sessionId) return setup.sessionId;
      return this.options.broker.open(await this.authorize(scope, setupId));
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
