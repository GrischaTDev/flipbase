import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VintedEditAccess } from '../src/vinted-edit-access.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';

const scope: BrowserSessionScope = {
  workspaceId: '25600000-0000-4000-8000-000000000011',
  connectionId: '25600000-0000-4000-8000-000000000021',
  userId: '25600000-0000-4000-8000-000000000001',
  userAccessToken: 'test-token',
};

test('liest nur den RLS-geschützten Eintrag desselben Workspace und Kontos', async () => {
  const paths: string[] = [];
  const access = new VintedEditAccess({
    url: 'https://database.example',
    publishableKey: 'public-key',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
      assert.equal(new Headers(init?.headers).get('apikey'), 'public-key');
      assert.equal(url.searchParams.get('workspace_id'), `eq.${scope.workspaceId}`);
      if (url.pathname.endsWith('/marketplace_connections'))
        return Response.json([
          { external_account_id: '789', status: 'connected', execution_mode: 'cloud' },
        ]);
      assert.equal(url.searchParams.get('connection_id'), `eq.${scope.connectionId}`);
      assert.equal(url.searchParams.get('kind'), 'eq.publication');
      assert.equal(url.searchParams.get('id'), 'eq.25600000-0000-4000-8000-000000000041');
      return Response.json([{ external_id: '12345' }]);
    },
  });
  assert.deepEqual(
    await access.entry(scope, 'publication', '25600000-0000-4000-8000-000000000041'),
    {
      externalId: '12345',
      accountId: '789',
    },
  );
  assert.equal(paths.length, 2);
});

test('startet keinen Eintragszugriff für fremde oder nicht verbundene Konten', async () => {
  let requests = 0;
  const access = new VintedEditAccess({
    url: 'https://database.example',
    publishableKey: 'public-key',
    fetch: async () => {
      requests++;
      return Response.json([]);
    },
  });
  await assert.rejects(access.entry(scope, 'publication', '25600000-0000-4000-8000-000000000041'));
  assert.equal(requests, 1);
});

test('lehnt lokale Lesekonten vor jedem Schreibzugriff ab', async () => {
  let requests = 0;
  const access = new VintedEditAccess({
    url: 'https://database.example',
    publishableKey: 'public-key',
    fetch: async (input) => {
      requests++;
      assert.equal(
        new URL(String(input)).searchParams.get('select'),
        'external_account_id,status,execution_mode',
      );
      return Response.json([
        { external_account_id: '789', status: 'connected', execution_mode: 'local' },
      ]);
    },
  });
  await assert.rejects(access.entry(scope, 'publication', '25600000-0000-4000-8000-000000000041'));
  assert.equal(requests, 1);
});
