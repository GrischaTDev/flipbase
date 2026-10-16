import type { Page } from '@playwright/test';
import { mockMarketplaceOverview } from './marketplace-overview-fixture';
import { workspaceId } from './marketplace-account-fixture';
export async function mockKleinanzeigen(
  page: Page,
  options: { syncFailure?: boolean; quotaUsed?: number; available?: boolean } = {},
) {
  await mockMarketplaceOverview(page);
  const observedAt = '2026-10-16T06:00:00Z';
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  const requests: Record<string, unknown>[] = [];
  const connectionId = '9007199254740993';
  let revoked = false;
  const account = {
    workspaceId,
    connectionId,
    externalAccountId: '123',
    displayName: 'Kleinanzeigen Testkonto A',
    accountType: 'private',
    status: 'connected',
    lastSyncedAt: observedAt,
    listingCount: 26,
    activeCount: null,
    quota: { used: options.quotaUsed ?? 8, observedAt, source: 'account_settings' },
    localGrant: { active: true, canPublish: false, generation: 1, expiresAt },
    sync: null,
  };
  const other = {
    ...account,
    connectionId: '9007199254740994',
    externalAccountId: '124',
    displayName: 'Kleinanzeigen Testkonto B',
    lastSyncedAt: null,
    listingCount: null,
    quota: null,
    localGrant: null,
    status: 'needs_login',
  };
  const binding = {
    workspaceId,
    connectionId,
    externalAccountId: '123',
    displayName: account.displayName,
    accountType: 'private',
    status: 'connected',
    generation: 1,
    expiresAt,
    canPublish: false,
  };
  await page.addInitScript(
    ({ binding, available, syncFailure }) => {
      let local: Record<string, unknown> | null = binding;
      const send = (data: Record<string, unknown>) => window.postMessage(data, location.origin);
      window.addEventListener('message', (event) => {
        if (
          event.source !== window ||
          event.origin !== location.origin ||
          !event.data ||
          typeof event.data !== 'object'
        )
          return;
        const data = event.data as Record<string, unknown>;
        if (data['type'] === 'FLIPBASE_CHECK_EXTENSION') {
          send({
            type: 'FLIPBASE_EXTENSION_STATUS',
            installed: available,
            vintedLocal: false,
            kleinanzeigenCapabilities: { accounts: available, sync: available, publish: false },
          });
          return;
        }
        if (
          !available ||
          typeof data['type'] !== 'string' ||
          !data['type'].startsWith('FLIPBASE_KLEINANZEIGEN_') ||
          data['type'] === 'FLIPBASE_KLEINANZEIGEN_RESULT'
        )
          return;
        let result: unknown;
        let success = true;
        if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_STATUS') result = local;
        else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_SYNC') {
          success = !syncFailure;
          result = {
            workspaceId: binding.workspaceId,
            connectionId: binding.connectionId,
            runId: data['runId'],
            generation: data['generation'],
            state: 'confirmed',
            observedAt: '2026-10-16T06:00:00Z',
            itemCount: 26,
          };
        } else if (data['type'] === 'FLIPBASE_KLEINANZEIGEN_DISCONNECT') {
          local = null;
          result = { ok: true };
        } else return;
        send({
          type: 'FLIPBASE_KLEINANZEIGEN_RESULT',
          requestId: data['requestId'],
          success,
          result,
          ...(!success ? { error: 'Der Abgleich wurde unterbrochen.' } : {}),
        });
      });
    },
    { binding, available: options.available !== false, syncFailure: !!options.syncFailure },
  );
  await page.route('**/functions/v1/kleinanzeigen-account', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body['workspaceId'] !== workspaceId)
      return route.fulfill({ status: 403, json: { error: 'forbidden' } });
    if (body['action'] === 'read_accounts')
      return route.fulfill({
        json: {
          workspaceId,
          canManage: true,
          accounts: [
            {
              ...account,
              ...(revoked
                ? { status: 'disconnected', localGrant: { ...account.localGrant, active: false } }
                : {}),
            },
            other,
          ],
        },
      });
    if (body['action'] === 'request_sync')
      return route.fulfill({
        json: {
          workspaceId,
          connectionId: body['connectionId'],
          runId: '42',
          generation: 1,
          state: 'queued',
        },
      });
    if (body['action'] === 'disconnect') {
      revoked = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (body['action'] === 'read_publications') {
      const current = body['connectionId'] === connectionId;
      const rows = current
        ? Array.from({ length: 26 }, (_, index) => ({
            publicationId: (9007199254741000n - BigInt(index)).toString(),
            externalId: String(101 + index),
            title: 'KA Jacke ' + String(index + 1).padStart(2, '0'),
            url: 'https://www.kleinanzeigen.de/s-anzeige/test/' + (101 + index) + '-160-1',
            state: index === 1 ? 'unknown' : 'active',
            available: true,
            publishedAt: null,
            observedAt,
          }))
        : [];
      const search = String(body['search'] ?? '').toLowerCase();
      const filtered = rows.filter(
        (row) =>
          row.title.toLowerCase().includes(search) &&
          (body['state'] !== 'active' || row.state === 'active') &&
          body['state'] !== 'ended',
      );
      const start = body['afterId']
        ? filtered.findIndex((row) => row.publicationId === body['afterId']) + 1
        : 0;
      const limit = Number(body['limit']);
      const items = filtered.slice(start, start + limit);
      return route.fulfill({
        json: {
          workspaceId,
          connectionId: body['connectionId'],
          snapshotAt: current ? observedAt : null,
          items,
          total: current ? filtered.length : null,
          nextId: start + limit < filtered.length ? (items.at(-1)?.publicationId ?? null) : null,
          completeness: current ? 'complete' : 'unknown',
        },
      });
    }
    return route.fulfill({ status: 500, json: { error: 'unexpected_kleinanzeigen_action' } });
  });
  return { requests, workspaceId, connectionId };
}
