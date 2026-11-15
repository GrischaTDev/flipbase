import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAiConnectionPrice } from '../src/ai-connection-price-runner.ts';
import { AiConnectionPriceStore } from '../src/ai-connection-price-store.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const id = '78000000-0000-4000-8000-000000000001';
const scope: BrowserSessionScope = {
  workspaceId: id,
  connectionId: id,
  userId: id,
  userAccessToken: '',
  aiPrice: { grantId: id, authSessionId: id, requestId: id, attemptId: id },
};
function fixture(
  options: {
    revoked?: boolean;
    uncertain?: boolean;
    cached?: boolean;
    cleanupFails?: boolean;
    conflict?: boolean;
    previousOutcomeUnknown?: boolean;
  } = {},
) {
  let authorizations = 0;
  let writes = 0;
  let opens = 0;
  const results: unknown[] = [];
  const store = {
    begin: () =>
      Promise.resolve(
        options.cached
          ? { completed: { status: 'confirmed' } }
          : {
              scope,
              entryId: id,
              expectedPriceCents: 2500,
              priceCents: 2000,
              previousOutcomeUnknown: options.previousOutcomeUnknown,
            },
      ),
    entry: () => {
      authorizations++;
      if (options.revoked && authorizations > 1) return Promise.reject(new Error('revoked'));
      return Promise.resolve({ externalId: '123', accountId: '456' });
    },
    call: (_proof: unknown, operation: string, _session: unknown, result: unknown) => {
      assert.equal(operation, 'finish');
      results.push(result);
      return Promise.resolve({});
    },
  };
  const browser = {
    async updateListingPrice(
      _item: string,
      _account: string,
      expected: number,
      price: number,
      authorize: () => Promise<void>,
    ) {
      assert.equal(expected, 2500);
      assert.equal(price, 2000);
      if (options.conflict) return { status: 'conflict' as const, priceCents: 2300 };
      await authorize();
      writes++;
      if (options.uncertain) throw new Error('lost response');
      return {
        status: 'confirmed' as const,
        fields: { title: 'Artikel', description: 'Originaltext', price: '20,00' },
      };
    },
  } as BrowserInfo;
  const broker = {
    open: () => {
      opens++;
      return Promise.resolve(id);
    },
    run: <T>(
      _scope: BrowserSessionScope,
      _session: string,
      operation: (browser: BrowserInfo) => Promise<T>,
    ) => operation(browser),
    close: () => (options.cleanupFails ? Promise.reject(new Error('cleanup')) : Promise.resolve()),
  };
  return { store, broker, results, counts: () => ({ authorizations, writes, opens }) };
}
test('a cached confirmed price result does not start another browser or price save', async () => {
  const f = fixture({ cached: true });
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'confirmed');
  assert.equal(f.counts().opens, 0);
  assert.equal(f.counts().writes, 0);
});
test('the live permission check runs before saving and the confirmed amount is preserved', async () => {
  const f = fixture();
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.priceCents, 2000);
  assert.equal(f.counts().writes, 1);
  assert.ok(f.counts().authorizations >= 2);
  assert.deepEqual(f.results, [result]);
});
test('revocation before saving prevents the price write', async () => {
  const f = fixture({ revoked: true });
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'failed');
  assert.equal(f.counts().writes, 0);
});
test('a lost result after a potential save is reported as unknown', async () => {
  const f = fixture({ uncertain: true });
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(f.counts().writes, 1);
});

test('a changed provider price stops saving and preserves an earlier uncertain outcome', async () => {
  const f = fixture({ conflict: true, previousOutcomeUnknown: true });
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'conflict');
  assert.equal(result.currentPriceCents, 2300);
  assert.equal(result.previousOutcomeUnknown, true);
  assert.equal(f.counts().writes, 0);
});
test('uncertain cleanup does not erase a confirmed external price', async () => {
  const f = fixture({ cleanupFails: true });
  const result = await runAiConnectionPrice('token', id, f.store, f.broker);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.cleanupPending, true);
});
test('only a verified MCP context can reach the private price dispatcher', async () => {
  const calls: { path: string; header: string | null; body: Record<string, unknown> }[] = [];
  const store = new AiConnectionPriceStore({
    url: 'https://api.example.test',
    publishableKey: 'public-key',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({
        path,
        header: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json(
        path.endsWith('ai_connection_context')
          ? { id, session_id: id, access_mode: 'edit' }
          : {
              grantId: id,
              authSessionId: id,
              workspaceId: id,
              connectionId: id,
              userId: id,
              entryId: id,
              attemptId: id,
              expectedPriceCents: 2500,
              priceCents: 2000,
            },
      );
    },
  });
  const result = await store.begin('delegated-token', id);
  assert.ok('scope' in result);
  if (!('scope' in result)) return;
  assert.equal(result.scope.userAccessToken, '');
  assert.equal(result.scope.aiPrice?.grantId, id);
  assert.equal(result.scope.aiPrice?.attemptId, id);
  await store.call(result.scope.aiPrice!, 'finish', null, { status: 'confirmed' });
  assert.equal(calls[2]?.body['p_attempt_id'], id);
  assert.deepEqual(
    calls.slice(0, 2).map((call) => call.path),
    ['/rest/v1/rpc/ai_connection_context', '/rest/v1/rpc/ai_connection_price_worker'],
  );
  assert.equal(calls[0]?.header, 'Bearer delegated-token');
  assert.equal(calls[1]?.header, 'Bearer server-key');
});
