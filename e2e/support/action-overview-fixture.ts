import type { Page } from '@playwright/test';
import {
  accountIds,
  conversationId,
  emptyPage,
  mockMarketplace,
  workspaceId,
} from './marketplace-account-fixture';

export const actionOverviewScope = { workspaceId, connectionId: accountIds[0] };
export const actionOverviewMessagesUrl = `/marketplaces/vinted/messages?connectionId=${accountIds[0]}&conversationId=${conversationId}`;

/** Synthetische Aktionen; keine Verbindung zu Vinted oder einem echten Nutzerkonto. */
export async function mockActionOverview(page: Page, enabled = true) {
  await mockMarketplace(page, false, false, false, false, []);
  let persistedEnabled = enabled;
  let persistedWorkspaceSwitcherEnabled = true;
  let rejectSave = false;
  let rejectRead = false;
  const observedAt = new Date().toISOString();
  await page.route('**/rest/v1/rpc/marketplace_list_connections', (route) =>
    route.fulfill({
      json: {
        canManage: true,
        connections: [
          {
            ...actionOverviewScope,
            marketplace: 'vinted',
            executionMode: 'cloud',
            displayName: 'Testkonto A',
            externalAccountId: '123',
            status: 'connected',
            capabilities: { 'conversations.read': 'verified' },
            allowedActions: [],
            lastSyncedAt: observedAt,
          },
        ],
      },
    }),
  );
  const saves: boolean[] = [];
  const workspaceSaves: boolean[] = [];
  const user = () => ({
    id: '25000000-0000-4000-8000-000000000001',
    email: 'marketplace@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {
      flipbase_action_overview: persistedEnabled,
      flipbase_workspace_switcher: persistedWorkspaceSwitcherEnabled,
    },
    created_at: '2026-09-26T00:00:00Z',
  });
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      if (rejectSave)
        return route.fulfill({ status: 503, json: { message: 'Testverbindung unterbrochen' } });
      const requested = route.request().postDataJSON() as {
        data?: { flipbase_action_overview?: unknown; flipbase_workspace_switcher?: unknown };
      };
      if (typeof requested.data?.flipbase_action_overview === 'boolean') {
        persistedEnabled = requested.data.flipbase_action_overview;
        saves.push(persistedEnabled);
      }
      if (typeof requested.data?.flipbase_workspace_switcher === 'boolean') {
        persistedWorkspaceSwitcherEnabled = requested.data.flipbase_workspace_switcher;
        workspaceSaves.push(persistedWorkspaceSwitcherEnabled);
      }
    }
    return route.fulfill({ json: user() });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_sync_schedule', (route) =>
    route.fulfill({
      json: {
        ...actionOverviewScope,
        enabled: false,
        intervalMinutes: 15,
        nextDueAt: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        pausedReason: null,
        retryAfter: null,
        authorizationVersion: 0,
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
    route.fulfill({
      json: {
        ...actionOverviewScope,
        profile: null,
        publications: emptyPage(),
        sales: emptyPage(),
        activity: emptyPage(),
        conversations: {
          items: [
            {
              ...actionOverviewScope,
              id: conversationId,
              externalId: '99',
              title: 'Anna',
              text: 'Preisangebot',
              itemTitle: 'Vintage Lederjacke',
              itemId: '789',
              itemPrice: 50,
              itemCurrency: 'EUR',
              partnerId: '11',
              occurredAt: new Date().toISOString(),
              unread: false,
              detailCheckedAt: observedAt,
            },
          ],
          total: 1,
          nextCursor: null,
        },
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_page', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...actionOverviewScope,
            id: '25000000-0000-4000-8000-000000000041',
            externalId: '321',
            conversationId,
            title: 'Angebot',
            text: '20,00 €',
            direction: 'inbound',
            occurredAt: new Date().toISOString(),
            messageType: 'offer_request_message',
            offerStatus: 'pending',
            negotiationOffer: {
              offerId: '123',
              transactionId: '456',
              itemId: '789',
              buyerId: '11',
              sellerId: '123',
              originalPriceCents: 5000,
              offeredPriceCents: 2000,
              currency: 'EUR',
              status: 'pending',
            },
          },
        ],
        total: 1,
        nextCursor: null,
      },
    }),
  );
  await page.route('**/marketplace-browser/conversations/read', (route) =>
    route.fulfill({ json: { conversationId, observedAt } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_message_permission', (route) =>
    route.fulfill({ json: { executionMode: 'cloud', allowed: true, authorizationVersion: 1 } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_messages', (route) =>
    route.fulfill({ json: { ok: true, ...actionOverviewScope, messages: [] } }),
  );
  const listingJobs: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/marketplace_read_listing_jobs', (route) =>
    route.fulfill({ json: { items: listingJobs } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_cancel_listing_job', (route) => {
    const requested = route.request().postDataJSON() as Record<string, unknown>;
    const job = listingJobs.find((entry) => entry['id'] === requested['p_job_id']);
    if (!job || job['version'] !== requested['p_expected_version'])
      return route.fulfill({ status: 409, json: { code: '40001' } });
    job['state'] = 'cancelled';
    job['version'] = Number(job['version']) + 1;
    return route.fulfill({ json: job });
  });
  const states = ['running', 'queued', 'outcome_unknown', 'succeeded'] as const;
  const actions = states.map((state, index) => {
    const sourceId = `25000000-0000-4000-8000-${String(61 + index).padStart(12, '0')}`;
    return {
      id: `negotiation:${sourceId}`,
      source: 'negotiation',
      sourceId,
      isAutomated: false,
      kind: 'accept',
      state,
      conversationId,
      messageId: index === 0 ? '25000000-0000-4000-8000-000000000041' : null,
      offerId: String(123 + index),
      partnerName: `Testperson ${index + 1}`,
      itemTitle: `Testartikel ${index + 1}`,
      priceCents: 2000 + index * 100,
      currency: 'EUR',
      textPreview: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorCode: state === 'outcome_unknown' ? 'provider_result_unknown' : null,
    };
  });
  await page.route('**/rest/v1/rpc/marketplace_read_action_overview', (route) =>
    rejectRead
      ? route.fulfill({ status: 503, json: { message: 'Testverbindung unterbrochen' } })
      : route.fulfill({
          json: {
            ok: true,
            ...actionOverviewScope,
            actions,
          },
        }),
  );
  return {
    saves,
    workspaceSaves,
    setListingJobs: (jobs: Record<string, unknown>[]) => {
      listingJobs.splice(0, listingJobs.length, ...jobs);
    },
    persistedWorkspaceSwitcherEnabled: () => persistedWorkspaceSwitcherEnabled,
    persistedEnabled: () => persistedEnabled,
    rejectSave: (reject: boolean) => {
      rejectSave = reject;
    },
    rejectRead: (reject: boolean) => {
      rejectRead = reject;
    },
    queueOffer: () => {
      actions[0] = { ...actions[0], state: 'queued' };
    },
    finishActions: () => {
      for (let index = 0; index < actions.length; index++)
        actions[index] = { ...actions[index], state: 'succeeded' };
    },
  };
}
