import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ChromiumAccountProfileRegistry,
  chromiumAccountProfileIdPattern,
} from './chromium-account-profile-registry.ts';
import { GoLoginCloudBrowser } from './gologin-cloud-browser.ts';
import { MarketplaceSyncDispatcher } from './marketplace-sync-dispatcher.ts';
import { SupabaseMarketplaceSyncDispatchStore } from './supabase-marketplace-sync-dispatch-store.ts';
import { marketplaceBrowserServerConfig } from './marketplace-browser-server-config.ts';
import { ChromiumNetworkProfiles } from './chromium-network-profiles.ts';

type MaintenanceMode = 'pilot' | 'migrate' | 'rollback';
interface MaintenanceOptions {
  url: string;
  serviceRoleKey: string;
  registry: ChromiumAccountProfileRegistry;
  heartbeat(): Promise<boolean>;
  stopProfile(profileId: string): Promise<void>;
  fetch?: typeof fetch;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

/** Ausschließlich bei gestopptem Worker; jede Mutation gehört zur exklusiven Wartungsruntime. */
export class ChromiumProfileMaintenance {
  private readonly options: MaintenanceOptions;
  private readonly request: typeof fetch;
  constructor(options: MaintenanceOptions) {
    this.options = options;
    this.request = options.fetch ?? fetch;
  }

  async run(
    mode: MaintenanceMode,
    workspaceId: string,
    connectionId: string,
    expectedProfileId?: string,
  ): Promise<string> {
    if (
      !['pilot', 'migrate', 'rollback'].includes(mode) ||
      !identifier(workspaceId) ||
      !identifier(connectionId) ||
      (expectedProfileId !== undefined && !identifier(expectedProfileId))
    )
      throw new Error('Ungültige Wartungsparameter');
    await this.assertIdle();
    const filter = {
      workspace_id: `eq.${workspaceId}`,
      connection_id: `eq.${connectionId}`,
      select: 'provider_profile_id',
    };
    const current = await this.mapping(filter);
    if (mode === 'pilot' ? current !== null : !expectedProfileId || current !== expectedProfileId)
      throw new Error('Profilzuordnung entspricht nicht dem erwarteten Ausgangsstand');
    const connections = await this.rows('marketplace_connections', {
      workspace_id: `eq.${workspaceId}`,
      id: `eq.${connectionId}`,
      marketplace: 'eq.vinted',
      select: 'id,status',
    });
    const connection = connections[0];
    if (
      connections.length !== 1 ||
      !record(connection) ||
      connection['id'] !== connectionId ||
      typeof connection['status'] !== 'string' ||
      !['paused', 'needs_login', 'disconnected'].includes(connection['status'])
    )
      throw new Error(
        'Verbindung zuerst pausieren; gesperrte oder laufende Konten nicht migrieren',
      );
    let target: string;
    if (mode === 'rollback') {
      if (!current || !chromiumAccountProfileIdPattern.test(current))
        throw new Error('Chromiumprofil für Rückweg fehlt');
      const profile = await this.options.registry.resolve(current);
      if (
        profile.workspaceId !== workspaceId ||
        profile.connectionId !== connectionId ||
        !profile.previousGoLoginProfileId
      )
        throw new Error('Gespeicherter GoLogin-Rückweg fehlt');
      target = profile.previousGoLoginProfileId;
    } else {
      if (current?.toLowerCase().startsWith('chromium_'))
        throw new Error('Konto ist bereits Chromium zugeordnet');
      const remembered = await this.options.registry.find(workspaceId, connectionId);
      if (remembered && remembered.previousGoLoginProfileId !== (current ?? undefined))
        throw new Error('Private Profilzuordnung entspricht nicht dem Ausgangsstand');
      target = (
        remembered ??
        (await this.options.registry.create({
          workspaceId,
          connectionId,
          ...(current ? { previousGoLoginProfileId: current } : {}),
        }))
      ).profileId;
    }
    await this.assertIdle();
    if (current) await this.options.stopProfile(current);
    await this.assertIdle();
    // Die erwartete Vintedidentität bleibt erhalten; ein neuer Browser muss sie erneut bestätigen.
    const accountFilters = {
      workspace_id: `eq.${workspaceId}`,
      id: `eq.${connectionId}`,
      status: `eq.${connection['status']}`,
      select: 'id',
    };
    const updated = await this.rows('marketplace_connections', accountFilters, 'PATCH', {
      status: 'needs_login',
      resume_status: null,
      updated_at: new Date().toISOString(),
    });
    if (updated.length !== 1 || !record(updated[0]) || updated[0]['id'] !== connectionId)
      throw new Error('Kontostatus konnte nicht bestätigt werden');
    await this.assertIdle();
    try {
      if (current)
        await this.rows(
          'marketplace_browser_profiles',
          { ...filter, provider_profile_id: `eq.${current}` },
          'PATCH',
          { provider_profile_id: target },
        );
      else
        await this.rows('marketplace_browser_profiles', { select: 'provider_profile_id' }, 'POST', {
          workspace_id: workspaceId,
          connection_id: connectionId,
          provider_profile_id: target,
        });
    } catch {
      // Nach einem verlorenen ACK zählt ausschließlich der nachgelesene Datenbankstand.
      if ((await this.mapping(filter)) !== target)
        throw new Error('Browserumstellung muss geprüft werden');
    }
    if ((await this.mapping(filter)) !== target)
      throw new Error('Browserumstellung wurde nicht bestätigt');
    return target;
  }

  private async assertIdle(): Promise<void> {
    if (!(await this.options.heartbeat())) throw new Error('Wartungsberechtigung verloren');
    const sessions = await this.rows('marketplace_browser_sessions', {
      select: 'id',
      state: 'in.(active,stopping)',
      limit: '1',
    });
    const operations = await this.rows('marketplace_operations', {
      select: 'id',
      state: 'in.(queued,running)',
      limit: '1',
    });
    if (sessions.length || operations.length)
      throw new Error('Offene Browser oder Aufträge zuerst abschließen');
  }

  private async mapping(filters: Record<string, string>): Promise<string | null> {
    const profiles = await this.rows('marketplace_browser_profiles', filters);
    if (!profiles.length) return null;
    const profile = profiles[0];
    if (
      profiles.length !== 1 ||
      !record(profile) ||
      typeof profile['provider_profile_id'] !== 'string' ||
      !identifier(profile['provider_profile_id'])
    )
      throw new Error('Ungültige Browserprofilzuordnung');
    return profile['provider_profile_id'];
  }

  private async rows(
    table: string,
    filters: Record<string, string>,
    method = 'GET',
    body?: Record<string, unknown>,
  ): Promise<unknown[]> {
    const url = new URL(`/rest/v1/${table}`, this.options.url);
    for (const [name, filter] of Object.entries(filters)) url.searchParams.set(name, filter);
    const response = await this.request(url, {
      method,
      headers: {
        apikey: this.options.serviceRoleKey,
        Authorization: `Bearer ${this.options.serviceRoleKey}`,
        Prefer: 'return=representation',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Wartungsdatenbank nicht erreichbar');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Ungültige Wartungsantwort');
    return rows;
  }
}

async function main(): Promise<void> {
  const environment = process.env;
  if (
    environment['MARKETPLACE_SCHEDULED_SYNC_ENABLED'] !== '0' ||
    environment['MARKETPLACE_BROWSER_PROVIDER'] !== 'chromium'
  )
    throw new Error('Wartung benötigt Chromium mit pausierter Automatik');
  const config = marketplaceBrowserServerConfig(environment);
  const url = config.supabaseUrl;
  const serviceRoleKey = config.serviceRoleKey;
  const root = config.serverProfileRoot;
  const hostId = config.chromiumHostId;
  const image = config.chromiumImage;
  const hostProfileRoot = config.chromiumHostProfileRoot;
  if (!url || !serviceRoleKey || !root || !hostId || !image || !hostProfileRoot)
    throw new Error('Private Chromiumwartung ist unvollständig konfiguriert');
  const [mode, workspaceId, connectionId, expectedProfileId] = process.argv.slice(2);
  if (
    (mode !== 'pilot' && mode !== 'migrate' && mode !== 'rollback') ||
    !workspaceId ||
    !connectionId ||
    process.argv.length > 6
  )
    throw new Error(
      'pilot|migrate|rollback WORKSPACE_ID CONNECTION_ID [EXPECTED_PROFILE_ID] angeben',
    );
  const registry = new ChromiumAccountProfileRegistry({
    root,
    hostId,
    networkId: environment['MARKETPLACE_CHROMIUM_NETWORK_ID'] ?? 'direct',
  });
  const { ChromiumContainerLauncher } = await import('./chromium-container-launcher.ts');
  const { ChromiumProfileStore } = await import('./chromium-profile-store.ts');
  const launcher = new ChromiumContainerLauncher({
    image,
    profileRoot: join(root, 'profiles'),
    hostProfileRoot,
    hostId,
    network: config.chromiumNetwork ?? '',
    seccompProfile: config.chromiumSeccompProfile,
  });
  const profiles = new ChromiumProfileStore({
    root: join(root, 'profiles'),
    inspectProfileProcesses: (directory) => launcher.inspectProfileProcesses(directory),
  });
  const cloud = config.goLoginToken
    ? new GoLoginCloudBrowser({ token: config.goLoginToken })
    : undefined;
  const dispatcher = new MarketplaceSyncDispatcher({
    store: new SupabaseMarketplaceSyncDispatchStore({ url, serviceRoleKey }),
    run: async () => {
      throw new Error('Wartungsmodus');
    },
    onRuntimeLost: () => {
      process.exitCode = 1;
    },
  });
  await dispatcher.initialize();
  dispatcher.startMonitoring();
  try {
    const maintenance = new ChromiumProfileMaintenance({
      url,
      serviceRoleKey,
      registry,
      heartbeat: () => dispatcher.heartbeat(),
      stopProfile: async (profileId) => {
        if (profileId.toLowerCase().startsWith('chromium_')) {
          await registry.resolve(profileId);
          await launcher.recover(profileId);
          await profiles.recoverStopped(profileId);
        } else {
          if (!cloud) throw new Error('GoLogin-Rückweg fehlt');
          await cloud.stop(profileId);
        }
      },
    });
    // Der Rückweg benötigt keine neue Proxydefinition und bleibt bei defekter Netzwerkdatei nutzbar.
    if (mode !== 'rollback') {
      const networks = await ChromiumNetworkProfiles.load(config.chromiumNetworkFile);
      networks.resolve(config.chromiumNetworkId ?? 'direct');
    }
    await maintenance.run(mode, workspaceId, connectionId, expectedProfileId);
    process.stdout.write('Browserzuordnung bestätigt. Konto benötigt erneute Anmeldung.\n');
  } finally {
    await dispatcher.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(() => {
    process.stderr.write(
      'Browserwartung abgebrochen. Pausenstatus, offene Aufträge, Runtime und private Profilzuordnung prüfen.\n',
    );
    process.exitCode = 1;
  });
}
