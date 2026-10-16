import type { Page } from '@playwright/test';
import { accountIds, mockMarketplace, workspaceId } from './marketplace-account-fixture';

export async function mockMarketplaceOverview(
  page: Page,
  options: { vintedFailure?: boolean; multipleWorkspaces?: boolean; deniedVinted?: boolean } = {},
) {
  const calls = await mockMarketplace(page);
  if (options.deniedVinted)
    await page.route('**/rest/v1/rpc/marketplace_can_manage', (route) =>
      route.fulfill({ json: false }),
    );
  const secondWorkspaceId = '25000000-0000-4000-8000-000000000012';
  if (options.multipleWorkspaces) {
    await page.route('**/rest/v1/workspaces?**', (route) =>
      route.fulfill({
        json: [workspaceId, secondWorkspaceId].map((id, index) => ({
          id,
          name: 'Test-Workspace ' + (index + 1),
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          archived_at: null,
          setup_completed_at: '2026-09-26T00:00:00Z',
          created_at: '2026-09-26T00:00:00Z',
        })),
      }),
    );
    await page.route('**/rest/v1/rpc/list_my_workspace_access', (route) =>
      route.fulfill({
        json: [workspaceId, secondWorkspaceId].map((id) => ({
          workspace_id: id,
          access_status: 'active',
          ends_at: null,
          server_time: new Date().toISOString(),
        })),
      }),
    );
  }
  const requests: { connectionId: string | null; search: string | null; cursor: string | null }[] =
    [];
  await page.route('**/rest/v1/rpc/marketplace_list_connections', (route) => {
    if (options.vintedFailure)
      return route.fulfill({ status: 503, json: { message: 'nicht erreichbar' } });
    return route.fulfill({
      json: {
        canManage: true,
        connections: accountIds.map((connectionId, index) => ({
          workspaceId,
          connectionId,
          marketplace: 'vinted',
          executionMode: 'cloud',
          displayName: 'Testkonto ' + String.fromCharCode(65 + index),
          externalAccountId: String(100 + index),
          status: 'connected',
          capabilities: {},
          allowedActions: [],
          lastSyncedAt: '2026-10-15T10:00:00Z',
        })),
      },
    });
  });
  await page.route('**/rest/v1/marketplace_account_entries?**', (route) => {
    const url = new URL(route.request().url()),
      params = url.searchParams;
    const connectionId = params.get('connection_id')?.replace('eq.', '') ?? null;
    if (params.get('kind') === 'eq.profile') return route.fulfill({ json: null });
    const accountIndex = accountIds.indexOf(connectionId ?? '');
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: '25000000-0000-4000-8000-' + String(1000 + index).padStart(12, '0'),
      external_id: String(100 + index),
      sort_at: new Date(Date.UTC(2026, 9, 15, 10, 0, 60 - index)).toISOString(),
      body: {
        title: (accountIndex === 0 ? 'A' : 'B') + ' Jacke ' + String(index + 1).padStart(2, '0'),
        price: index === 0 ? 0 : 12.34,
        currency: 'EUR',
        isClosed: false,
        isReserved: index === 1,
        publishedAt: null,
        publicationAge: { value: 2, unit: 'day', observedAt: new Date().toISOString() },
      },
    })).filter((row) => {
      const search = params.get('body->>title')?.replace(/^ilike\.%|%$/g, '');
      return (
        (!search || row.body.title.toLowerCase().includes(search.toLowerCase())) &&
        (!params.get('body->>isReserved') ||
          String(row.body.isReserved) === params.get('body->>isReserved')?.replace('eq.', ''))
      );
    });
    if (route.request().method() === 'HEAD')
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': '0-0/' + rows.length,
        },
        body: '',
      });
    requests.push({ connectionId, search: params.get('body->>title'), cursor: params.get('or') });
    const cursor = params.get('or');
    const match = cursor?.match(/id\.lt\.([0-9a-f-]+)/);
    const start = match ? rows.findIndex((row) => row.id === match[1]) + 1 : 0;
    return route.fulfill({
      json: rows.slice(start, start + Number(params.get('limit') ?? 25)),
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': start + '-' + (start + 25) + '/' + rows.length,
      },
    });
  });
  await page.route('**/functions/v1/ebay-account', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const scope = { workspaceId, connectionId: '25000000-0000-4000-8000-000000000023' };
    if (body['action'] === 'status')
      return route.fulfill({
        json: {
          configured: true,
          importAvailable: false,
          listingManagementAvailable: true,
          connection: {
            ...scope,
            status: 'connected',
            environment: 'production',
            username: 'eBay-Testkonto',
            lastReadAt: null,
          },
        },
      });
    if (body['action'] === 'listings')
      return route.fulfill({
        json: {
          ...scope,
          total: 30,
          nextPage: null,
          items: Array.from({ length: 30 }, (_, index) => ({
            id: String(2000 + index),
            title: 'eBay Hemd ' + String(index + 1).padStart(2, '0'),
            price: 20,
            currency: 'EUR',
            quantity: 1,
            listingType: 'FixedPriceItem',
            imageUrl: null,
            url: 'https://www.ebay.de/itm/' + (2000 + index),
          })),
        },
      });
    return route.fulfill({ status: 400, json: { error: 'unexpected_action' } });
  });
  return { calls, requests };
}
