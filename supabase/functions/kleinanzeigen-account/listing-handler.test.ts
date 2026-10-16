import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kleinanzeigenJobFixture } from '../../test-support/kleinanzeigen-job-fixture.ts';
import { createKleinanzeigenAccountHandler } from './handler.ts';
const job = kleinanzeigenJobFixture();
const input = {
  action: 'listing_enqueue',
  workspaceId: job.workspaceId,
  connectionId: job.connectionId,
  draftId: job.draftId,
  expectedRevision: job.draftRevision,
  requestId: '51000000-0000-4000-8000-000000000061',
};
function request(body: unknown = input) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-account', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid.jwt.user-token',
      'content-type': 'application/json',
      origin: 'https://app.flipbase.de',
    },
    body: JSON.stringify(body),
  });
}
test('Auftrag läuft erst nach echter Nutzerprüfung und enthält keine Installationsdaten', async () => {
  let authenticated = false;
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => {
      authenticated = true;
      return true;
    },
    execute: async () => assert.fail('kein Kontozugriff'),
    executeJobs: async (token, parsed) => {
      assert.equal(authenticated, true);
      assert.equal(token, 'Bearer valid.jwt.user-token');
      assert.deepEqual(parsed, input);
      return job;
    },
  });
  const reply = await handler(request());
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), job);
});
test('Nicht authentifizierte Auftragsanfrage erreicht keine Foto- oder Datenbankarbeit', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => false,
    execute: async () => assert.fail(),
    executeJobs: async () => assert.fail(),
  });
  assert.equal((await handler(request())).status, 401);
});
test('Fremde oder unvollständige Auftragsantwort wird nicht als Annahme ausgegeben', async () => {
  for (const reply of [
    { ...job, connectionId: '10' },
    { ...job, draftRevision: 3 },
    { ...job, claimTokenHash: 'secret' },
    { ...job, state: 'confirmed' },
  ]) {
    const handler = createKleinanzeigenAccountHandler({
      authenticate: async () => true,
      execute: async () => assert.fail(),
      executeJobs: async () => reply,
    });
    assert.equal((await handler(request())).status, 502);
  }
});
test('Statusabfrage darf keine Antwort eines anderen Auftrags verwenden', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => true,
    execute: async () => assert.fail(),
    executeJobs: async () => job,
  });
  assert.equal(
    (
      await handler(
        request({
          action: 'listing_status',
          workspaceId: job.workspaceId,
          connectionId: job.connectionId,
          jobId: '13',
        }),
      )
    ).status,
    502,
  );
});

test('Neu geöffneter Entwurf kann den letzten Auftrag oder einen eindeutig leeren Stand lesen', async () => {
  for (const reply of [job, null]) {
    const handler = createKleinanzeigenAccountHandler({
      authenticate: async () => true,
      execute: async () => assert.fail(),
      executeJobs: async () => reply,
    });
    const response = await handler(
      request({
        action: 'listing_latest',
        workspaceId: job.workspaceId,
        connectionId: job.connectionId,
        draftId: job.draftId,
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), reply);
  }
});
