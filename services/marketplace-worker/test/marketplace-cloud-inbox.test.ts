import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { Page } from 'playwright';
import { MarketplaceMessageRunner } from '../src/marketplace-message-runner.ts';
import { SupabaseMarketplaceMessageStore } from '../src/supabase-marketplace-message-store.ts';
import { sendVintedMessage } from '../src/vinted-browser-messages.ts';
import { parseVintedInboxEvents } from '../src/vinted-inbox-events.ts';

const identifier = (suffix: number) =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const workspaceId = identifier(1);
const connectionId = identifier(2);
const messageId = identifier(4);
const workerId = identifier(6);
const runnerId = identifier(7);
const sessionId = identifier(8);
const observedAt = '2026-10-08T12:00:00.000Z';

function fixture(lostReply = false) {
  const lifecycle: string[] = [];
  const finishes: Record<string, unknown>[] = [];
  const messages = [
    {
      id: 10,
      entity_type: 'message',
      created_at_ts: '2026-10-08T11:59:00Z',
      entity: { id: 10, user_id: 456, body: 'Ist die Jacke noch da?' },
    },
  ];
  const snapshot = () => ({ conversation: { id: 777, opposite_user: { id: 456 }, messages } });
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async (operation: (...parameters: unknown[]) => unknown, argument: unknown) =>
      runInNewContext(`(${operation.toString()})(argument)`, {
        argument,
        AbortSignal,
        FormData,
        Blob,
        Uint8Array,
        atob,
        location: { origin: 'https://www.vinted.de' },
        document: { querySelector: () => ({ content: 'synthetic-csrf' }), scripts: [] },
        fetch: async (path: string, init: RequestInit = {}) => {
          lifecycle.push(`${init.method ?? 'GET'} ${path}`);
          if (path === '/api/v2/users/current') return Response.json({ user: { id: 123 } });
          if (path === '/api/v2/conversations/777') return Response.json(snapshot());
          assert.equal(path, '/api/v2/conversations/777/replies');
          assert.equal(init.method, 'POST');
          assert.ok(lifecycle.includes('begin'));
          messages.push({
            id: 11,
            entity_type: 'message',
            created_at_ts: observedAt,
            entity: { id: 11, user_id: 123, body: 'Ja, sie ist verfügbar.' },
          });
          if (lostReply) throw new Error('synthetic lost reply');
          return Response.json({ code: 0 });
        },
      }),
  } as unknown as Page;
  const store = new SupabaseMarketplaceMessageStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'synthetic-server-key',
    now: () => Date.parse(observedAt),
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (path.endsWith('_claim'))
        return Response.json({
          workspaceId,
          connectionId,
          userId: identifier(3),
          messageId,
          claimToken: identifier(5),
          workerId,
          workerEpoch: 4,
          runnerId,
          authorizationVersion: 1,
          externalAccountId: '123',
          sessionId,
          expiresAt: '2026-10-08T12:01:30Z',
          absoluteExpiresAt: '2026-10-08T12:10:00Z',
          command: {
            externalConversationId: '777',
            text: 'Ja, sie ist verfügbar.',
            attachment: null,
          },
        });
      assert.equal(body['p_message_id'], messageId);
      assert.equal(body['p_claim_token'], identifier(5));
      if (path.endsWith('_check'))
        return Response.json({
          active: true,
          sessionId,
          expiresAt: '2026-10-08T12:01:30Z',
          absoluteExpiresAt: '2026-10-08T12:10:00Z',
        });
      if (path.endsWith('_begin')) lifecycle.push('begin');
      else {
        assert.ok(path.endsWith('_finish'));
        lifecycle.push('finish');
        finishes.push(body);
      }
      return Response.json({ ok: true });
    },
  });
  const runner = new MarketplaceMessageRunner(
    {
      open: async () => sessionId,
      run: async (_scope, id, operation) => {
        assert.equal(id, sessionId);
        return operation({
          version: () => 'fixture',
          sendMessage: (account, command, authorize) =>
            sendVintedMessage(page, account, command, authorize),
        });
      },
      close: async () => {
        lifecycle.push('closed');
      },
    },
    store,
  );
  return { store, runner, lifecycle, finishes, snapshot };
}

for (const lostReply of [false, true]) {
  test(`real parser, claim store and sender preserve inbound evidence with lostReply=${lostReply}`, async () => {
    const fixtureState = fixture(lostReply);
    const before = parseVintedInboxEvents(fixtureState.snapshot(), '123', observedAt);
    assert.deepEqual(
      before.events.map((event) => event.externalId),
      ['message:10'],
    );
    const claim = await fixtureState.store.claim(workerId, 4, runnerId);
    assert.ok(claim);
    await fixtureState.runner.run(claim);
    assert.equal(fixtureState.lifecycle.filter((step) => step.startsWith('POST ')).length, 1);
    assert.equal(fixtureState.lifecycle.at(-1), 'closed');
    assert.equal(fixtureState.finishes.length, 1);
    assert.equal(fixtureState.finishes[0]?.['p_outcome'], lostReply ? 'outcome_unknown' : 'sent');
    assert.equal(fixtureState.finishes[0]?.['p_external_message_id'], lostReply ? null : '11');
    assert.deepEqual(parseVintedInboxEvents(fixtureState.snapshot(), '123', observedAt), before);
    assert.equal(
      fixtureState.lifecycle.some((step) => step.includes('mark_as_read')),
      false,
    );
  });
}
