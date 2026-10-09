import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mockMarketplace,
  workspaceId,
  accountIds,
  emptyPage,
} from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const connectionId = accountIds[0];
const conversationId = '25000000-0000-4000-8000-000000000051';
const secondConversationId = '25000000-0000-4000-8000-000000000052';
const scope = { workspaceId, connectionId };
const imageUrl = 'https://images.example.test/jacket.svg';
const partnerAvatarUrl = 'https://images.example.test/partner.svg';
const accountAvatarUrl = 'https://images.example.test/account.svg';
const expiresAt = '2099-10-05T12:00:00Z';

async function inboxFixture(
  page: Page,
  longHistory = false,
  cloud = false,
  automatedReply = false,
) {
  await mockMarketplace(page, false, false, false, false, []);
  const now = new Date().toISOString();
  const account = {
    ...scope,
    marketplace: 'vinted',
    executionMode: cloud ? 'cloud' : 'local',
    displayName: cloud ? 'Cloud-Testkonto' : 'Lokales Testkonto',
    externalAccountId: '123',
    status: 'connected',
    capabilities: { 'conversations.read': 'verified' },
    allowedActions: [],
    lastSyncedAt: now,
  };
  const conversations = [
    {
      ...scope,
      id: conversationId,
      externalId: '51',
      title: 'Anna',
      text: 'Ist die Jacke noch da?',
      occurredAt: now,
      unread: true,
      readVersion: 'a'.repeat(32),
      imageUrl: partnerAvatarUrl,
      itemId: '456',
      itemTitle: 'Vintage Lederjacke',
      itemImageUrl: imageUrl,
      itemPrice: 58,
      itemCurrency: 'EUR',
      partnerId: '991',
      lastActiveAt: now,
      detailCheckedAt: null as string | null,
      transactionStatus: 'Offen',
    },
    {
      ...scope,
      id: secondConversationId,
      externalId: '52',
      title: 'Ben',
      text: 'Danke für die Maße.',
      occurredAt: '2026-10-01T10:00:00Z',
      unread: false,
      readVersion: 'a'.repeat(32),
      itemTitle: 'Blauer Schal',
      itemImageUrl: imageUrl,
      itemPrice: 12,
      itemCurrency: 'EUR',
      detailCheckedAt: null as string | null,
    },
  ];
  const queue: Record<string, unknown>[] = [];
  const enqueues: Record<string, unknown>[] = [];
  const retries: Record<string, unknown>[] = [];
  const bridgeCalls: string[] = [];
  let providerRequests = 0;
  let pendingDetail: Promise<void> | null = null;
  let finishDetail: (() => void) | undefined;
  let pendingStoredMessages: Promise<void> | null = null;
  let finishStoredMessages: (() => void) | undefined;
  await page.route('https://www.vinted.de/**', (route) => {
    providerRequests++;
    return route.abort();
  });
  await page.exposeFunction(
    'inboxBridgeObserved',
    async (type: string, requestedConversationId?: string) => {
      bridgeCalls.push(type);
      if (type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL' && pendingDetail) await pendingDetail;
      if (type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL') {
        const conversation = conversations.find((entry) => entry.id === requestedConversationId);
        if (conversation) conversation.detailCheckedAt = now;
      }
      account.lastSyncedAt = new Date().toISOString();
    },
  );
  await page.addInitScript(
    ({ scope, expiresAt, observedAt }) => {
      window.addEventListener('message', async (event) => {
        if (event.source === window && event.data?.type === 'FLIPBASE_CHECK_EXTENSION') {
          window.postMessage(
            {
              type: 'FLIPBASE_EXTENSION_STATUS',
              installed: true,
              vintedLocal: true,
              localAccount: {
                boundUsername: 'synthetic-test',
                boundConnectionId: scope.connectionId,
                expiresAt,
                state: 'linked',
              },
            },
            location.origin,
          );
          return;
        }
        if (event.source !== window || !event.data?.type?.startsWith('FLIPBASE_VINTED_LOCAL_'))
          return;
        if (event.data.type === 'FLIPBASE_VINTED_LOCAL_RESULT') return;
        if (
          ['FLIPBASE_VINTED_LOCAL_READINESS', 'FLIPBASE_VINTED_LOCAL_RECHECK'].includes(
            event.data.type,
          )
        ) {
          window.postMessage(
            {
              type: 'FLIPBASE_VINTED_LOCAL_RESULT',
              requestId: event.data.requestId,
              success: true,
              result: {
                state: 'ready',
                ...scope,
                externalAccountId: '123',
                checkedAt: observedAt,
                version: '1.0.0',
              },
            },
            location.origin,
          );
          return;
        }
        await (
          window as unknown as {
            inboxBridgeObserved(type: string, conversationId?: string): Promise<void>;
          }
        ).inboxBridgeObserved(event.data.type, event.data.payload?.conversationId);
        window.postMessage(
          {
            type: 'FLIPBASE_VINTED_LOCAL_RESULT',
            requestId: event.data.requestId,
            success: true,
            result: {
              ...scope,
              externalAccountId: '123',
              expiresAt,
              observedAt,
              counts: { conversation: 2, message: 3 },
              nextPage: 1,
              conversationsComplete: false,
            },
          },
          location.origin,
        );
      });
    },
    { scope, expiresAt, observedAt: now },
  );
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body:
        route.request().url() === imageUrl
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="140"><rect width="120" height="140" fill="#ccd7d2"/><path d="M40 20l-20 25 15 20 8-8v65h34V57l8 8 15-20-20-25-20 8z" fill="#435c51"/></svg>'
          : `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#e4e4e7"/><text x="60" y="78" text-anchor="middle" font-family="sans-serif" font-size="52" fill="#3f3f46">${route.request().url() === partnerAvatarUrl ? 'A' : 'T'}</text></svg>`,
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_list_connections', (route) =>
    route.fulfill({ json: { canManage: true, connections: [account] } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_local_extension', (route) =>
    route.fulfill({
      json: {
        binding: {
          externalAccountId: '123',
          expiresAt,
          revoked: false,
          lastSeenAt: now,
          inboxSyncedAt: now,
          messagesRead: true,
          messagesSend: true,
        },
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
    route.fulfill({
      json: {
        ...scope,
        profile: {
          ...scope,
          displayName: account.displayName,
          username: 'synthetic-test',
          location: 'Deutschland',
          bio: null,
          imageUrl: accountAvatarUrl,
        },
        publications: emptyPage(),
        conversations: { items: conversations, total: 2, nextCursor: null },
        sales: emptyPage(),
        activity: emptyPage(),
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_page', async (route) => {
    const body = route.request().postDataJSON();
    if (body['p_kind'] !== 'message') return route.fallback();
    if (pendingStoredMessages) await pendingStoredMessages;
    if (body['p_parent_id'] === secondConversationId) return route.fulfill({ json: emptyPage() });
    return route.fulfill({
      json: {
        items: [
          ...(automatedReply
            ? [
                {
                  ...scope,
                  id: '25000000-0000-4000-8000-000000000065',
                  conversationId: body['p_parent_id'],
                  text: 'Ja, sie ist verfügbar.',
                  direction: 'outbound',
                  occurredAt: now,
                  messageType: 'text_message',
                  isAutomated: true,
                },
              ]
            : []),
          ...(longHistory
            ? Array.from({ length: 24 }, (_, index) => ({
                ...scope,
                id: `25000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
                conversationId: body['p_parent_id'],
                title: 'Nachricht',
                text: `Ältere Nachricht ${index + 1}: Vielen Dank für Deine Rückmeldung zur Jacke.`,
                direction: index % 2 ? 'outbound' : 'inbound',
                occurredAt: now,
                messageType: 'text_message',
              }))
            : []),
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000061',
            conversationId: body['p_parent_id'],
            title: 'Nachricht',
            text: 'Ist die Jacke noch da?',
            direction: 'inbound',
            occurredAt: now,
            messageType: 'text_message',
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000062',
            conversationId: body['p_parent_id'],
            title: 'Nachricht',
            text: 'Ja, sie ist verfügbar.',
            direction: 'outbound',
            occurredAt: now,
            messageType: 'text_message',
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000063',
            conversationId: body['p_parent_id'],
            title: 'Preisangebot',
            text: 'Ein neues Angebot',
            direction: 'inbound',
            occurredAt: now,
            messageType: 'offer_request_message',
            offerStatus: 'rejected',
            priceLabel: '50,00 € statt 58,00 €',
            imageUrls: [imageUrl],
          },
          {
            ...scope,
            id: '25000000-0000-4000-8000-000000000064',
            conversationId: body['p_parent_id'],
            title: 'Verkauft',
            text: 'Verkauft',
            direction: 'unknown',
            occurredAt: now,
            messageType: 'status_message',
          },
        ].reverse(),
        total: (longHistory ? 28 : 4) + (automatedReply ? 1 : 0),
        nextCursor: null,
      },
    });
  });
  await page.route('**/rest/v1/rpc/marketplace_mark_conversation_read', (route) => {
    const request = route.request().postDataJSON();
    const conversation = conversations.find((entry) => entry.id === request['p_conversation_id']);
    const marked = !!conversation && conversation.readVersion === request['p_read_version'];
    if (conversation && marked) conversation.unread = false;
    return route.fulfill({ json: { ok: true, marked } });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_message_permission', (route) =>
    route.fulfill({
      json: { executionMode: account.executionMode, allowed: true, authorizationVersion: 1 },
    }),
  );
  await page.route('**/marketplace-browser/conversations/read', async (route) => {
    if (pendingDetail) await pendingDetail;
    const body = route.request().postDataJSON();
    expect(body).toEqual({ ...scope, conversationId: body['conversationId'] });
    const conversation = conversations.find((entry) => entry.id === body['conversationId']);
    if (!conversation) throw new Error('Cloud-Testgespräch fehlt');
    conversation.detailCheckedAt = now;
    return route.fulfill({ json: { conversationId: conversation.id, observedAt: now } });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_messages', (route) =>
    route.fulfill({
      json: {
        ok: true,
        ...scope,
        messages: queue.filter(
          (message) =>
            message['conversationId'] === route.request().postDataJSON()['p_conversation_id'],
        ),
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_enqueue_message', (route) => {
    const body = route.request().postDataJSON();
    enqueues.push(body);
    const message = {
      id: '25000000-0000-4000-8000-000000000071',
      requestId: body['p_request_id'],
      conversationId: body['p_conversation_id'],
      text: body['p_text'],
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      externalMessageId: null,
      errorCode: null,
      attachment: null,
    };
    queue.push(message);
    return route.fulfill({ json: { ok: true, ...scope, message } });
  });
  await page.route('**/rest/v1/rpc/marketplace_retry_message', (route) => {
    const body = route.request().postDataJSON();
    retries.push(body);
    const source = queue.find((message) => message['id'] === body['p_message_id']);
    if (!source) throw new Error('Wiederholte Nachricht fehlt in der Testwarteschlange');
    source['state'] = 'cancelled';
    source['errorCode'] = 'retried';
    const message = {
      ...source,
      id: '25000000-0000-4000-8000-000000000072',
      requestId: body['p_message_id'],
      state: 'queued',
      errorCode: null,
      updatedAt: now,
    };
    queue.push(message);
    return route.fulfill({ json: { ok: true, ...scope, message } });
  });
  return {
    enqueues,
    retries,
    addUncertainMessage() {
      queue.push({
        id: '25000000-0000-4000-8000-000000000071',
        requestId: '25000000-0000-4000-8000-000000000073',
        conversationId,
        text: 'Diese Testnachricht wurde noch nicht bestätigt.',
        state: 'outcome_unknown',
        createdAt: now,
        updatedAt: now,
        externalMessageId: null,
        errorCode: 'timeout',
        attachment: null,
      });
    },
    bridgeCalls,
    pauseStoredMessages() {
      pendingStoredMessages = new Promise<void>((resolve) => {
        finishStoredMessages = resolve;
      });
    },
    resumeStoredMessages() {
      finishStoredMessages?.();
      pendingStoredMessages = null;
    },
    pauseDetails() {
      pendingDetail = new Promise<void>((resolve) => {
        finishDetail = resolve;
      });
    },
    resumeDetails() {
      finishDetail?.();
      pendingDetail = null;
    },
    get providerRequests() {
      return providerRequests;
    },
  };
}

for (const cloud of [true, false]) {
  test(`Geöffnetes ${cloud ? 'Cloud' : 'Extension'}-Gespräch wird nach erfolgreichem Laden gelesen @core-smoke`, async ({
    page,
  }) => {
    const fixture = await inboxFixture(page, false, cloud);
    fixture.pauseDetails();
    await page.goto(
      `/marketplaces/vinted/messages?connectionId=${connectionId}&conversationId=${conversationId}`,
    );
    const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
    await expect(conversation.getByText('Ungelesen', { exact: true })).toBeVisible();
    fixture.resumeDetails();
    await expect(conversation.getByText('Synchronisiert', { exact: true })).toBeVisible();
    await expect(conversation.getByText('Ungelesen', { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(conversation.getByText('Synchronisiert', { exact: true })).toBeVisible();
    await expect(conversation.getByText('Ungelesen', { exact: true })).toHaveCount(0);
    expect(fixture.providerRequests).toBe(0);
  });
  for (const width of [1440, 390]) {
    test(`Bot-Icon für automatische Antwort ${cloud ? 'Cloud' : 'Extension'} ${width}px @core-smoke`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light' });
      const fixture = await inboxFixture(page, false, cloud, true);
      await page.goto(
        `/marketplaces/vinted/messages?connectionId=${connectionId}&conversationId=${conversationId}`,
      );
      if (width === 390)
        await page.getByRole('button', { name: 'Zu dunklem Design wechseln', exact: true }).click();
      const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
      const bot = conversation.locator('[data-automated-message-avatar]');
      await expect(bot).toBeVisible();
      await expect(bot).toHaveAttribute('title', 'Automatisch von Flipbase gesendet');
      await expect(
        conversation.getByRole('img', { name: 'Automatisch von Flipbase gesendet', exact: true }),
      ).toBeVisible();
      await expect(
        conversation.locator('[data-message-row="25000000-0000-4000-8000-000000000062"]'),
      ).toContainText('Ja, sie ist verfügbar.');
      await expect(
        conversation.getByRole('img', { name: 'Profilbild von synthetic-test', exact: true }),
      ).toBeVisible();
      await expect(bot.locator('svg')).toBeVisible();
      const avatarBounds = await bot.boundingBox();
      expect(avatarBounds?.width).toBe(44);
      expect(avatarBounds?.height).toBe(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await checkAxe(page);
      expect(fixture.enqueues).toHaveLength(0);
      expect(fixture.providerRequests).toBe(0);
      const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
      if (screenshotDirectory) {
        await mkdir(screenshotDirectory, { recursive: true });
        await conversation.getByRole('log').evaluate((element) => {
          element.scrollTop = 0;
        });
        await conversation.screenshot({
          path: join(
            screenshotDirectory,
            `vinted-bot-avatar-${cloud ? 'cloud' : 'extension'}-${width}.png`,
          ),
        });
      }
    });
  }
}

test('prüft unklaren Versand vor der Wiederholung und versetzt den Mausfokus nicht @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const fixture = await inboxFixture(page);
  fixture.addUncertainMessage();
  await page.goto('/marketplaces/vinted/messages');
  const rows = page.locator('[data-conversation-row]');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole('button').click();
  const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
  await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).not.toBeFocused();
  const retry = conversation.getByRole('button', { name: 'Versand prüfen und wiederholen' });
  await expect(retry).toBeVisible();
  await checkAxe(page);
  const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, 'vinted-message-retry.png'),
      fullPage: true,
    });
  }
  await retry.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Prüfe den Vinted-Verlauf');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  expect(fixture.retries).toHaveLength(0);
  await retry.click();
  await dialog.getByRole('button', { name: 'Nicht gesendet – erneut senden', exact: true }).click();
  await expect(conversation.locator('[data-queue-state="queued"]')).toContainText(
    'Diese Testnachricht wurde noch nicht bestätigt.',
  );
  await expect(conversation.locator('[data-queue-state="outcome_unknown"]')).toHaveCount(0);
  expect(fixture.retries).toHaveLength(1);
  expect(fixture.retries[0]['p_confirmed_unknown']).toBe(true);
  expect(fixture.bridgeCalls).toContain('FLIPBASE_VINTED_LOCAL_MESSAGES_SEND');
  expect(
    await conversation
      .getByRole('log')
      .evaluate((element) => element.lastElementChild?.hasAttribute('data-conversation-sync')),
  ).toBe(true);
  await checkAxe(page);
});

for (const width of [1440, 390]) {
  test(`Cloud-Glocke öffnet das richtige Gespräch und sendet ohne Extension bei ${width}px @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const fixture = await inboxFixture(page, false, true);
    const marks: Record<string, unknown>[] = [];
    let read = false;
    await page.route('**/rest/v1/rpc/marketplace_read_message_notifications', (route) =>
      route.fulfill({
        json: {
          workspaceId,
          unreadCount: read ? 0 : 1,
          items: [
            {
              id: '7',
              connectionId,
              conversationId,
              accountName: 'Cloud-Testkonto',
              senderName: 'Anna',
              eventKind: 'message',
              observedAt: new Date().toISOString(),
              read,
            },
          ],
        },
      }),
    );
    await page.route('**/rest/v1/rpc/marketplace_mark_message_notifications', (route) => {
      marks.push(route.request().postDataJSON());
      read = true;
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto('/marketplaces/vinted/messages');
    await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
    await page.getByRole('link').filter({ hasText: 'Neue Nachricht · Cloud-Testkonto' }).click();
    await expect(page).toHaveURL(
      new RegExp(`connectionId=${connectionId}.*conversationId=${conversationId}`),
    );
    const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.getByText('Vintage Lederjacke', { exact: true })).toBeVisible();
    const inbound = conversation.locator(
      '[data-message-row="25000000-0000-4000-8000-000000000061"]',
    );
    const outbound = conversation.locator(
      '[data-message-row="25000000-0000-4000-8000-000000000062"]',
    );
    await expect(
      inbound.getByRole('img', { name: 'Profilbild von Anna', exact: true }),
    ).toBeVisible();
    await expect(
      outbound.getByRole('img', { name: 'Profilbild von synthetic-test', exact: true }),
    ).toBeVisible();
    expect(
      await inbound.locator('[data-message-avatar] > span').evaluate((element) => {
        const styles = getComputedStyle(element);
        return parseFloat(styles.borderRadius) >= element.clientWidth / 2;
      }),
    ).toBe(true);
    const inboundAvatar = await inbound.locator('[data-message-avatar]').boundingBox();
    const inboundBubble = await inbound.locator('article').boundingBox();
    const outboundAvatar = await outbound.locator('[data-message-avatar]').boundingBox();
    const outboundBubble = await outbound.locator('article').boundingBox();
    expect(
      inboundAvatar && inboundBubble && inboundAvatar.x + inboundAvatar.width <= inboundBubble.x,
    ).toBe(true);
    expect(
      outboundAvatar &&
        outboundBubble &&
        outboundBubble.x + outboundBubble.width <= outboundAvatar.x,
    ).toBe(true);
    const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-message-avatars-${width}.png`),
        fullPage: true,
      });
      await conversation.screenshot({
        path: join(screenshotDirectory, `vinted-message-avatar-conversation-${width}.png`),
      });
    }
    await conversation
      .getByRole('textbox', { name: 'Deine Nachricht', exact: true })
      .fill('Danke für Dein Interesse.');
    await conversation.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(conversation.locator('[data-queue-state="queued"]')).toContainText(
      'Danke für Dein Interesse.',
    );
    expect(fixture.enqueues).toHaveLength(1);
    expect(fixture.enqueues[0]).toMatchObject({
      p_workspace_id: workspaceId,
      p_connection_id: connectionId,
      p_conversation_id: conversationId,
    });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ p_workspace_id: workspaceId, p_notification_id: '7' });
    expect(fixture.bridgeCalls.filter((type) => type.includes('LOCAL_'))).toEqual([]);
    expect(fixture.providerRequests).toBe(0);
    await checkAxe(page);
  });
}

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-vinted-messages') as Element,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('zeigt einen bekannten Chat sofort auch während Datenbank und Vinted noch aktualisieren @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const fixture = await inboxFixture(page);
  await page.goto('/marketplaces/vinted/messages');
  const rows = page.locator('[data-conversation-row]');
  await expect(rows).toHaveCount(2);
  const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
  await rows.nth(0).getByRole('button').click();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  const firstMessageBounds = await conversation
    .locator('[data-message-kind]')
    .first()
    .boundingBox();
  fixture.pauseStoredMessages();
  fixture.pauseDetails();
  await rows.nth(1).getByRole('button').click();
  await expect(conversation.getByRole('heading', { name: 'Ben', exact: true })).toBeVisible();
  await expect(conversation.getByText('Blauer Schal', { exact: true })).toBeVisible();
  await expect(conversation.locator('[data-message-composer]')).toBeVisible();
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-message-kind]')).toHaveCount(0);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  await expect(conversation.getByText('Nachrichten werden geladen', { exact: false })).toHaveCount(
    0,
  );
  fixture.resumeStoredMessages();
  await expect
    .poll(
      () =>
        fixture.bridgeCalls.filter((type) => type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL').length,
    )
    .toBe(2);
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-message-kind]')).toHaveCount(0);
  await checkAxe(page);
  const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: join(screenshotDirectory, 'vinted-empty-chat-refreshing.png'),
      fullPage: true,
    });
  }
  fixture.resumeDetails();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  fixture.pauseStoredMessages();
  fixture.pauseDetails();
  await rows.nth(0).getByRole('button').click();
  await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
  await expect(conversation.getByText('Vintage Lederjacke', { exact: true })).toBeVisible();
  await expect(conversation.getByRole('log')).toContainText('Abgelehnt');
  await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  await expect(conversation.getByText('Nachrichten werden geladen', { exact: false })).toHaveCount(
    0,
  );
  expect((await conversation.locator('[data-message-kind]').first().boundingBox())?.y).toBe(
    firstMessageBounds?.y,
  );
  fixture.resumeStoredMessages();
  await expect
    .poll(
      () =>
        fixture.bridgeCalls.filter((type) => type === 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL').length,
    )
    .toBe(3);
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Wird aktualisiert');
  fixture.resumeDetails();
  await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  await checkAxe(page);
});

for (const { width, theme } of [
  { width: 1440, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 390, theme: 'dark' },
]) {
  test(`lokales Postfach mit Artikel, Suche, Filter und Versandwarteschlange ${width}px ${theme} @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = await inboxFixture(page, theme === 'dark');
    await page.goto('/marketplaces/vinted/messages');
    await expect(page.getByRole('heading', { name: 'Gespräche', exact: true })).toBeVisible({
      timeout: 15000,
    });
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Zu dunklem Design wechseln', exact: true }).click();
    const rows = page.locator('[data-conversation-row]');
    await expect(rows).toHaveCount(2);
    await checkAxe(page);
    const screenshotDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-list-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }).click();
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_INBOX_SYNC'))
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }),
    ).toBeEnabled();
    const search = page.getByRole('searchbox', { name: 'Gespräche suchen' });
    await search.fill('Lederjacke');
    await expect(rows).toHaveCount(1);
    await search.fill('');
    await page.getByRole('combobox', { name: 'Gespräche filtern' }).click();
    await expect(page.getByRole('option', { name: 'Alle', exact: true })).toBeVisible();
    await expect(
      page.getByRole('option', { name: 'Systemnachrichten (0)', exact: true }),
    ).toBeVisible();
    const systemFilter = page.getByRole('option', { name: 'Systemnachrichten (0)', exact: true });
    await expect
      .poll(async () => (await systemFilter.boundingBox())?.width ?? 0)
      .toBeGreaterThan(200);
    expect(
      await systemFilter
        .locator('span')
        .first()
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.getByRole('option', { name: 'Ungelesen (1)', exact: true }).click();
    await expect(rows).toHaveCount(1);
    const productImage = rows.first().locator('img');
    if (width >= 1024) await expect(productImage).toHaveCSS('object-fit', 'cover');
    fixture.pauseDetails();
    fixture.pauseStoredMessages();
    await rows.first().getByRole('button').click();
    const conversation = page.getByRole('region', { name: 'Gespräch', exact: true });
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-item]')).toBeVisible();
    await expect(conversation.getByRole('log')).toBeVisible();
    await expect(conversation.locator('[data-message-composer]')).toBeVisible();
    await expect(conversation.locator('[data-conversation-sync]')).toContainText(
      'Wird aktualisiert',
    );
    await expect(
      conversation.getByText('Nachrichten werden geladen', { exact: false }),
    ).toHaveCount(0);
    if (screenshotDirectory)
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-loading-${width}-${theme}.png`),
        fullPage: true,
      });
    fixture.resumeStoredMessages();
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.getByRole('log')).toBeVisible();
    await expect(conversation.locator('[data-message-composer]')).toBeVisible();
    await expect(conversation.locator('[data-conversation-sync]')).toContainText(
      'Wird aktualisiert',
    );
    await checkAxe(page);
    if (screenshotDirectory)
      await page.screenshot({
        path: join(screenshotDirectory, `vinted-inbox-refreshing-${width}-${theme}.png`),
        fullPage: true,
      });
    fixture.resumeDetails();
    await expect(conversation.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
    await expect(conversation.locator('[data-conversation-loading]')).toHaveCount(0);
    await expect(conversation.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
    await expect(conversation.getByText('Vintage Lederjacke', { exact: true })).toBeVisible();
    await expect(
      conversation.locator('[data-conversation-item]').getByText('58,00 €', { exact: true }),
    ).toBeVisible();
    await expect(conversation.getByRole('img', { name: 'Vintage Lederjacke' })).toBeVisible();
    await expect(conversation.getByText('Zuletzt aktiv', { exact: false })).toBeVisible();
    await expect(page.getByRole('log')).toContainText('50,00 €');
    await expect(page.getByRole('log').locator('del')).toHaveText('58,00 €');
    await expect(page.getByRole('log')).toContainText('Abgelehnt');
    await expect(page.locator('[data-message-kind="system"]')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('[data-message-kind="system"]')).toHaveCSS('text-align', 'center');
    await expect(page.locator('[data-message-day]')).toHaveCount(1);
    await expect(page.locator('[data-message-day]')).toHaveText('Heute');
    await expect(rows).toHaveCount(0);
    const composer = conversation.locator('form');
    const composerBounds = await composer.boundingBox();
    const cardBounds = await conversation.locator('app-card').boundingBox();
    expect(composerBounds).not.toBeNull();
    expect(cardBounds).not.toBeNull();
    expect(
      (cardBounds?.y ?? 0) +
        (cardBounds?.height ?? 0) -
        ((composerBounds?.y ?? 0) + (composerBounds?.height ?? 0)),
    ).toBeLessThan(20);
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toHaveAttribute(
      'rows',
      '1',
    );
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toHaveCSS(
      'border-radius',
      '16px',
    );
    if (theme === 'dark') {
      const log = page.getByRole('log');
      expect(await log.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      );
      const footerBeforeScroll = await composer.boundingBox();
      await log.evaluate((element) => {
        element.scrollTop = 0;
      });
      expect((await composer.boundingBox())?.y).toBe(footerBeforeScroll?.y);
    }
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_INBOX_DETAIL'))
      .toBe(true);
    await conversation
      .getByRole('textbox', { name: 'Deine Nachricht' })
      .fill('Testantwort\nmit zweiter Zeile');
    await conversation.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.locator('[data-queue-state="queued"]')).toContainText('Testantwort');
    expect(
      await page
        .getByRole('log')
        .evaluate((element) => element.lastElementChild?.hasAttribute('data-conversation-sync')),
    ).toBe(true);
    expect(fixture.enqueues).toHaveLength(1);
    expect(fixture.enqueues[0]['p_text']).toBe('Testantwort\nmit zweiter Zeile');
    await expect
      .poll(() => fixture.bridgeCalls.includes('FLIPBASE_VINTED_LOCAL_MESSAGES_SEND'))
      .toBe(true);
    await expect(conversation.getByRole('textbox', { name: 'Deine Nachricht' })).toBeEmpty();
    if (width < 1024) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const sendButton = await conversation
        .getByRole('button', { name: 'Senden', exact: true })
        .boundingBox();
      const navigation = await page.locator('[data-shell-bottom-nav] nav').boundingBox();
      expect(sendButton).not.toBeNull();
      expect(navigation).not.toBeNull();
      expect((sendButton?.y ?? 0) + (sendButton?.height ?? 0)).toBeLessThanOrEqual(
        navigation?.y ?? 0,
      );
    }
    await checkAxe(page);
    const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (directory) {
      await page.getByRole('log').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: join(directory, `vinted-inbox-conversation-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    if (width < 1024) {
      await page.getByRole('button', { name: 'Zur Gesprächsliste' }).click();
      await expect(page.getByRole('heading', { name: 'Gespräche', exact: true })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Gespräche suchen' })).toBeVisible();
    }
    expect(fixture.providerRequests).toBe(0);
    expect(errors).toEqual([]);
  });
}
