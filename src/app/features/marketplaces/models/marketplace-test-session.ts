import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export type MarketplaceTestSessionState = 'active' | 'expired' | 'revoked' | 'interrupted';

export interface MarketplaceTestSession extends AccountScope {
  readonly id: string;
  readonly state: MarketplaceTestSessionState;
  readonly expiresAt: string;
  readonly interactionCount: number;
  readonly accepted?: boolean;
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states: readonly MarketplaceTestSessionState[] = [
  'active',
  'expired',
  'revoked',
  'interrupted',
];
const allowedFields = new Set([
  'id',
  'workspaceId',
  'connectionId',
  'state',
  'expiresAt',
  'interactionCount',
  'accepted',
]);

export function parseMarketplaceTestSession(
  value: unknown,
  scope: AccountScope,
  sessionId?: string,
): MarketplaceTestSession {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MarketplaceResponseError();
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => !allowedFields.has(key)) ||
    data['workspaceId'] !== scope.workspaceId ||
    data['connectionId'] !== scope.connectionId ||
    typeof data['id'] !== 'string' ||
    !sessionIdPattern.test(data['id']) ||
    (sessionId !== undefined && data['id'] !== sessionId) ||
    !states.includes(data['state'] as MarketplaceTestSessionState) ||
    typeof data['expiresAt'] !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(data['expiresAt']) ||
    !Number.isFinite(Date.parse(data['expiresAt'])) ||
    typeof data['interactionCount'] !== 'number' ||
    !Number.isSafeInteger(data['interactionCount']) ||
    data['interactionCount'] < 0 ||
    (data['accepted'] !== undefined && typeof data['accepted'] !== 'boolean')
  )
    throw new MarketplaceResponseError();
  return Object.freeze({
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    id: data['id'],
    state: data['state'] as MarketplaceTestSessionState,
    expiresAt: data['expiresAt'],
    interactionCount: data['interactionCount'],
    ...(data['accepted'] === undefined ? {} : { accepted: data['accepted'] as boolean }),
  });
}
