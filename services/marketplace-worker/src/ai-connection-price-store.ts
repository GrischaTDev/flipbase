import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

export interface AiPriceScope {
  readonly grantId: string;
  readonly authSessionId: string;
  readonly requestId: string;
  readonly attemptId?: string;
}
export interface AiPriceRequest {
  readonly scope: BrowserSessionScope;
  readonly entryId: string;
  readonly expectedPriceCents: number;
  readonly priceCents: number;
  readonly previousOutcomeUnknown?: boolean;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const identifier = (v: unknown): v is string => typeof v === 'string' && uuid.test(v);

export class AiConnectionPriceStore {
  private readonly request: typeof fetch;
  private readonly options: {
    url: string;
    publishableKey: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
  };
  constructor(options: {
    url: string;
    publishableKey: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
  }) {
    this.options = options;
    this.request = options.fetch ?? fetch;
  }

  private async rpc(
    name: string,
    input: Record<string, unknown>,
    bearer: string,
    key: string,
  ): Promise<unknown> {
    const response = await this.request(new URL(`/rest/v1/rpc/${name}`, this.options.url), {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('KI-Preisfreigabe nicht verfügbar');
    return response.json();
  }

  async begin(
    token: string,
    requestId: string,
  ): Promise<AiPriceRequest | { completed: Record<string, unknown> } | { busy: true }> {
    if (!identifier(requestId)) throw new Error('Ungültige Vorgangskennung');
    const ctx = await this.rpc('ai_connection_context', {}, token, this.options.publishableKey);
    if (
      !record(ctx) ||
      !identifier(ctx['id']) ||
      !identifier(ctx['session_id']) ||
      ctx['access_mode'] !== 'edit'
    )
      throw new Error('Ungültige KI-Freigabe');
    const proof: AiPriceScope = { grantId: ctx['id'], authSessionId: ctx['session_id'], requestId };
    const value = await this.call(proof, 'begin');
    if (!record(value)) throw new Error('Ungültiger Preisauftrag');
    if (record(value['completed'])) return { completed: value['completed'] };
    if (value['busy'] === true) return { busy: true };
    if (
      !identifier(value['workspaceId']) ||
      !identifier(value['connectionId']) ||
      !identifier(value['userId']) ||
      !identifier(value['entryId']) ||
      !identifier(value['attemptId']) ||
      !Number.isSafeInteger(value['expectedPriceCents']) ||
      !Number.isSafeInteger(value['priceCents']) ||
      Number(value['expectedPriceCents']) <= 0 ||
      Number(value['priceCents']) <= 0
    )
      throw new Error('Ungültiger Preisauftrag');
    return {
      scope: {
        workspaceId: value['workspaceId'],
        connectionId: value['connectionId'],
        userId: value['userId'],
        userAccessToken: '',
        aiPrice: { ...proof, attemptId: value['attemptId'] },
      },
      entryId: value['entryId'],
      expectedPriceCents: Number(value['expectedPriceCents']),
      priceCents: Number(value['priceCents']),
      previousOutcomeUnknown: value['previousOutcomeUnknown'] === true,
    };
  }

  call(
    proof: AiPriceScope,
    operation: string,
    browserSessionId: string | null = null,
    result: Record<string, unknown> | null = null,
  ): Promise<unknown> {
    return this.rpc(
      'ai_connection_price_worker',
      {
        p_grant_id: proof.grantId,
        p_auth_session_id: proof.authSessionId,
        p_request_id: proof.requestId,
        p_operation: operation,
        p_browser_session_id: browserSessionId,
        p_result: result,
        p_attempt_id: proof.attemptId ?? null,
      },
      this.options.serviceRoleKey,
      this.options.serviceRoleKey,
    );
  }

  async entry(scope: BrowserSessionScope): Promise<{ externalId: string; accountId: string }> {
    if (!scope.aiPrice) throw new Error('KI-Preisfreigabe fehlt');
    const value = await this.call(scope.aiPrice, 'entry');
    if (
      !record(value) ||
      typeof value['externalId'] !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(value['externalId']) ||
      typeof value['accountId'] !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(value['accountId'])
    )
      throw new Error('Kontozuordnung geändert');
    return { externalId: value['externalId'], accountId: value['accountId'] };
  }
}
