import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasVerifiedCapability,
  validateMarketplaceCommand,
} from './marketplace-command-validation.ts';

const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const request = (action = 'profile.read', payload: unknown = {}) => ({
  scope: { ...scope },
  requestId: 'request-1',
  action,
  payload,
});

function expectInvalid(input: unknown, field: string): void {
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.field, field);
}

test('rejectsMissingConnection', () => {
  expectInvalid({ ...request(), scope: { workspaceId: 'workspace-a' } }, 'scope.connectionId');
});

test('rejectsMissingWorkspace', () => {
  expectInvalid({ ...request(), scope: { connectionId: 'connection-a' } }, 'scope.workspaceId');
});

test('rejectsUnknownAction', () => {
  expectInvalid(request('browser.evaluate', { script: 'secret' }), 'action');
});

for (const value of [null, [], 'request', 42]) {
  test(`rejectsNonObjectRequest: ${JSON.stringify(value)}`, () => {
    expectInvalid(value, 'request');
  });
}

for (const value of ['', '   ', ' request-1', 'request-1 ', 'x'.repeat(129)]) {
  test(`rejectsInvalidRequestId: ${JSON.stringify(value)}`, () => {
    expectInvalid({ ...request(), requestId: value }, 'requestId');
  });
}

test('rejectsClientSuppliedActor', () => {
  expectInvalid({ ...request(), actor: { userId: 'someone-else' } }, 'request');
});

test('rejectsClientSuppliedProviderToken', () => {
  expectInvalid({ ...request(), providerToken: 'do-not-log-this' }, 'request');
});

test('rejectsExtraScopeFields', () => {
  expectInvalid({ ...request(), scope: { ...scope, userId: 'someone-else' } }, 'scope');
});

test('rejectsMissingPayload', () => {
  const { payload: _payload, ...withoutPayload } = request();
  expectInvalid(withoutPayload, 'payload');
});

test('rejectsArrayPayload', () => expectInvalid(request('profile.read', []), 'payload'));

test('rejectsUnexpectedReadPayload', () => {
  expectInvalid(request('profile.read', { url: 'http://internal.invalid' }), 'payload');
});

for (const action of ['profile.read', 'listings.read', 'conversations.read', 'sales.read']) {
  test(`acceptsReadCommand: ${action}`, () => {
    const input = request(action);
    const result = validateMarketplaceCommand(input);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.command, input);
  });
}

test('acceptsBoundedPagination', () => {
  const input = request('listings.read', { cursor: 'page-2', limit: 100 });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.command, input);
});

for (const limit of [0, -1, 101, 1.5, '10', Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rejectsInvalidPageSize: ${String(limit)}`, () => {
    expectInvalid(request('listings.read', { limit }), 'payload.limit');
  });
}

test('rejectsEmptyCursor', () => {
  expectInvalid(request('conversations.read', { cursor: '' }), 'payload.cursor');
});

test('acceptsMetricsForOnePublication', () => {
  const input = request('metrics.read', { publicationId: 'publication-1' });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.command, input);
});

test('rejectsMetricsWithoutPublication', () => {
  expectInvalid(request('metrics.read'), 'payload.publicationId');
});

test('preservesTextIncludingWhitespaceAndUnicode', () => {
  const input = request('messages.sendText', {
    conversationId: 'conversation-1',
    text: '  Hallo!\nPasst Größe M? 👋  ',
  });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.command, input);
});

for (const text of ['', '  \n\t ', 'x'.repeat(5001), 42, null]) {
  test(`rejectsInvalidText: ${typeof text}-${String(text).length}`, () => {
    expectInvalid(
      request('messages.sendText', { conversationId: 'conversation-1', text }),
      'payload.text',
    );
  });
}

test('rejectsMessageWithoutConversation', () => {
  expectInvalid(request('messages.sendText', { text: 'Hallo' }), 'payload.conversationId');
});

test('acceptsPublishReferenceToSavedListing', () => {
  const input = request('listings.publish', { listingId: 'listing-1' });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.command, input);
});

test('acceptsUpdateReferences', () => {
  const input = request('listings.update', {
    listingId: 'listing-1',
    publicationId: 'publication-1',
  });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.command, input);
});

test('rejectsUpdateWithoutPublication', () => {
  expectInvalid(request('listings.update', { listingId: 'listing-1' }), 'payload.publicationId');
});

test('rejectsPublishWithoutListing', () => {
  expectInvalid(request('listings.publish'), 'payload.listingId');
});

test('rejectsArbitraryBrowserArguments', () => {
  expectInvalid(request('listings.publish', { listingId: 'listing-1', selector: '#publish' }), 'payload');
});

test('doesNotIncludeInputSecretsInErrors', () => {
  const result = validateMarketplaceCommand({ ...request(), providerToken: 'super-secret-token' });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('super-secret-token'), false);
});

test('snapshotsScopeAndPayloadBeforeCallerMutation', () => {
  const input = request('messages.sendText', { conversationId: 'conversation-1', text: 'Hallo' });
  const result = validateMarketplaceCommand(input);
  assert.equal(result.ok, true);
  input.scope.connectionId = 'connection-b';
  (input.payload as { text: string }).text = 'Andere Nachricht';
  if (result.ok) {
    assert.deepEqual(result.command.scope, scope);
    assert.deepEqual(result.command.payload, { conversationId: 'conversation-1', text: 'Hallo' });
  }
});

test('rejectsInheritedRequestFields', () => {
  expectInvalid(Object.create(request()), 'request');
});

test('rejectsPrototypePayloadKeys', () => {
  expectInvalid(request('profile.read', JSON.parse('{"__proto__":{"role":"admin"}}')), 'payload');
});

for (const state of ['unknown', 'unsupported', 'blocked'] as const) {
  test(`doesNotTreatUnknownAsVerified: ${state}`, () => {
    assert.equal(hasVerifiedCapability({ 'messages.sendText': state }, 'messages.sendText'), false);
  });
}

test('missingCapabilityIsNotVerified', () => {
  assert.equal(hasVerifiedCapability({}, 'messages.sendText'), false);
});

test('onlyExplicitlyVerifiedCapabilityIsAvailable', () => {
  assert.equal(hasVerifiedCapability({ 'messages.sendText': 'verified' }, 'messages.sendText'), true);
});
