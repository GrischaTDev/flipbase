import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { parseVintedInboxEvents } from '../src/vinted-inbox-events.ts';

const require = createRequire(import.meta.url);
const extension: {
  parse: (
    ...args: Parameters<typeof parseVintedInboxEvents>
  ) => Promise<ReturnType<typeof parseVintedInboxEvents>>;
} = require('../../../tools/flipbase-extension/vinted-local-inbox-events.js');
interface Fixture {
  conversation: {
    id: number;
    opposite_user: { id: number };
    messages: {
      id?: number;
      entity_type: string;
      created_at_ts: string;
      entity: { id?: number; user_id: number };
    }[];
  };
}
const fixture: Fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/vinted-inbox-events/unread-conversation.json', import.meta.url),
    'utf8',
  ),
);
const observedAt = '2026-10-08T09:00:00.000Z';
const parse = (snapshot: unknown) => parseVintedInboxEvents(snapshot, '90', observedAt);
function message(snapshot: Fixture, index: number) {
  const entry = snapshot.conversation.messages[index];
  assert.ok(entry);
  return entry;
}

test('verified unread snapshot identifies both incoming proposal and text without private content', () => {
  assert.deepEqual(parse(fixture), {
    observedAt,
    complete: true,
    coveredConversationIds: ['700'],
    events: [
      {
        externalId: 'offer_request_message:501',
        externalConversationId: '700',
        occurredAt: '2026-10-08T08:00:00.000Z',
        direction: 'inbound',
        source: 'conversation_snapshot',
      },
      {
        externalId: 'message:502',
        externalConversationId: '700',
        occurredAt: '2026-10-08T08:01:00.000Z',
        direction: 'inbound',
        source: 'conversation_snapshot',
      },
    ],
  });
});

test('list revisions and legacy sender placeholders never invent incoming events', () => {
  for (const input of [
    { conversations: [{ id: 700, unread: true, updated_at: observedAt }] },
    { conversations: [{ id: 'placeholder', last_message: { id: 'uuid', sender_id: '0' } }] },
  ]) {
    assert.deepEqual(parse(input).events, []);
    assert.equal(parse(input).complete, false);
  }
});

test('outbound and unknown event types stay silent; valid empty snapshots establish a reference', () => {
  const snapshot = structuredClone(fixture);
  message(snapshot, 0).entity.user_id = 90;
  message(snapshot, 1).entity_type = 'system_message';
  const batch = parse(snapshot);
  assert.deepEqual(batch.events, []);
  assert.equal(batch.complete, true);
  assert.deepEqual(batch.coveredConversationIds, ['700']);
});

test('invalid incoming identities, timestamps and incomplete histories never complete a baseline', async () => {
  const cases = [
    (snapshot: typeof fixture) => {
      delete message(snapshot, 0).id;
    },
    (snapshot: typeof fixture) => {
      message(snapshot, 0).entity.user_id = 92;
    },
    (snapshot: typeof fixture) => {
      message(snapshot, 0).created_at_ts = '2026-02-30T10:00:00+02:00';
    },
    (snapshot: typeof fixture) => {
      message(snapshot, 0).created_at_ts = 'not a time';
    },
    (snapshot: typeof fixture) => {
      snapshot.conversation.opposite_user.id = 90;
    },
    (snapshot: typeof fixture) => {
      snapshot.conversation.messages = Array.from({ length: 201 }, () => message(fixture, 0));
    },
    (snapshot: typeof fixture) => {
      message(snapshot, 0).created_at_ts = '2026-10-09T10:00:00+02:00';
    },
  ];
  for (const change of cases) {
    const snapshot = structuredClone(fixture);
    change(snapshot);
    assert.equal(parse(snapshot).complete, false);
    assert.deepEqual(parse(snapshot).coveredConversationIds, []);
    assert.deepEqual(await extension.parse(snapshot, '90', observedAt), parse(snapshot));
  }
});

test('stable event ids deduplicate repeated source rows while conflicting identities fail closed', () => {
  const repeated = structuredClone(fixture);
  repeated.conversation.messages.push(structuredClone(message(repeated, 1)));
  assert.equal(parse(repeated).events.length, 2);
  assert.equal(parse(repeated).complete, true);
  const conflict = structuredClone(repeated);
  message(conflict, 2).created_at_ts = '2026-10-08T10:02:00+02:00';
  assert.equal(parse(conflict).complete, false);
});

test('cloud and extension use identical verified fixtures', async () => {
  assert.deepEqual(await extension.parse(fixture, '90', observedAt), parse(fixture));
  assert.deepEqual(parseVintedInboxEvents(fixture, '0', observedAt).events, []);
  assert.equal(parseVintedInboxEvents(fixture, '90', 'bad').complete, false);
});

test('cloud and extension include provider transaction and system messages without inventing a sale classification', async () => {
  const messages = ['status_message', 'action_message', 'payment_message'].map(
    (entity_type, index) => ({
      entity_type,
      event_group: 'sale',
      event_type: 'success_preparing_shipment',
      created_at_ts: `2026-10-08T08:0${index}:00Z`,
      entity: { title: 'Verkauft', body: 'Synthetische Transaktionsmeldung' },
    }),
  );
  const snapshot = { conversation: { ...fixture.conversation, messages } };
  const result = parse(snapshot);
  assert.equal(result.complete, true);
  assert.equal(result.events.length, 3);
  assert.deepEqual(result.coveredConversationIds, ['700']);
  for (const [index, event] of result.events.entries()) {
    assert.match(
      event.externalId,
      new RegExp(`^${messages[index]?.entity_type}:event:[a-f0-9]{64}$`),
    );
    assert.deepEqual(Object.keys(event).sort(), [
      'direction',
      'externalConversationId',
      'externalId',
      'occurredAt',
      'source',
    ]);
  }
  assert.ok(!JSON.stringify(result).includes('Verkauft'));
  assert.deepEqual(await extension.parse(snapshot, '90', observedAt), result);
  const repeated = {
    conversation: {
      ...snapshot.conversation,
      messages: [...messages, { ...messages[0], template: 'Changed presentation' }],
    },
  };
  assert.deepEqual(parse(repeated), result);
  assert.deepEqual(await extension.parse(repeated, '90', observedAt), result);
});

test('system notices keep explicit provider ids and reject own, foreign or invalid event evidence', async () => {
  const notice = {
    id: 503,
    entity_type: 'payment_message',
    created_at_ts: '2026-10-08T08:02:00Z',
    entity: { title: 'Zahlung', user_id: 91 },
  };
  const snapshot = (message: unknown) => ({
    conversation: { ...fixture.conversation, messages: [message] },
  });
  assert.equal(parse(snapshot(notice)).events[0]?.externalId, 'payment_message:503');
  const own = parse(snapshot({ ...notice, entity: { ...notice.entity, user_id: 90 } }));
  assert.deepEqual(own.events, []);
  assert.equal(own.complete, true);
  const ownSystem = snapshot({ ...notice, entity: { title: 'Zahlung', sender_id: 90 } });
  assert.deepEqual(parse(ownSystem).events, []);
  assert.deepEqual(await extension.parse(ownSystem, '90', observedAt), parse(ownSystem));
  for (const invalid of [
    { ...notice, id: 0 },
    { ...notice, entity: { ...notice.entity, user_id: 92 } },
    { ...notice, created_at_ts: '2026-10-09T08:02:00Z' },
    { ...notice, created_at_ts: '2026-02-30T08:02:00Z' },
    { ...notice, entity: null },
  ]) {
    const result = parse(snapshot(invalid));
    assert.deepEqual(result.events, []);
    assert.equal(result.complete, false);
    assert.deepEqual(await extension.parse(snapshot(invalid), '90', observedAt), result);
  }
});
