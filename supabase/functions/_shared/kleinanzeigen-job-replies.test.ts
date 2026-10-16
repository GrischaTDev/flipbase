import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { kleinanzeigenJobFixture } from '../../test-support/kleinanzeigen-job-fixture.ts';
import { parseKleinanzeigenDraftContent } from './kleinanzeigen-listing-validation.mts';
import { parseKleinanzeigenInstallJobReply } from './kleinanzeigen-job-contracts.ts';
const job = kleinanzeigenJobFixture();
const base = {
  workspaceId: job.workspaceId,
  connectionId: job.connectionId,
  generation: 2,
  jobId: job.id,
  claimToken: 'c'.repeat(64),
};
const until = new Date(Date.now() + 120000).toISOString();
const absolute = new Date(Date.now() + 900000).toISOString();
Deno.test('Claimantwort bindet Originalversuch und hat keine zusätzlichen Secrets', () => {
  const input = { action: 'job_claim' as const, ...base };
  const reply = {
    ...job,
    state: 'claimed',
    version: 2,
    claimToken: base.claimToken,
    leaseUntil: until,
    absoluteExpiresAt: absolute,
  };
  assertEquals<unknown>(
    parseKleinanzeigenInstallJobReply(reply, input, parseKleinanzeigenDraftContent),
    reply,
  );
  for (const changed of [
    { ...reply, claimToken: 'd'.repeat(64) },
    { ...reply, claimInstallationHash: 'secret' },
    { ...reply, id: '13' },
    { ...reply, grantGeneration: 3 },
  ])
    assertEquals(
      parseKleinanzeigenInstallJobReply(changed, input, parseKleinanzeigenDraftContent),
      null,
    );
});
Deno.test('Schreibbeginn verlangt genau den dauerhaften writing-Stand mit neuer Version', () => {
  const input = {
    action: 'job_begin' as const,
    ...base,
    expectedVersion: 2,
    fee: { state: 'free' as const, observedAt: new Date().toISOString() },
  };
  const reply = { authorized: true, reason: null, job: { ...job, state: 'writing', version: 3 } };
  assertEquals<unknown>(
    parseKleinanzeigenInstallJobReply(reply, input, parseKleinanzeigenDraftContent),
    reply,
  );
  assertEquals(
    parseKleinanzeigenInstallJobReply(
      { ...reply, job: { ...reply.job, state: 'claimed' } },
      input,
      parseKleinanzeigenDraftContent,
    ),
    null,
  );
  assertEquals(
    parseKleinanzeigenInstallJobReply(
      { ...reply, job: { ...reply.job, version: 2 } },
      input,
      parseKleinanzeigenDraftContent,
    ),
    null,
  );
});
Deno.test('Offizielle Kontingentantwort muss Konto und Generation entsprechen', () => {
  const at = new Date().toISOString();
  const input = {
    action: 'quota_observation' as const,
    workspaceId: job.workspaceId,
    connectionId: job.connectionId,
    generation: 2,
    jobId: null,
    quota: {
      externalAccountId: '88',
      accountType: 'private' as const,
      used: 99,
      observedAt: at,
      source: 'account_settings' as const,
    },
  };
  const reply = {
    workspaceId: job.workspaceId,
    connectionId: job.connectionId,
    externalAccountId: '88',
    generation: 2,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    canPublish: true,
    quota: { used: 99, observedAt: at, reserved: 0, allowed: true, reason: null },
  };
  assertEquals<unknown>(
    parseKleinanzeigenInstallJobReply(reply, input, parseKleinanzeigenDraftContent),
    reply,
  );
  for (const changed of [
    { ...reply, externalAccountId: '89' },
    { ...reply, generation: 1 },
    { ...reply, quota: { ...reply.quota, used: 100 } },
    { ...reply, quota: { ...reply.quota, reserved: -1 } },
  ])
    assertEquals(
      parseKleinanzeigenInstallJobReply(changed, input, parseKleinanzeigenDraftContent),
      null,
    );
});
