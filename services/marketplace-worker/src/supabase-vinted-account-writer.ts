import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedAccountIdentity } from './vinted-browser-reader.ts';

interface AccountWriterOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export class SupabaseVintedAccountWriter {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: AccountWriterOptions) {
    if (!options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async confirm(
    scope: BrowserSessionScope,
    sessionId: string,
    identity: VintedAccountIdentity,
  ): Promise<void> {
    const response = await this.request(
      new URL('/rest/v1/rpc/marketplace_browser_confirm_account', this.baseUrl),
      {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_session_id: sessionId,
          p_user_id: scope.userId,
          p_external_account_id: identity.id,
          p_username: identity.username,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('Kontobestätigung nicht verfügbar');
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('workspaceId' in value) ||
      value.workspaceId !== scope.workspaceId ||
      !('connectionId' in value) ||
      value.connectionId !== scope.connectionId ||
      !('externalAccountId' in value) ||
      value.externalAccountId !== identity.id
    )
      throw new Error('Kontobestätigung nicht verfügbar');
  }
}
