import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarketplaceBrowserWorkDispatch } from '../src/marketplace-browser-work-dispatch.ts';
import { SupabaseMarketplaceAccountActionStore } from '../src/supabase-marketplace-account-action-store.ts';
import { SupabaseMarketplaceSyncDispatchStore } from '../src/supabase-marketplace-sync-dispatch-store.ts';

const worker = '57000000-0000-4000-8000-000000000001',
  runner = '57000000-0000-4000-8000-000000000002';
function setup(result: unknown, fail = false) {
  const calls: Record<string, unknown>[] = [];
  const actions = new SupabaseMarketplaceAccountActionStore({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    fetch: async (input, options) => {
      assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/marketplace_browser_work_claim');
      calls.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
      if (fail) throw new Error('lost claim ACK');
      return Response.json(result);
    },
  });
  const sync = new SupabaseMarketplaceSyncDispatchStore({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    fetch: async () => {
      throw new Error('must not claim a fallback after central claim');
    },
  });
  return {
    dispatch: createMarketplaceBrowserWorkDispatch({
      actions,
      sync,
      includeScheduled: false,
      run: async () => undefined,
    }),
    calls,
  };
}
test('common selection claims all enabled work once and never reserves a second fallback', async () => {
  const { dispatch, calls } = setup(null);
  assert.equal(await dispatch.claim(worker, 1, runner), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.p_enabled_kinds, ['account_action', 'sync']);
  assert.equal(calls[0]?.p_include_scheduled, false);
});
test('lost central claim stops without another family claim', async () => {
  const { dispatch, calls } = setup(null, true);
  await assert.rejects(dispatch.claim(worker, 1, runner));
  assert.equal(calls.length, 1);
});
test('server cannot enable disabled listing writes through an unexpected claim', async () => {
  const { dispatch } = setup({ kind: 'listing', claim: {} });
  await assert.rejects(dispatch.claim(worker, 1, runner), /Unerlaubter Arbeitsauftrag/);
});
