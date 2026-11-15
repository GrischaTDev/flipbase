import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { MarketplaceBrowserDialog } from '../src/marketplace-browser-dialog.ts';
import {
  parseAccountActionClaim,
  SupabaseMarketplaceAccountActionStore,
} from '../src/supabase-marketplace-account-action-store.ts';

const workspaceId = '57100000-0000-4000-8000-000000000001',
  connectionId = '57100000-0000-4000-8000-000000000002',
  userId = '57100000-0000-4000-8000-000000000003',
  dialogId = '57100000-0000-4000-8000-000000000004',
  sessionId = '57100000-0000-4000-8000-000000000005',
  workerId = '57100000-0000-4000-8000-000000000006',
  runnerId = '57100000-0000-4000-8000-000000000007';
class ResponseStream extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  chunks: string[] = [];
  writeHead() {
    return this;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    if (!this.writableEnded) {
      this.writableEnded = true;
      this.emit('close');
    }
    return this;
  }
}
function fixture(startGate?: Promise<void>) {
  const calls: string[] = [],
    scope = { workspaceId, connectionId, userId, userAccessToken: 'ephemeral-user-token' };
  const store = new SupabaseMarketplaceAccountActionStore({
    url: 'https://db.example',
    serviceRoleKey: 'server',
    publishableKey: 'public',
    fetch: async () => Response.json(true),
  });
  store.rpc = async (_name, payload) => {
    calls.push(payload.p_connected ? 'present' : 'disconnected');
    return {
      connected: payload.p_connected,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
  };
  store.enqueue = async (_scope, requestId, kind, payload) => {
    assert.equal(requestId, dialogId);
    assert.equal(kind, 'cloud_session_open');
    assert.deepEqual(payload, { dialogId });
    calls.push('enqueue');
    return { action: { id: dialogId, state: 'queued' } };
  };
  store.finish = async (_scope, state) => {
    calls.push(state);
  };
  const service = new MarketplaceBrowserDialog({
    actions: store,
    profiles: {
      prepare: async () => {
        calls.push('prepare');
      },
    },
    wake: () => {
      calls.push('wake');
    },
    broker: {
      open: async () => {
        calls.push('start');
        await startGate;
        return sessionId;
      },
      close: async (scope) => {
        calls.push(scope.accountAction ? 'close-claim' : 'close-user');
      },
      discardUnstartedAction: async () => {
        calls.push('discard');
      },
      handoffAccountSession: async (_scope, _id, _dialog, token) => {
        assert.equal(token, scope.userAccessToken);
        calls.push('handoff');
      },
    },
  });
  const claim = parseAccountActionClaim(
    {
      actionId: dialogId,
      claimToken: sessionId,
      workspaceId,
      connectionId,
      userId,
      workerId,
      workerEpoch: 1,
      runnerId,
      sessionId,
      expiresAt: new Date(Date.now() + 90_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      actionKind: 'cloud_session_open',
      payload: { dialogId },
      target: { accountId: null, externalId: null, entryId: null, entryKind: null, body: null },
    },
    workerId,
    1,
    runnerId,
  );
  const response = new ResponseStream();
  return { service, scope, claim, response, calls, store };
}
test('connected reauthentication queues then hands the session to ephemeral user scope', async () => {
  const f = fixture();
  await f.service.connectPresence(f.scope, dialogId, f.response as unknown as ServerResponse);
  assert.ok(f.response.chunks[0]?.includes('event: dialog_ready'));
  await f.service.requestOpen(f.scope, dialogId);
  assert.equal(f.calls.includes('start'), false);
  await f.service.run(f.claim);
  assert.deepEqual(f.calls.slice(-3), ['start', 'handoff', 'succeeded']);
  f.response.end();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(f.calls.includes('close-user'));
});
test('a disconnected queued dialog cannot launch later', async () => {
  const f = fixture();
  await f.service.connectPresence(f.scope, dialogId, f.response as unknown as ServerResponse);
  await f.service.requestOpen(f.scope, dialogId);
  f.response.end();
  await f.service.run(f.claim);
  assert.equal(f.calls.includes('start'), false);
  assert.ok(f.calls.includes('discard'));
  assert.ok(f.calls.includes('failed'));
});
test('disconnect during browser startup closes only the claimed session without handoff', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const f = fixture(gate);
  await f.service.connectPresence(f.scope, dialogId, f.response as unknown as ServerResponse);
  const running = f.service.run(f.claim);
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.response.end();
  finish();
  await running;
  assert.ok(f.calls.includes('close-claim'));
  assert.equal(f.calls.includes('handoff'), false);
});

test('lost success ACK closes the handed-off user scope and preserves a confirmed server success', async () => {
  const f = fixture();
  f.store.finish = async (_scope, state) => {
    f.calls.push(state);
    if (state === 'succeeded') throw new Error('success reply lost');
  };
  f.store.read = async (scope, id) => {
    assert.equal(scope.userAccessToken, f.scope.userAccessToken);
    return { action: { id, state: 'succeeded', result: { id: sessionId } } };
  };
  await f.service.connectPresence(f.scope, dialogId, f.response as unknown as ServerResponse);
  await f.service.run(f.claim);
  assert.ok(f.calls.includes('close-user'));
  assert.equal(f.calls.includes('close-claim'), false);
  assert.equal(f.calls.includes('failed'), false);
  f.response.end();
});
