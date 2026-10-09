import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseCloudIpPurchaseStore } from '../src/supabase-cloud-ip-purchase-store.ts';

const request = {
  workspaceId: '37100000-0000-4000-8000-000000000011',
  displayName: 'Cloud',
  requestId: '37100000-0000-4000-8000-000000000031',
};
test('purchase transitions use private credentials and the exact authorized setup request', async () => {
  const store = new SupabaseCloudIpPurchaseStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'private-db-key',
    fetch: async (input, options) => {
      assert.equal(
        String(input),
        'https://db.example.test/rest/v1/rpc/marketplace_cloud_ip_purchase',
      );
      assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer private-db-key');
      assert.deepEqual(JSON.parse(String(options?.body)), {
        p_action: 'claim',
        p_workspace_id: request.workspaceId,
        p_request_id: request.requestId,
        p_connection_id: null,
        p_display_name: 'Cloud',
        p_user_id: 'authorized-user',
        p_attempt_id: 'attempt',
        p_price_cents: 400,
        p_order_id: null,
      });
      return Response.json({ status: 'submit' });
    },
  });
  assert.deepEqual(
    await store.operation('claim', request, 'authorized-user', {
      attemptId: 'attempt',
      priceCents: 400,
    }),
    { status: 'submit' },
  );
});
test('provider secrets, invalid order IDs and unknown transitions never enter the purchase flow', async () => {
  for (const body of [
    { status: 'ordered', orderId: 'bad/id' },
    { status: 'submit', token: 'private' },
    { status: 'unexpected' },
  ]) {
    const store = new SupabaseCloudIpPurchaseStore({
      url: 'https://db.example.test',
      serviceRoleKey: 'private-db-key',
      fetch: async () => Response.json(body),
    });
    await assert.rejects(store.operation('inspect', request, 'authorized-user'), /nicht bestätigt/);
  }
});
