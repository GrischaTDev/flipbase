import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.ts';
import { PushDispatcher, validatePayload } from '../src/push-dispatcher.ts';
import type {
  PushDeliveryStore,
  PushClaim,
  AuthorizedDelivery,
} from '../src/push-delivery-store.ts';
import type { PushProviderResult } from '../src/push-provider.ts';
import { createPushDeliveryStore } from '../src/push-delivery-store.ts';
const payload = {
  version: 1,
  eventId: 'a7000000-0000-4000-8000-000000000001',
  workspaceId: 'a7000000-0000-4000-8000-000000000002',
  category: 'test',
  title: 'Flipbase',
  body: 'Deine Testbenachrichtigung ist angekommen.',
  target: { kind: 'settings' },
};
const delivery: AuthorizedDelivery = {
  endpoint: 'https://fcm.googleapis.com/a',
  p256dh: 'test',
  auth: 'test',
  keyId: 'v1',
  payload,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
function fixture(overrides: Partial<PushDeliveryStore> = {}) {
  const finished: PushProviderResult[] = [];
  const store: PushDeliveryStore = {
    claim: async () =>
      Array.from({ length: 20 }, (_, index) => ({
        id: String(index),
        binding_generation: 'generation',
        claim_token: 'token',
      })),
    authorize: async () => delivery,
    finish: async (_claim, result) => {
      finished.push(result);
      return true;
    },
    health: async () => ({}),
    cleanup: async () => undefined,
    ...overrides,
  };
  return { store, finished };
}
test('ausgeschaltet fordert keine Claims an', async () => {
  const { store } = fixture({
    claim: async () => {
      throw new Error('must not claim');
    },
  });
  await new PushDispatcher(readConfig({}), store, {
    send: async () => {
      throw new Error('must not send');
    },
  }).dispatch();
});
test('maximal vier Sends parallel und jeder Auftrag unmittelbar vorher autorisiert', async () => {
  let active = 0;
  let maxActive = 0;
  let authorized = 0;
  let sent = 0;
  const { store, finished } = fixture({
    authorize: async () => {
      authorized++;
      return delivery;
    },
  });
  await new PushDispatcher({ ...readConfig({}), enabled: true, keyId: 'v1' }, store, {
    send: async () => {
      assert.ok(authorized > sent++);
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return { status: 'accepted' };
    },
  }).dispatch();
  assert.equal(maxActive, 4);
  assert.equal(finished.length, 20);
});

test('langsamer Normalversand bestaetigt alle Claims innerhalb ihrer 60-Sekunden-Lease', async (context) => {
  let now = Date.parse('2026-10-13T12:00:00Z');
  context.mock.method(Date, 'now', () => now);
  let claimLimit = 4;
  let maxClaimed = 0;
  let activeSends = 0;
  let maxActiveSends = 0;
  const timers: { at: number; resolve: () => void }[] = [];
  const wait = (milliseconds: number) =>
    new Promise<void>((resolve) => timers.push({ at: now + milliseconds, resolve }));
  const pending = Array.from({ length: 20 }, (_, index) => ({
    id: `47200000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    binding_generation: '47200000-0000-4000-8000-000000000101',
    claim_token: '47200000-0000-4000-8000-000000000102',
  }));
  const leaseEnds = new Map<string, number>();
  const confirmed = new Set<string>();
  const providerAcceptances = new Map<string, number>();
  const rejectedFinishes: string[] = [];
  context.mock.method(
    globalThis,
    'fetch',
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const name = String(input).split('/').pop();
      const parameters = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (name === 'web_push_claim') {
        const claims = pending.filter((claim) => !confirmed.has(claim.id)).slice(0, claimLimit);
        for (const claim of claims) leaseEnds.set(claim.id, now + 60000);
        maxClaimed = Math.max(maxClaimed, claims.length);
        return Response.json(claims);
      }
      const id = String(parameters.p_delivery_id);
      await wait(2000);
      if (name === 'web_push_authorize')
        return Response.json(
          now < (leaseEnds.get(id) ?? 0)
            ? {
                ...delivery,
                endpoint: `${delivery.endpoint}/${id}`,
                expiresAt: '2026-10-14T12:00:00Z',
              }
            : null,
        );
      assert.equal(name, 'web_push_finish');
      assert.equal(parameters.p_result, 'accepted');
      if (now < (leaseEnds.get(id) ?? 0)) {
        confirmed.add(id);
        return Response.json(true);
      }
      rejectedFinishes.push(id);
      return Response.json(false);
    },
  );
  const config = {
    ...readConfig({}),
    enabled: true,
    keyId: 'v1',
    supabaseUrl: 'https://database.test',
    serviceKey: 'test-server-key',
  };
  const store = createPushDeliveryStore(config);
  const provider = {
    send: async (subscription: { endpoint: string }): Promise<PushProviderResult> => {
      const id = subscription.endpoint.split('/').pop() ?? '';
      activeSends++;
      maxActiveSends = Math.max(maxActiveSends, activeSends);
      await wait(10000);
      activeSends--;
      providerAcceptances.set(id, (providerAcceptances.get(id) ?? 0) + 1);
      return { status: 'accepted' };
    },
  };
  async function dispatchAndAdvance(dispatcher: PushDispatcher) {
    let settled = false;
    const processing = dispatcher.dispatch().finally(() => {
      settled = true;
    });
    while (!settled) {
      // Promiseketten vollständig abarbeiten, bevor die nächste virtuelle Deadline verstreicht.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (settled) break;
      const nextDeadline = Math.min(...timers.map((timer) => timer.at));
      assert.ok(Number.isFinite(nextDeadline), 'A pending dispatch must have a timed operation');
      now = nextDeadline;
      const due = timers.filter((timer) => timer.at === now);
      for (const timer of due) {
        timers.splice(timers.indexOf(timer), 1);
        timer.resolve();
      }
    }
    await processing;
  }
  // Gegenprobe: der frühere Store akzeptierte alle 20 SQLclaims und schickte fünf Wellen.
  claimLimit = 20;
  const oldStore = {
    ...store,
    claim: async (): Promise<PushClaim[]> =>
      (await (
        await fetch(`${config.supabaseUrl}/rest/v1/rpc/web_push_claim`, { body: '{}' })
      ).json()) as PushClaim[],
  };
  await dispatchAndAdvance(new PushDispatcher(config, oldStore, provider));
  assert.equal(providerAcceptances.size, 20);
  assert.equal(confirmed.size, 16);
  assert.equal(rejectedFinishes.length, 4);
  await dispatchAndAdvance(new PushDispatcher(config, oldStore, provider));
  assert.equal([...providerAcceptances.values()].filter((count) => count === 2).length, 4);

  confirmed.clear();
  providerAcceptances.clear();
  rejectedFinishes.length = 0;
  maxClaimed = 0;
  maxActiveSends = 0;
  claimLimit = 4;
  const dispatcher = new PushDispatcher(config, store, provider);
  for (let batch = 0; batch < 5; batch++) await dispatchAndAdvance(dispatcher);
  assert.equal(maxClaimed, 4);
  assert.equal(maxActiveSends, 4);
  assert.equal(confirmed.size, 20);
  assert.equal(dispatcher.counters.accepted, 20);
  assert.deepEqual(rejectedFinishes, []);
  assert.equal(
    [...providerAcceptances.values()].every((count) => count === 1),
    true,
  );
  await dispatchAndAdvance(dispatcher);
  assert.equal(providerAcceptances.size, 20);
  assert.equal(timers.length, 0);
});
test('Rechteentzug und fremder Key erreichen Sender nicht; Keyfehler widerruft nicht', async () => {
  const { store, finished } = fixture({
    claim: async () => [
      { id: '1', binding_generation: 'g', claim_token: 'a' },
      { id: '2', binding_generation: 'g', claim_token: 'b' },
    ],
    authorize: async (claim: PushClaim) =>
      claim.id === '1' ? null : { ...delivery, keyId: 'old' },
  });
  await new PushDispatcher({ ...readConfig({}), enabled: true, keyId: 'v1' }, store, {
    send: async () => {
      throw new Error('must not send');
    },
  }).dispatch();
  assert.deepEqual(finished, [{ status: 'configuration_error' }]);
});

test('ein Datenbankfehler beendet den Batch erst nach den noch laufenden Sends', async () => {
  let release: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { store } = fixture({
    authorize: async (claim) => {
      if (claim.id === '0') throw new Error('database');
      return delivery;
    },
  });
  let didSettle = false;
  const processing = new PushDispatcher({ ...readConfig({}), enabled: true, keyId: 'v1' }, store, {
    send: async () => {
      await blocked;
      return { status: 'accepted' };
    },
  })
    .dispatch()
    .catch(() => undefined)
    .finally(() => {
      didSettle = true;
    });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      didSettle,
      false,
      'Next poll must not overlap outstanding sends after an RPC failure',
    );
  } finally {
    release();
    await processing;
  }
});
test('ungueltiges Ablaufdatum ist Konfigurationsfehler und deaktiviert kein Geraet', async () => {
  const { store, finished } = fixture({
    claim: async () => [{ id: '1', binding_generation: 'g', claim_token: 'a' }],
    authorize: async () => ({ ...delivery, expiresAt: 'invalid' }),
  });
  await new PushDispatcher({ ...readConfig({}), enabled: true, keyId: 'v1' }, store, {
    send: async () => ({ status: 'accepted' }),
  }).dispatch();
  assert.deepEqual(finished, [{ status: 'configuration_error' }]);
});
test('Payload erlaubt nur strukturierte interne Ziele', () => {
  assert.equal(validatePayload(payload), true);
  for (const target of [
    { kind: '__proto__' },
    { kind: 'constructor' },
    { kind: 'settings', url: 'https://evil.test' },
    { kind: 'vinted_message', connectionId: '../../a', conversationId: 'a' },
    { kind: 'connection' },
  ])
    assert.equal(validatePayload({ ...payload, target }), false);
  assert.equal(validatePayload({ ...payload, category: 'order' }), false);
});
test('Ereignisablauf deaktiviert kein noch gueltiges Subscription', async () => {
  const { store, finished } = fixture({
    claim: async () => [{ id: '1', binding_generation: 'g', claim_token: 'a' }],
    authorize: async () => ({ ...delivery, expiresAt: new Date(Date.now() - 1000).toISOString() }),
  });
  await new PushDispatcher({ ...readConfig({}), enabled: true, keyId: 'v1' }, store, {
    send: async () => {
      throw new Error('must not send');
    },
  }).dispatch();
  assert.deepEqual(finished, [{ status: 'retry', retryAfterMs: 0 }]);
});
test('Konfiguration laesst Versand nur explizit frei und begrenzt Pilot IDs', () => {
  assert.equal(readConfig({}).enabled, false);
  assert.equal(readConfig({}).allowAll, false);
  assert.throws(() => readConfig({ WEB_PUSH_ENABLED: 'TRUE' }));
  assert.throws(() => readConfig({ WEB_PUSH_ENABLED: 'true' }));
  assert.throws(() => readConfig({ WEB_PUSH_PILOT_DEVICE_IDS: 'evil' }));
  assert.deepEqual(readConfig({ WEB_PUSH_PILOT_DEVICE_IDS: payload.eventId }).pilotDevices, [
    payload.eventId,
  ]);
});
test('favorites accept only a UUID Vinted connection and matching category', () => {
  const favorite = {
    ...payload,
    category: 'favorite',
    target: { kind: 'vinted_favorites', connectionId: payload.workspaceId },
  };
  assert.equal(validatePayload(favorite), true);
  assert.equal(validatePayload({ ...favorite, category: 'message' }), false);
  assert.equal(
    validatePayload({ ...favorite, target: { ...favorite.target, connectionId: 'external' } }),
    false,
  );
  assert.equal(
    validatePayload({ ...favorite, target: { ...favorite.target, url: '/evil' } }),
    false,
  );
});
