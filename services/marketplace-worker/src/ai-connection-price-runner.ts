import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { AiConnectionPriceStore } from './ai-connection-price-store.ts';
import type { SupabaseVintedListingCache } from './supabase-vinted-listing-cache.ts';
import { parseVintedListingPriceCents } from './vinted-browser-listing-content.ts';

interface PriceBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  openAction?(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    id: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, id: string): Promise<void>;
  finishAction?(scope: BrowserSessionScope, id: string): Promise<void>;
}

export async function runAiConnectionPrice(
  token: string,
  requestId: string,
  store: Pick<AiConnectionPriceStore, 'begin' | 'entry' | 'call'>,
  broker: PriceBroker,
  cache?: Pick<SupabaseVintedListingCache, 'save'>,
): Promise<Record<string, unknown>> {
  const request = await store.begin(token, requestId);
  if ('completed' in request) return request.completed;
  if ('busy' in request) return { status: 'running', requestId };
  const { scope } = request;
  if (!scope.aiPrice) throw new Error('KI-Preisfreigabe fehlt');
  let sessionId: string | undefined;
  let writeStarted = false;
  let result: Record<string, unknown>;
  try {
    const target = await store.entry(scope);
    sessionId = broker.openAction ? await broker.openAction(scope) : await broker.open(scope);
    const activeId = sessionId;
    const authorize = async () => {
      const current = await store.entry(scope);
      if (current.accountId !== target.accountId || current.externalId !== target.externalId)
        throw new Error('Kontozuordnung geändert');
      await broker.run(scope, activeId, async () => undefined);
      writeStarted = true;
    };
    const response = await broker.run(scope, activeId, async (browser) => {
      if (!browser.updateListingPrice) throw new Error('Preisänderungen sind nicht verfügbar');
      return browser.updateListingPrice(
        target.externalId,
        target.accountId,
        request.expectedPriceCents,
        request.priceCents,
        authorize,
      );
    });
    result =
      response.status === 'conflict'
        ? { status: 'conflict', requestId, currentPriceCents: response.priceCents }
        : response.status === 'confirmed' &&
            response.fields &&
            parseVintedListingPriceCents(response.fields.price) === request.priceCents
          ? {
              status: 'confirmed',
              requestId,
              entryId: request.entryId,
              priceCents: request.priceCents,
            }
          : { status: 'outcome_unknown', requestId };
    if (result['status'] === 'confirmed' && cache && response.fields) {
      try {
        const current = await store.entry(scope);
        if (current.externalId !== target.externalId || current.accountId !== target.accountId)
          throw new Error('Kontozuordnung geändert');
        await broker.run(scope, activeId, async () => undefined);
        result['cachePending'] = !(await cache.save(
          scope,
          request.entryId,
          target.externalId,
          response.fields,
          true,
        ));
      } catch {
        result['cachePending'] = true;
      }
    }
  } catch {
    result = {
      status: writeStarted || request.previousOutcomeUnknown ? 'outcome_unknown' : 'failed',
      requestId,
      error: 'Die Preisänderung konnte nicht bestätigt werden.',
    };
  }
  if (sessionId) {
    try {
      if (broker.finishAction) await broker.finishAction(scope, sessionId);
      else await broker.close(scope, sessionId);
    } catch {
      result['cleanupPending'] = true;
    }
  }
  if (request.previousOutcomeUnknown && result['status'] !== 'confirmed')
    result['previousOutcomeUnknown'] = true;
  await store.call(scope.aiPrice, 'finish', null, result);
  return result;
}
