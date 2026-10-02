import { EbayError, refreshTokens } from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import type { AccountScope } from '../_shared/marketplace-contracts.ts';
import { decryptTokens, encryptTokens } from '../_shared/ebay-token-encryption.ts';
import type { EbayAccountStore, StoredEbayConnection } from './handler.ts';

export class EbayConnectionError extends Error {
  constructor(
    readonly code:
      'unauthorized' | 'forbidden' | 'connection_busy_or_unavailable' | 'connection_changed',
  ) {
    super(code);
  }
}
export interface EbayConnectionReadContext {
  readonly connection: StoredEbayConnection;
  readonly accessToken: string;
  readonly operationId: string;
}
export async function withEbayConnection<T>(
  scope: AccountScope,
  bearer: string,
  store: EbayAccountStore,
  config: EbayConfig,
  action: (context: EbayConnectionReadContext) => Promise<T>,
  fetcher = fetch,
): Promise<T> {
  const userId = bearer.startsWith('Bearer ') ? await store.authenticate(bearer) : null;
  if (!userId) throw new EbayConnectionError('unauthorized');
  if (!(await store.canConnect(bearer, scope.workspaceId)))
    throw new EbayConnectionError('forbidden');
  const operationId = crypto.randomUUID();
  const claimed = await store.claim(userId, scope.workspaceId, scope.connectionId, operationId);
  if (!claimed) throw new EbayConnectionError('connection_busy_or_unavailable');
  const connection = claimed.connection;
  let encrypted: string | null = null;
  let needsLogin = false;
  let observed = false;
  let result: T | undefined;
  let failure: unknown;
  try {
    if (
      connection.id !== scope.connectionId ||
      connection.workspace_id !== scope.workspaceId ||
      connection.user_id !== userId ||
      connection.environment !== config.environment ||
      connection.status !== 'connected'
    )
      throw new EbayConnectionError('connection_changed');
    if (!claimed.encryptedTokens) throw new EbayError('needs_login');
    const previous = await decryptTokens(
      claimed.encryptedTokens,
      config.encryptionKey,
      connection.id,
    );
    let tokens = await refreshTokens(config, previous, fetcher);
    encrypted = await encryptTokens(tokens, config.encryptionKey, connection.id);
    const read = () => action({ connection, accessToken: tokens.accessToken, operationId });
    try {
      result = await read();
    } catch (error) {
      if (!(error instanceof EbayError) || error.code !== 'needs_login') throw error;
      tokens = await refreshTokens(config, { ...tokens, expiresAt: 0 }, fetcher);
      encrypted = await encryptTokens(tokens, config.encryptionKey, connection.id);
      result = await read();
    }
    observed = true;
  } catch (error) {
    needsLogin = error instanceof EbayError && error.code === 'needs_login';
    failure = error;
  }
  const valid = await store.finish(connection, operationId, encrypted, needsLogin, observed);
  if (!valid) throw new EbayConnectionError('connection_changed');
  if (failure) throw failure;
  return result as T;
}
