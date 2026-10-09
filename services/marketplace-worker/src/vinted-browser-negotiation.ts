import type { Page } from 'playwright';
import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationOffer,
  MarketplaceNegotiationResult,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';
import {
  executeVintedNegotiation,
  type ConfirmedNegotiationOffer,
} from './vinted-negotiation-contracts.ts';
export {
  executeVintedNegotiation,
  type NegotiationProviderAdapter,
} from './vinted-negotiation-contracts.ts';
import { readVintedCsrfToken, sendVintedMessage } from './vinted-browser-messages.ts';
class NegotiationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export async function sendVintedNegotiation(
  page: Page,
  accountId: string,
  command: MarketplaceNegotiationCommand,
  sourceOffer: MarketplaceNegotiationOffer | null,
  confirmedOffer: ConfirmedNegotiationOffer | null,
  authorize: () => Promise<void>,
): Promise<MarketplaceNegotiationResult> {
  async function request(
    path: string,
    method: 'GET' | 'PUT' | 'POST',
    body?: Record<string, unknown>,
  ) {
    await authorize();
    if (new URL(page.url()).origin !== 'https://www.vinted.de')
      throw new NegotiationError('login_required');
    const token = method === 'GET' ? null : await readVintedCsrfToken(page);
    if (method !== 'GET' && !token) throw new NegotiationError('login_required');
    const response = await page.evaluate(
      async ({ path, method, body, token }) => {
        if (location.origin !== 'https://www.vinted.de') return { status: 401, payload: null };
        const response = await fetch(path, {
          method,
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(token ? { 'X-CSRF-Token': token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(10000),
        });
        return {
          status: response.status,
          payload: response.headers.get('content-type')?.includes('application/json')
            ? await response.json().catch(() => null)
            : null,
        };
      },
      { path, method, body, token },
    );
    if (response.status < 200 || response.status >= 300 || response.payload === null)
      throw new NegotiationError(
        response.status === 401
          ? 'login_required'
          : response.status === 403
            ? 'challenge_required'
            : response.status === 429
              ? 'rate_limited'
              : 'provider_unavailable',
      );
    return response.payload as unknown;
  }
  return executeVintedNegotiation(
    {
      authorize,
      read: (path) => request(path, 'GET'),
      write: (path, method, body) => request(path, method, body),
      sendMessage: async (message, check) => {
        const result = await sendVintedMessage(
          page,
          accountId,
          {
            externalConversationId: message.externalConversationId,
            text: message.text,
            attachment: null,
          },
          check,
        );
        return {
          outcome: result.outcome,
          ...(result.externalMessageId ? { externalId: result.externalMessageId } : {}),
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        };
      },
    },
    accountId,
    command,
    sourceOffer,
    confirmedOffer,
  );
}
