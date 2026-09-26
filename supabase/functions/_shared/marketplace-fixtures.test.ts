import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarketplaceFixtures } from '../../../src/app/features/marketplaces/testing/marketplace-fixtures.ts';

test('fixtureRecordsCarryWorkspaceAndConnection', () => {
  const fixtures = createMarketplaceFixtures();
  for (const record of [...fixtures.publications, ...fixtures.conversations]) {
    const connection = fixtures.connections.find((item) => item.connectionId === record.connectionId);
    assert.ok(connection);
    assert.equal(record.workspaceId, connection.workspaceId);
  }
});

test('fixtureAccountsHaveDistinctIdentifiers', () => {
  const fixtures = createMarketplaceFixtures();
  assert.equal(new Set(fixtures.connections.map((item) => item.connectionId)).size, 2);
  assert.equal(new Set(fixtures.publications.map((item) => item.id)).size, 2);
  assert.equal(new Set(fixtures.conversations.map((item) => item.id)).size, 2);
});

test('fixtureAccountBCannotSendMessages', () => {
  const fixtures = createMarketplaceFixtures();
  assert.ok(fixtures.connections[0].allowedActions.includes('messages.sendText'));
  assert.equal(fixtures.connections[1].allowedActions.includes('messages.sendText'), false);
});

test('unavailableFixtureMetricsRemainDifferentFromZero', () => {
  const fixtures = createMarketplaceFixtures();
  assert.equal(fixtures.publications[0].metrics.views, 0);
  assert.equal(fixtures.publications[1].metrics.views, null);
  assert.equal(fixtures.publications[1].metrics.favorites, null);
});

test('fixtureCallsDoNotShareMutableObjects', () => {
  const first = createMarketplaceFixtures();
  const second = createMarketplaceFixtures();
  assert.notStrictEqual(first.connections[0], second.connections[0]);
  assert.notStrictEqual(first.connections[0].capabilities, second.connections[0].capabilities);
  assert.notStrictEqual(first.connections[0].allowedActions, second.connections[0].allowedActions);
  assert.notStrictEqual(first.publications[0].metrics, second.publications[0].metrics);
});
