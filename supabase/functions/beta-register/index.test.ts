import { deepStrictEqual as assertEquals } from 'node:assert';
import { createBetaRegistrationHandler, type BetaRegistrationDependencies } from './index.ts';

const token = 'a'.repeat(43);
const requestId = 'a3000000-0000-4000-8000-000000000001';
function request(body: Record<string, unknown>, origin = 'https://app.flipbase.de') {
  return new Request('https://api.flipbase.de/functions/v1/beta-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}
function dependencies(overrides: Partial<BetaRegistrationDependencies> = {}) {
  const steps: string[] = [];
  const value: BetaRegistrationDependencies = {
    allowAttempt: () => Promise.resolve(true),
    inspect: () => Promise.resolve({ expires_at: '2026-10-09T12:00:00Z' }),
    begin: () => {
      steps.push('begin');
      return Promise.resolve({
        auth_user_id: 'user-1',
        email: 'beta@example.test',
        lease_id: 'lease-1',
      });
    },
    setPassword: () => {
      steps.push('password');
      return Promise.resolve();
    },
    complete: () => {
      steps.push('complete');
      return Promise.resolve();
    },
    session: () => {
      steps.push('session');
      return Promise.resolve({ access_token: 'access', refresh_token: 'refresh' });
    },
    fail: () => {
      steps.push('fail');
      return Promise.resolve();
    },
    ...overrides,
  };
  return { value, steps };
}
Deno.test(
  'Prüfen eines Beta-Links bestätigt keine Registrierung und liefert keine Kontodaten',
  async () => {
    const deps = dependencies();
    const response = await createBetaRegistrationHandler(deps.value)(
      request({ action: 'inspect', token }),
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { expiresAt: '2026-10-09T12:00:00Z' });
    assertEquals(deps.steps, []);
    assertEquals(response.headers.get('Cache-Control'), 'no-store');
  },
);
Deno.test('Erst der bestätigte Fachabschluss liefert eine Sitzung', async () => {
  const deps = dependencies();
  const response = await createBetaRegistrationHandler(deps.value)(
    request({
      action: 'complete',
      token,
      password: 'Long-password1!',
      acceptedTerms: true,
      requestId,
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(deps.steps, ['begin', 'password', 'complete', 'session']);
});
Deno.test('Ablauf zwischen Passwortvergabe und Abschluss liefert keinen Zugang', async () => {
  const deps = dependencies({ complete: () => Promise.reject(new Error('expired')) });
  const response = await createBetaRegistrationHandler(deps.value)(
    request({
      action: 'complete',
      token,
      password: 'Long-password1!',
      acceptedTerms: true,
      requestId,
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(deps.steps, ['begin', 'password', 'fail']);
});
Deno.test(
  'Ungültige Herkunft und fehlende Zustimmung erreichen keinen Passwortabschluss',
  async () => {
    const deps = dependencies();
    const handler = createBetaRegistrationHandler(deps.value);
    assertEquals(
      (await handler(request({ action: 'inspect', token }, 'https://evil.example'))).status,
      403,
    );
    assertEquals(
      (
        await handler(
          request({ action: 'complete', token, password: 'Long-password1!', requestId }),
        )
      ).status,
      400,
    );
    assertEquals(deps.steps, []);
  },
);
Deno.test('Drosselung greift vor Linkprüfung und Passwortvergabe', async () => {
  const deps = dependencies({ allowAttempt: () => Promise.resolve(false) });
  const response = await createBetaRegistrationHandler(deps.value)(
    request({ action: 'inspect', token }),
  );
  assertEquals(response.status, 429);
  assertEquals(deps.steps, []);
});
