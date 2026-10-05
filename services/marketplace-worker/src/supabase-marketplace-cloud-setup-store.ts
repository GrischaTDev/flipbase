import type {
  CloudSetupRequest,
  CloudSetupResult,
  CloudSetupView,
} from './marketplace-cloud-setup-contracts.d.ts';
import { parseCloudSetupView, parseCloudSetupResult } from './marketplace-cloud-setup-response.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import { chromiumAccountProfileIdPattern } from './chromium-account-profile-registry.ts';

interface StoreOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  runtime: { workerId: string; workerEpoch: number };
  fetch?: typeof fetch;
}
export interface PrivateCloudSetup {
  setup: CloudSetupView;
  networkId: string;
  profileId: string | null;
  previousProfileId: string | null;
  expiresAt: string;
  ipExpiresAt: string;
}
export type CloudSetupAction =
  | 'claim'
  | 'bind'
  | 'verify'
  | 'finalize'
  | 'complete'
  | 'release'
  | 'cleanup'
  | 'recover'
  | 'detach'
  | 'unmap';
function record(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
function invalid(): Error {
  return new Error('Cloud-Einrichtung konnte nicht bestätigt werden');
}

/** Öffentliche Benutzerprüfung und private Workerübergänge bleiben getrennte Anfragen. */
export class SupabaseMarketplaceCloudSetupStore {
  private readonly options: StoreOptions;
  private readonly request: typeof fetch;
  constructor(options: StoreOptions) {
    if (
      !options.publishableKey ||
      !options.serviceRoleKey ||
      !Number.isSafeInteger(options.runtime.workerEpoch) ||
      options.runtime.workerEpoch < 1
    )
      throw invalid();
    this.options = options;
    this.request = options.fetch ?? fetch;
  }
  async availability(workspaceId: string, token: string): Promise<boolean> {
    const result = await this.rpc('marketplace_can_manage', { p_workspace_id: workspaceId }, token);
    if (typeof result !== 'boolean') throw invalid();
    return result;
  }
  async begin(request: CloudSetupRequest, token: string): Promise<CloudSetupResult> {
    return parseCloudSetupResult(
      await this.rpc(
        'marketplace_cloud_setup_begin',
        {
          p_workspace_id: request.workspaceId,
          p_connection_id: 'connectionId' in request ? request.connectionId : null,
          p_request_id: request.requestId,
          p_display_name: 'displayName' in request ? request.displayName : null,
        },
        token,
      ),
      request,
    );
  }
  async read(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    return parseCloudSetupView(
      await this.rpc(
        'marketplace_cloud_setup_read',
        { p_workspace_id: scope.workspaceId, p_setup_id: setupId },
        scope.userAccessToken,
      ),
      { ...scope, setupId },
    );
  }
  async cancel(scope: BrowserSessionScope, setupId: string): Promise<CloudSetupView> {
    return parseCloudSetupView(
      await this.rpc(
        'marketplace_cloud_setup_cancel',
        { p_workspace_id: scope.workspaceId, p_setup_id: setupId },
        scope.userAccessToken,
      ),
      { ...scope, setupId },
    );
  }
  async readAuthorized(scope: BrowserSessionScope, setupId: string): Promise<PrivateCloudSetup> {
    await this.read(scope, setupId);
    return this.step(scope, setupId, 'claim');
  }
  async step(
    scope: Pick<BrowserSessionScope, 'workspaceId' | 'connectionId' | 'userId'>,
    setupId: string,
    action: CloudSetupAction,
    fields: { profileId?: string; externalAccountId?: string; username?: string } = {},
  ): Promise<PrivateCloudSetup> {
    const result = await this.rpc('marketplace_cloud_setup_update', {
      p_workspace_id: scope.workspaceId,
      p_setup_id: setupId,
      p_user_id: scope.userId,
      p_worker_id: this.options.runtime.workerId,
      p_worker_epoch: this.options.runtime.workerEpoch,
      p_action: action,
      p_profile_id: fields.profileId ?? null,
      p_external_account_id: fields.externalAccountId ?? null,
      p_username: fields.username ?? null,
    });
    if (
      !record(result) ||
      Object.keys(result).length !== 6 ||
      typeof result['networkId'] !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(result['networkId']) ||
      result['networkId'] === 'direct' ||
      (result['profileId'] !== null &&
        (typeof result['profileId'] !== 'string' ||
          !chromiumAccountProfileIdPattern.test(result['profileId']))) ||
      (result['previousProfileId'] !== null &&
        (typeof result['previousProfileId'] !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(result['previousProfileId']))) ||
      ['expiresAt', 'ipExpiresAt'].some(
        (name) => typeof result[name] !== 'string' || !Number.isFinite(Date.parse(result[name])),
      )
    )
      throw invalid();
    return {
      setup: parseCloudSetupView(result['setup'], { ...scope, setupId }),
      networkId: result['networkId'],
      profileId: result['profileId'] as string | null,
      previousProfileId: result['previousProfileId'] as string | null,
      expiresAt: result['expiresAt'] as string,
      ipExpiresAt: result['ipExpiresAt'] as string,
    };
  }
  async assertNetwork(
    scope: BrowserSessionScope,
  ): Promise<{ profileId: string; networkId: string } | null> {
    if (scope.cloudSetup) {
      const setup = await this.readAuthorized(scope, scope.cloudSetup.setupId);
      if (!setup.profileId || !['login', 'verified'].includes(setup.setup.state)) throw invalid();
      return { profileId: setup.profileId, networkId: setup.networkId };
    }
    const rows = await this.rows('marketplace_cloud_setups', {
      select:
        'provider_profile_id,state,marketplace_cloud_ips(network_id,enabled,country_code,is_dedicated_isp,verified_at,expires_at)',
      workspace_id: `eq.${scope.workspaceId}`,
      connection_id: `eq.${scope.connectionId}`,
      state: 'neq.cancelled',
    });
    if (!rows.length) {
      const valid = await this.rpc('marketplace_cloud_network_valid', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
      });
      if (valid !== true) throw invalid();
      return null;
    }
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !record(row) ||
      row['state'] !== 'completed' ||
      typeof row['provider_profile_id'] !== 'string' ||
      !chromiumAccountProfileIdPattern.test(row['provider_profile_id'])
    )
      throw invalid();
    const ip = row['marketplace_cloud_ips'];
    if (
      !record(ip) ||
      typeof ip['network_id'] !== 'string' ||
      ip['network_id'] === 'direct' ||
      ip['enabled'] !== true ||
      ip['country_code'] !== 'DE' ||
      ip['is_dedicated_isp'] !== true ||
      typeof ip['verified_at'] !== 'string' ||
      typeof ip['expires_at'] !== 'string' ||
      !(Date.parse(ip['expires_at']) > Date.now())
    )
      throw invalid();
    return { profileId: row['provider_profile_id'], networkId: ip['network_id'] };
  }
  async rows(table: string, filters: Record<string, string>): Promise<unknown[]> {
    const url = new URL(`/rest/v1/${table}`, this.options.url);
    for (const [name, filter] of Object.entries(filters)) url.searchParams.set(name, filter);
    const result = await this.response(
      await this.request(url, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }),
    );
    if (!Array.isArray(result)) throw invalid();
    return result;
  }
  private headers(token?: string): Record<string, string> {
    const key = token ? this.options.publishableKey : this.options.serviceRoleKey;
    return {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
    };
  }
  private async rpc(name: string, body: Record<string, unknown>, token?: string): Promise<unknown> {
    return this.response(
      await this.request(new URL(`/rest/v1/rpc/${name}`, this.options.url), {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
  private async response(response: Response): Promise<unknown> {
    if (!response.ok) throw invalid();
    try {
      return await response.json();
    } catch {
      throw invalid();
    }
  }
}
