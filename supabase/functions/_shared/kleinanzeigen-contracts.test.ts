import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseKleinanzeigenAccountRequest,
  parseKleinanzeigenExtensionRequest,
  parseKleinanzeigenExtensionSession,
} from './kleinanzeigen-contracts.ts';
const scope = {
  workspaceId: '49000000-0000-4000-8000-000000000011',
  connectionId: '9007199254740993',
  generation: 1,
};
test('Kleinanzeigen IDs remain exact decimal strings across both endpoint contracts', () => {
  assert.deepEqual(parseKleinanzeigenExtensionRequest({ action: 'heartbeat', ...scope }), {
    action: 'heartbeat',
    ...scope,
  });
  assert.deepEqual(
    parseKleinanzeigenAccountRequest({
      action: 'disconnect',
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
    }),
    { action: 'disconnect', workspaceId: scope.workspaceId, connectionId: scope.connectionId },
  );
});
test('installation replies cannot change the scope or add secrets', () => {
  const value = {
    ...scope,
    externalAccountId: '123',
    canPublish: false,
    expiresAt: '2026-10-17T06:00:00Z',
  };
  assert.deepEqual(
    parseKleinanzeigenExtensionSession(value, { action: 'heartbeat', ...scope }),
    value,
  );
  for (const change of [
    { connectionId: '2' },
    { generation: 2 },
    { workspaceId: 'other' },
    { secret: 'private' },
    { expiresAt: 'bad' },
  ])
    assert.equal(
      parseKleinanzeigenExtensionSession(
        { ...value, ...change },
        { action: 'heartbeat', ...scope },
      ),
      null,
    );
});
test('numeric, padded, oversized and missing IDs are never coerced', () => {
  for (const connectionId of [9007199254740992, '01', '0', '-1', '9223372036854775808', null]) {
    assert.equal(
      parseKleinanzeigenExtensionRequest({ action: 'heartbeat', ...scope, connectionId }),
      null,
    );
    assert.equal(
      parseKleinanzeigenAccountRequest({
        action: 'disconnect',
        workspaceId: scope.workspaceId,
        connectionId,
      }),
      null,
    );
  }
});
