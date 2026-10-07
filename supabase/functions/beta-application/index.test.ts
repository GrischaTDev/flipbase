import assert from 'node:assert/strict';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

Deno.env.set('BETA_APPLICATION_PEPPER', 'test-only-pepper');
Deno.env.set('SUPABASE_URL', 'https://test.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-key');
const { createBetaApplicationHandler } = await import('./index.ts');

function fixture(duplicate: boolean, mailFails = false, mailWait = Promise.resolve()) {
  const calls: string[] = [];
  const backgroundTasks: Promise<void>[] = [];
  let mails = 0;
  const factory: typeof createClient = (url, key, options) =>
    createClient(url, key, {
      ...options,
      global: {
        fetch: (input, init) => {
          const pathname = new URL(String(input)).pathname;
          calls.push(`${init?.method}:${pathname}`);
          if (pathname.endsWith('/rpc/beta_application_attempt'))
            return Promise.resolve(
              new Response('true', { headers: { 'Content-Type': 'application/json' } }),
            );
          if (init?.method === 'POST' && duplicate)
            return Promise.resolve(
              new Response(JSON.stringify({ code: '23505', message: 'duplicate' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
          const application = {
            id: 'test-id',
            first_name: 'Max',
            last_name: 'Test',
            email: 'max@example.test',
            status: 'pending',
            receipt_email_status: 'pending',
          };
          return Promise.resolve(
            new Response(JSON.stringify(application), {
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        },
      },
    });
  const handler = createBetaApplicationHandler(
    factory,
    async () => {
      mails++;
      await mailWait;
      if (mailFails) throw new Error('mail provider unavailable');
    },
    (task) => {
      backgroundTasks.push(task);
    },
  );
  return { handler, calls, mails: () => mails, finish: () => Promise.all(backgroundTasks) };
}
function request(
  body = JSON.stringify({
    firstName: 'Max',
    lastName: 'Test',
    email: 'max@example.test',
    consent: true,
  }),
) {
  return new Request('https://test.invalid', {
    method: 'POST',
    headers: { Origin: 'https://flipbase.de' },
    body,
  });
}
Deno.test(
  'Neue, vorhandene und vom Mailfehler betroffene Bewerbung haben dieselbe öffentliche Antwort',
  async () => {
    for (const [duplicate, mailFails] of [
      [false, false],
      [true, false],
      [false, true],
    ]) {
      const { handler, calls, mails, finish } = fixture(duplicate, mailFails);
      const response = await handler(request());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
      await finish();
      assert.equal(mails(), duplicate ? 0 : 2);
      assert.equal(calls[0], 'POST:/rest/v1/rpc/beta_application_attempt');
      if (duplicate)
        assert.equal(
          calls.some((call) => call.startsWith('PATCH')),
          false,
        );
    }
  },
);
Deno.test('Die öffentliche Antwort wartet auch bei neuen Adressen nicht auf SMTP', async () => {
  let releaseMail = () => {};
  const mailWait = new Promise<void>((resolve) => {
    releaseMail = resolve;
  });
  const { handler, finish } = fixture(false, false, mailWait);
  let responded = false;
  const response = handler(request()).then((result) => {
    responded = true;
    return result;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(responded, true);
    assert.deepEqual(await (await response).json(), { ok: true });
  } finally {
    releaseMail();
    await finish();
  }
});
Deno.test(
  'Ungültige und übergroße Bewerbungen zählen einen Versuch und erreichen keine Mail oder Speicherung',
  async () => {
    for (const body of ['{', 'null', '[]', 'x'.repeat(4097)]) {
      const { handler, calls, mails } = fixture(false);
      const response = await handler(request(body));
      assert.equal(response.status, body.length > 4096 ? 413 : 400);
      assert.deepEqual(calls, ['POST:/rest/v1/rpc/beta_application_attempt']);
      assert.equal(mails(), 0);
    }
  },
);
