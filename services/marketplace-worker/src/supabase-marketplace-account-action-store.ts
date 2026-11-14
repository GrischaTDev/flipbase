import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

export interface AccountActionTarget {
  accountId: string | null;
  externalId: string | null;
  entryId: string | null;
  entryKind: 'profile' | 'publication' | 'conversation' | 'sale' | null;
  body: Record<string, unknown> | null;
}
export interface AccountActionClaim {
  kind: 'account_action';
  actionId: string;
  actionKind: string;
  payload: Record<string, unknown>;
  target: AccountActionTarget;
  reconciliationContext?: Record<string, unknown> | null;
  scope: BrowserSessionScope;
}
export interface AccountActionStoreOptions {
  url: string;
  serviceRoleKey: string;
  publishableKey?: string;
  fetch?: typeof fetch;
}
export function actionRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültige Kontoaktion');
  return input as Record<string, unknown>;
}
export function actionUuid(input: unknown): string {
  if (typeof input !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input))
    throw new Error('Ungültige Auftragsbindung');
  return input;
}
export function actionBinding(scope: BrowserSessionScope) {
  const binding = scope.accountAction;
  if (!binding || scope.userAccessToken) throw new Error('Auftragsbindung fehlt');
  return {
    p_action_id: binding.actionId,
    p_claim_token: binding.claimToken,
    p_worker_id: binding.workerId,
    p_worker_epoch: binding.workerEpoch,
    p_runner_id: binding.runnerId,
  };
}
export function accountActionTarget(input: unknown): AccountActionTarget {
  const target = actionRecord(input);
  if (
    !(
      target.accountId === null ||
      (typeof target.accountId === 'string' && /^[1-9][0-9]{0,31}$/.test(target.accountId))
    ) ||
    !(
      target.externalId === null ||
      (typeof target.externalId === 'string' && /^[1-9][0-9]{0,31}$/.test(target.externalId))
    ) ||
    !(target.entryId === null || typeof target.entryId === 'string') ||
    ![null, 'profile', 'publication', 'conversation', 'sale'].includes(
      target.entryKind as string | null,
    )
  )
    throw new Error('Ungültiges Auftragsziel');
  return {
    accountId: target.accountId,
    externalId: target.externalId as string | null,
    entryId: target.entryId === null ? null : actionUuid(target.entryId),
    entryKind: target.entryKind as AccountActionTarget['entryKind'],
    body: target.body === null ? null : actionRecord(target.body),
  };
}
export function parseAccountActionClaim(
  input: unknown,
  workerId: string,
  workerEpoch: number,
  runnerId: string,
): AccountActionClaim {
  const value = actionRecord(input);
  if (
    value.workerId !== workerId ||
    value.workerEpoch !== workerEpoch ||
    value.runnerId !== runnerId ||
    typeof value.actionKind !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    typeof value.absoluteExpiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(value.absoluteExpiresAt)) ||
    Date.parse(value.expiresAt) > Date.parse(value.absoluteExpiresAt)
  )
    throw new Error('Ungültige Auftragsreservierung');
  const actionId = actionUuid(value.actionId);
  const target = accountActionTarget(value.target);
  if (!['cloud_setup_open', 'cloud_session_open'].includes(value.actionKind) && !target.accountId)
    throw new Error('Kontozuordnung fehlt');
  return {
    kind: 'account_action',
    actionId,
    actionKind: value.actionKind,
    payload: actionRecord(value.payload),
    target,
    reconciliationContext:
      value.reconciliationContext == null ? null : actionRecord(value.reconciliationContext),
    scope: {
      workspaceId: actionUuid(value.workspaceId),
      connectionId: actionUuid(value.connectionId),
      userId: actionUuid(value.userId),
      userAccessToken: '',
      accountAction: {
        actionId,
        claimToken: actionUuid(value.claimToken),
        workerId,
        workerEpoch,
        runnerId,
        sessionId: actionUuid(value.sessionId),
        expiresAt: value.expiresAt,
        absoluteExpiresAt: value.absoluteExpiresAt,
        ...(value.actionKind === 'cloud_setup_open'
          ? { setupId: actionUuid(actionRecord(value.payload).setupId) }
          : {}),
        ...(value.actionKind === 'cloud_session_open'
          ? { dialogId: actionUuid(actionRecord(value.payload).dialogId) }
          : {}),
      },
    },
  };
}
export class SupabaseMarketplaceAccountActionStore {
  private readonly request: typeof fetch;
  private readonly options: AccountActionStoreOptions;
  constructor(options: AccountActionStoreOptions) {
    this.options = options;
    if (!options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.request = options.fetch ?? fetch;
  }
  async rpc(name: string, body: Record<string, unknown>, userToken?: string): Promise<unknown> {
    const key = userToken ? this.options.publishableKey : this.options.serviceRoleKey;
    if (!key) throw new Error('Kontozugang fehlt');
    const response = await this.request(new URL('/rest/v1/rpc/' + name, this.options.url), {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + (userToken ?? key),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      if (failure && typeof failure === 'object') {
        if ('details' in failure && failure.details === 'account_action_queue_full')
          throw new AccountActionRequestError(
            429,
            'account_action_queue_full',
            'Für dieses Konto warten bereits 50 Aktionen. Warte, bis eine ausgeführt oder abgebrochen wurde.',
          );
        if ('code' in failure && failure.code === '23505')
          throw new AccountActionRequestError(
            409,
            'request_id_conflict',
            'Diese Anfragekennung wurde bereits für eine andere Aktion verwendet.',
          );
        if ('code' in failure && failure.code === '42501')
          throw new AccountActionRequestError(
            403,
            'account_action_forbidden',
            'Du darfst diese Kontoaktion nicht ausführen.',
          );
        if ('code' in failure && failure.code === '22023')
          throw new AccountActionRequestError(
            400,
            'account_action_invalid',
            'Prüfe die Angaben für diese Aktion.',
          );
      }
      throw new Error('Kontoauftrag konnte nicht bestätigt werden');
    }
    return response.json();
  }
  async check(
    scope: BrowserSessionScope,
    renew = true,
  ): Promise<{ expiresAt: number; target: AccountActionTarget } | null> {
    const value = actionRecord(
      await this.rpc('marketplace_account_action_check', {
        ...actionBinding(scope),
        p_renew: renew,
      }),
    );
    if (value.active === false) return null;
    const binding = scope.accountAction!;
    if (
      value.active !== true ||
      value.sessionId !== binding.sessionId ||
      value.absoluteExpiresAt !== binding.absoluteExpiresAt ||
      typeof value.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= Date.now() ||
      Date.parse(value.expiresAt) > Date.parse(binding.absoluteExpiresAt)
    )
      throw new Error('Auftragsberechtigung ungültig');
    return { expiresAt: Date.parse(value.expiresAt), target: accountActionTarget(value.target) };
  }
  enqueue(
    scope: BrowserSessionScope,
    requestId: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    return this.rpc(
      'marketplace_account_action_enqueue',
      {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_request_id: actionUuid(requestId),
        p_kind: kind,
        p_payload: payload,
      },
      scope.userAccessToken,
    );
  }
  read(scope: BrowserSessionScope, id: string): Promise<unknown> {
    return this.rpc(
      'marketplace_account_action_read',
      {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_action_id: actionUuid(id),
      },
      scope.userAccessToken,
    );
  }
  async begin(scope: BrowserSessionScope): Promise<void> {
    if ((await this.rpc('marketplace_account_action_begin_write', actionBinding(scope))) !== true)
      throw new Error('Schreibbeginn nicht bestätigt');
  }
  async finish(
    scope: BrowserSessionScope,
    state: 'succeeded' | 'failed' | 'outcome_unknown',
    result: unknown,
    errorCode: string | null = null,
  ): Promise<void> {
    if (
      (await this.rpc('marketplace_account_action_finish', {
        ...actionBinding(scope),
        p_state: state,
        p_result: result,
        p_error_code: errorCode,
      })) !== true
    )
      throw new Error('Auftragsabschluss nicht bestätigt');
  }
}

export class AccountActionRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
