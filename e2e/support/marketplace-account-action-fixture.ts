import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  parseVintedAccountAction,
  type VintedAccountAction,
} from '../../src/app/features/marketplaces/models/vinted-account-action';
import { vintedAccountActionKind } from '../../src/app/features/marketplaces/services/vinted-account-action-transport';

interface ActionFixture {
  readonly actions: Map<string, VintedAccountAction>;
  readonly payloads: Map<string, string>;
  readonly titles: Map<string, string>;
}
const fixtures = new WeakMap<Page, ActionFixture>();
const exposed = new WeakSet<Page>();
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültiger Testauftrag.');
  return value as Record<string, unknown>;
}
export function setMarketplaceActionTitle(page: Page, entryId: string, title: string): void {
  fixtures.get(page)?.titles.set(entryId, title);
}
export function putMarketplaceAction(page: Page, action: VintedAccountAction, body: unknown): void {
  const fixture = fixtures.get(page);
  if (!fixture) throw new Error('Die Aktionsfixture fehlt.');
  fixture.actions.set(action.requestId, parseVintedAccountAction(action, action));
  fixture.payloads.set(action.requestId, JSON.stringify(body));
}

/** Alte Ergebnisfixtures erhalten echte Belege; explizite 202-/Fehlerantworten bleiben unangetastet. */
export async function mockMarketplaceAccountActions(page: Page): Promise<void> {
  const fixture: ActionFixture = { actions: new Map(), payloads: new Map(), titles: new Map() };
  fixtures.set(page, fixture);
  if (!exposed.has(page)) {
    await page.exposeFunction('flipbaseMarketplaceActionFixture', (value: unknown) => {
      const message = record(value),
        body = record(message['body']);
      const kind =
        typeof message['path'] === 'string' ? vintedAccountActionKind(message['path']) : null;
      if (!kind) return null;
      const requestId = body['requestId'],
        workspaceId = body['workspaceId'],
        connectionId = body['connectionId'];
      if (
        typeof requestId !== 'string' ||
        !uuid.test(requestId) ||
        typeof workspaceId !== 'string' ||
        !uuid.test(workspaceId) ||
        typeof connectionId !== 'string' ||
        !uuid.test(connectionId)
      )
        throw new Error('Der Testauftrag ist nicht eindeutig kontogebunden.');
      const active = fixtures.get(page);
      if (!active) throw new Error('Die Aktionsfixture wurde geschlossen.');
      const existing = active.actions.get(requestId);
      if (existing) {
        if (existing.kind !== kind || active.payloads.get(requestId) !== JSON.stringify(body))
          throw new Error('Die Anfragekennung gehört zu einem anderen Testauftrag.');
        return existing;
      }
      if (message['phase'] === 'find') return null;
      if (message['phase'] !== 'result') throw new Error('Unbekannte Testphase.');
      const result = message['result'];
      const status =
        result && typeof result === 'object' && 'status' in result ? result.status : null;
      const entry = body['entryId'] ?? body['saleId'] ?? body['conversationId'];
      const entryId = typeof entry === 'string' && uuid.test(entry) ? entry : null;
      const at = new Date().toISOString();
      const action: VintedAccountAction = {
        id: randomUUID(),
        requestId,
        workspaceId,
        connectionId,
        kind,
        entryId,
        title: entryId ? (active.titles.get(entryId) ?? null) : null,
        state:
          status === 'unconfirmed' || status === 'outcome_unknown'
            ? 'outcome_unknown'
            : status === 'conflict' ||
                status === 'failed' ||
                (result &&
                  typeof result === 'object' &&
                  'outcome' in result &&
                  result.outcome === 'failed') ||
                result === null
              ? 'failed'
              : 'succeeded',
        version: 1,
        waitReason: null,
        errorCode:
          status === 'unconfirmed' || status === 'outcome_unknown' ? 'provider_unconfirmed' : null,
        result,
        blockedByActionId: null,
        historyPurged: false,
        resultExpired: false,
        createdAt: at,
        updatedAt: at,
        startedAt: at,
        finishedAt: at,
      };
      putMarketplaceAction(page, action, body);
      return action;
    });
    exposed.add(page);
  }
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const path = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href,
      ).pathname;
      if (
        !path.startsWith('/marketplace-browser/') ||
        typeof init?.body !== 'string' ||
        init.method !== 'POST'
      )
        return original(input, init);
      const requested: unknown = JSON.parse(init.body);
      if (!requested || typeof requested !== 'object' || !('requestId' in requested))
        return original(input, init);
      const exchange: unknown = Reflect.get(window, 'flipbaseMarketplaceActionFixture');
      if (typeof exchange !== 'function')
        throw new Error('Die Aktionsfixture ist nicht verbunden.');
      const before: unknown = await exchange({ phase: 'find', path, body: requested });
      if (before !== null) return Response.json({ action: before }, { status: 202 });
      const response = await original(input, init);
      if (response.status !== 200) return response;
      const result: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const action: unknown = await exchange({ phase: 'result', path, body: requested, result });
      return action === null ? response : Response.json({ action }, { status: 202 });
    };
  });
  await page.route('**/rest/v1/rpc/marketplace_account_actions_read', (route) => {
    const request = record(route.request().postDataJSON());
    return route.fulfill({
      json: {
        actions: [...fixture.actions.values()].filter(
          (action) =>
            action.workspaceId === request['p_workspace_id'] &&
            action.connectionId === request['p_connection_id'],
        ),
      },
    });
  });
  await page.route('**/marketplace-browser/actions/status', (route) => {
    const request = record(route.request().postDataJSON());
    const action = [...fixture.actions.values()].find(
      (action) =>
        action.id === request['actionId'] &&
        action.workspaceId === request['workspaceId'] &&
        action.connectionId === request['connectionId'],
    );
    return action ? route.fulfill({ json: { action } }) : route.fulfill({ status: 404 });
  });
}
