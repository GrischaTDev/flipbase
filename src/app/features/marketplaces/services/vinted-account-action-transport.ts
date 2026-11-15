import type { AccountScope } from '../models/marketplace.models';
import {
  parseVintedAccountAction,
  type VintedAccountAction,
  type VintedAccountActionKind,
} from '../models/vinted-account-action';

const routes = new Map<string, VintedAccountActionKind>([
  ['listings/price/save', 'price_save'],
  ['listings/delete', 'listing_delete'],
  ['listings/edit/read', 'listing_edit_read'],
  ['listings/content/read', 'listing_content_read'],
  ['listings/category/read', 'listing_category_read'],
  ['conversations/read', 'conversations_read'],
  ['shipping-labels/request', 'shipping_label_request'],
  ['profile/details/read', 'profile_details_read'],
  ['profile/cities/read', 'profile_cities_read'],
  ['profile/details/save', 'profile_details_save'],
  ['profile/edit/read', 'profile_edit_read'],
  ['profile/edit/save', 'profile_edit_save'],
  ['listings/edit/save', 'listing_edit_save'],
  ['listings/content/save', 'listing_content_save'],
  ['listings/edit/intent', 'listing_edit_intent'],
  ['sessions', 'cloud_session_open'],
]);
export function vintedAccountActionKind(path: string): VintedAccountActionKind | undefined {
  return routes.get(path.replace(/^\/marketplace-browser\//, ''));
}
export class VintedAccountActionRejectedError extends Error {}
const completedNotifications = new Set<string>();
export function claimVintedAccountActionNotification(id: string): boolean {
  if (completedNotifications.has(id)) return false;
  completedNotifications.add(id);
  return true;
}
export function releaseVintedAccountActionRequest(
  action: VintedAccountAction,
  userId: string,
): void {
  if (!['succeeded', 'failed', 'cancelled'].includes(action.state)) return;
  const prefix = `flipbase_account_action:${userId}:${action.workspaceId}:${action.connectionId}:${action.kind}:`;
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && localStorage.getItem(key) === action.requestId)
        localStorage.removeItem(key);
    }
  } catch {
    /* Der gespeicherte Serverbeleg bleibt maßgeblich. */
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültige Aktionsantwort.');
  return value as Record<string, unknown>;
}
function subject(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(
      atob(token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')),
    );
    const id = record(payload)['sub'];
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}
async function requestIdentifier(
  kind: VintedAccountActionKind,
  body: Record<string, unknown>,
  token: string,
) {
  if (kind === 'cloud_session_open' && typeof body['dialogId'] === 'string')
    return { id: body['dialogId'], clear: () => undefined };
  const userId = subject(token);
  if (!userId) return { id: crypto.randomUUID(), clear: () => undefined };
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const digest = [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const key = `flipbase_account_action:${userId}:${String(body['workspaceId'])}:${String(body['connectionId'])}:${kind}:${digest}`;
  let id: string;
  try {
    const stored = localStorage.getItem(key);
    id =
      stored && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stored)
        ? stored
        : crypto.randomUUID();
    localStorage.setItem(key, id);
  } catch {
    throw new VintedAccountActionRejectedError(
      'Dein Browser kann die Anfragekennung nicht sichern. Erlaube den Browserspeicher und versuche es erneut.',
    );
  }
  return {
    id,
    clear: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Der Serverbeleg bleibt maßgeblich. */
      }
    },
  };
}
function post(path: string, body: unknown, token: string): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
}
async function admitted(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const code = body && typeof body === 'object' && 'code' in body ? body.code : null;
  if (code === 'account_action_queue_full')
    throw new VintedAccountActionRejectedError(
      'Für dieses Konto warten bereits 50 Aktionen. Warte, bis ein Platz frei wird, oder brich einen wartenden Auftrag ab. Diese Aktion wurde nicht angenommen.',
    );
  if (code === 'request_id_conflict')
    throw new VintedAccountActionRejectedError(
      'Diese Anfragekennung gehört zu anderen Angaben. Lade den Aktionsstatus neu.',
    );
  return response;
}

/** Die HTTP-Annahme bleibt kurz; nur der beobachtende Client wartet auf das gespeicherte Ergebnis. */
export async function runVintedAccountAction(
  path: string,
  request: unknown,
  token: string,
  changed?: (action: VintedAccountAction) => void,
): Promise<Response> {
  const kind = vintedAccountActionKind(path);
  const body = record(request);
  if (!kind || typeof body['workspaceId'] !== 'string' || typeof body['connectionId'] !== 'string')
    throw new Error('Die Aktion kann keinem Konto zugeordnet werden.');
  const scope: AccountScope = {
    workspaceId: body['workspaceId'],
    connectionId: body['connectionId'],
  };
  let health: Response;
  try {
    health = await fetch('/marketplace-browser/healthz', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new VintedAccountActionRejectedError(
      'Der Browserdienst ist nicht erreichbar. Es wurde kein Auftrag angenommen.',
      { cause: error },
    );
  }
  const capabilities: unknown = await health.json().catch(() => null);
  if (
    !health.ok ||
    !capabilities ||
    typeof capabilities !== 'object' ||
    !('ok' in capabilities) ||
    capabilities.ok !== true ||
    !('accountActionsEnabled' in capabilities) ||
    capabilities.accountActionsEnabled !== true
  )
    throw new VintedAccountActionRejectedError(
      'Der Browserdienst unterstützt gespeicherte Aktionen noch nicht. Versuche es nach der Aktualisierung erneut.',
    );
  const identifier = await requestIdentifier(kind, body, token);
  const response = await admitted(await post(path, { ...body, requestId: identifier.id }, token));
  if (response.status !== 202) {
    if (response.ok)
      throw new VintedAccountActionRejectedError(
        'Der Browserdienst hat keinen gespeicherten Auftrag bestätigt. Prüfe die laufenden Aktionen, bevor Du erneut speicherst.',
      );
    if (response.status >= 400 && response.status < 500) identifier.clear();
    return response;
  }
  let action = parseVintedAccountAction(record(await response.json())['action'], scope);
  if (action.requestId !== identifier.id || action.kind !== kind)
    throw new Error('Die angenommene Aktion passt nicht zur Anfrage.');
  changed?.(action);
  window.dispatchEvent(new Event('flipbase-account-actions-changed'));
  window.dispatchEvent(new CustomEvent('flipbase-account-action-accepted', { detail: action }));
  while (action.state === 'queued' || action.state === 'running') {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    const status = await post(
      '/marketplace-browser/actions/status',
      { ...scope, actionId: action.id },
      token,
    );
    if (!status.ok)
      throw new Error(
        'Der Aktionsstatus konnte nicht geladen werden. Prüfe die laufenden Aktionen.',
      );
    const updated = parseVintedAccountAction(record(await status.json())['action'], scope);
    if (updated.id !== action.id || updated.kind !== kind || updated.requestId !== action.requestId)
      throw new Error('Der Aktionsstatus passt nicht zur Anfrage.');
    if (updated.version >= action.version) {
      action = updated;
      changed?.(action);
    }
  }
  if (action.state !== 'outcome_unknown') identifier.clear();
  window.dispatchEvent(new Event('flipbase-account-actions-changed'));
  return actionResponse(action);
}

function actionResponse(action: VintedAccountAction): Response {
  if (action.resultExpired)
    throw new VintedAccountActionRejectedError(
      'Das Ergebnis ist nicht mehr verfügbar. Die gespeicherte Aktion wird nicht erneut ausgeführt.',
    );
  if (action.state === 'cancelled')
    throw new VintedAccountActionRejectedError('Der wartende Auftrag wurde abgebrochen.');
  const conflict =
    action.result &&
    typeof action.result === 'object' &&
    'status' in action.result &&
    action.result.status === 'conflict';
  const shippingFailure =
    action.kind === 'shipping_label_request' &&
    action.state === 'failed' &&
    action.result &&
    typeof action.result === 'object' &&
    'outcome' in action.result &&
    action.result.outcome === 'failed' &&
    'requested' in action.result &&
    typeof action.result.requested === 'boolean' &&
    'errorCode' in action.result &&
    typeof action.result.errorCode === 'string';
  if (action.result !== null)
    return Response.json(action.result, {
      status:
        action.state === 'outcome_unknown'
          ? 502
          : action.state === 'succeeded' || conflict || shippingFailure
            ? 200
            : 409,
    });
  return Response.json(
    { code: action.errorCode },
    { status: action.state === 'succeeded' ? 200 : action.state === 'outcome_unknown' ? 502 : 409 },
  );
}
