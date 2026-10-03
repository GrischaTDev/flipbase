import type { AccountScope } from './marketplace-contracts';
import type { LocalExtensionApproval } from './marketplace-local-extension-contracts';

export interface LocalExtensionPreparedIdentity {
  readonly tokenHash: string;
  readonly identity: { readonly id: string; readonly username: string };
}
export interface LocalExtensionSyncResult extends LocalExtensionApproval {
  readonly counts: { readonly profile: number; readonly publication: number };
  readonly observedAt: string;
  readonly publicationsComplete: boolean;
}
function object(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}
export function parseLocalExtensionPreparedIdentity(
  input: unknown,
): LocalExtensionPreparedIdentity | null {
  const prepared = object(input);
  const identity = object(prepared?.['identity']);
  if (
    !prepared ||
    !identity ||
    typeof prepared['tokenHash'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(prepared['tokenHash']) ||
    typeof identity['id'] !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(identity['id']) ||
    typeof identity['username'] !== 'string' ||
    !identity['username'].trim() ||
    identity['username'].length > 120 ||
    /\p{Cc}/u.test(identity['username'])
  )
    return null;
  return {
    tokenHash: prepared['tokenHash'],
    identity: { id: identity['id'], username: identity['username'] },
  };
}
export function parseLocalExtensionSyncResult(
  input: unknown,
  scope: AccountScope,
  externalAccountId: string,
): LocalExtensionSyncResult | null {
  const result = object(input);
  const counts = object(result?.['counts']);
  if (
    !result ||
    !counts ||
    result['workspaceId'] !== scope.workspaceId ||
    result['connectionId'] !== scope.connectionId ||
    result['externalAccountId'] !== externalAccountId ||
    typeof result['expiresAt'] !== 'string' ||
    !Number.isFinite(Date.parse(result['expiresAt'])) ||
    counts['profile'] !== 1 ||
    typeof counts['publication'] !== 'number' ||
    !Number.isSafeInteger(counts['publication']) ||
    counts['publication'] < 0 ||
    counts['publication'] > 500 ||
    typeof result['observedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(result['observedAt'])) ||
    typeof result['publicationsComplete'] !== 'boolean'
  )
    return null;
  return {
    ...scope,
    externalAccountId,
    expiresAt: result['expiresAt'],
    counts: { profile: 1, publication: counts['publication'] },
    observedAt: result['observedAt'],
    publicationsComplete: result['publicationsComplete'],
  };
}
