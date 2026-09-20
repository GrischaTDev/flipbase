import {
  type BetaInviteApplication,
  type BetaInviteDependencies,
  createBetaInviteHandler,
} from './index.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  }
}

function application(overrides: Partial<BetaInviteApplication> = {}): BetaInviteApplication {
  return {
    id: 'a1',
    first_name: 'Anna',
    last_name: 'Beispiel',
    email: 'anna@example.test',
    status: 'open',
    granted_days: null,
    receipt_email_status: 'failed',
    auth_user_id: null,
    invitation_status: 'not_sent',
    registered_at: null,
    ...overrides,
  };
}

function request(body: Record<string, unknown>, authorization = 'Bearer operator-token'): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: 'https://app.flipbase.de',
  };
  if (authorization) headers.Authorization = authorization;
  return new Request('https://api.flipbase.de/functions/v1/beta-invite', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Partial<BetaInviteDependencies> = {}) {
  let current = application();
  const calls = {
    accepted: [] as unknown[],
    rejected: [] as unknown[],
    invited: [] as unknown[],
    generated: [] as unknown[],
    sent: [] as unknown[],
    updated: [] as unknown[],
  };
  const value: BetaInviteDependencies = {
    authenticate: () => Promise.resolve({ id: 'operator-1' }),
    isOperator: () => Promise.resolve(true),
    loadApplication: () => Promise.resolve(current),
    acceptApplication: (token, applicationId, grantedDays) => {
      calls.accepted.push({ token, applicationId, grantedDays });
      current = application({
        status: 'accepted',
        granted_days: grantedDays,
        invitation_status: 'sending',
      });
      return Promise.resolve(current);
    },
    rejectApplication: (token, applicationId) => {
      calls.rejected.push({ token, applicationId });
      current = application({ status: 'rejected' });
      return Promise.resolve(current);
    },
    inviteUser: (input) => {
      calls.invited.push(input);
      return Promise.resolve({ userId: 'user-1' });
    },
    generateRegistrationLink: (input) => {
      calls.generated.push(input);
      return Promise.resolve({
        userId: 'user-1',
        actionLink: 'https://app.flipbase.de/auth/set-password?token=secret',
      });
    },
    sendEmail: (message) => {
      calls.sent.push(message);
      return Promise.resolve();
    },
    updateApplication: (_applicationId, patch) => {
      calls.updated.push(patch);
      current = { ...current, ...patch };
      return Promise.resolve(current);
    },
    now: () => '2026-09-20T18:00:00.000Z',
    siteUrl: 'https://app.flipbase.de',
    ...overrides,
  };
  return {
    value,
    calls,
    setApplication: (next: BetaInviteApplication) => (current = next),
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

Deno.test('weist fehlende Anmeldung und Nicht-Betreiber ab', async () => {
  const setup = dependencies();
  const handler = createBetaInviteHandler(setup.value);

  const unauthorized = await handler(
    request({ action: 'accept', applicationId: 'a1', grantedDays: 60 }, ''),
  );
  assertEquals(unauthorized.status, 401);

  const forbiddenSetup = dependencies({
    isOperator: () => Promise.resolve(false),
  });
  const forbidden = await createBetaInviteHandler(forbiddenSetup.value)(
    request({ action: 'accept', applicationId: 'a1', grantedDays: 60 }),
  );
  assertEquals(forbidden.status, 403);
});

Deno.test('nimmt mit 60 Tagen an und verknuepft die Einladung', async () => {
  const setup = dependencies();
  const response = await createBetaInviteHandler(setup.value)(
    request({ action: 'accept', applicationId: 'a1', grantedDays: 60 }),
  );

  assertEquals(response.status, 200);
  assertEquals(setup.calls.accepted, [
    { token: 'operator-token', applicationId: 'a1', grantedDays: 60 },
  ]);
  assertEquals(setup.calls.invited, [
    {
      email: 'anna@example.test',
      redirectTo: 'https://app.flipbase.de/auth/set-password',
      data: {
        beta_application_id: 'a1',
        first_name: 'Anna',
        last_name: 'Beispiel',
        full_name: 'Anna Beispiel',
      },
    },
  ]);
  assertEquals(setup.calls.updated, [
    {
      auth_user_id: 'user-1',
      invitation_status: 'sent',
      invitation_sent_at: '2026-09-20T18:00:00.000Z',
      invitation_last_error: null,
    },
  ]);
});

Deno.test('speichert einen Einladungsfehler sichtbar', async () => {
  const setup = dependencies({
    inviteUser: () => Promise.reject(new Error('SMTP nicht erreichbar')),
  });
  const response = await createBetaInviteHandler(setup.value)(
    request({ action: 'accept', applicationId: 'a1', grantedDays: 60 }),
  );

  assertEquals(response.status, 502);
  assertEquals(setup.calls.updated, [
    {
      invitation_status: 'failed',
      invitation_last_error: 'SMTP nicht erreichbar',
    },
  ]);
  assertEquals(await json(response), {
    error: 'invite_failed',
    message: 'Die Einladung konnte nicht versendet werden.',
  });
});

Deno.test('wiederholt die Einladung fuer den vorhandenen unregistrierten Nutzer', async () => {
  const setup = dependencies();
  setup.setApplication(
    application({
      status: 'accepted',
      granted_days: 60,
      auth_user_id: 'user-1',
      invitation_status: 'failed',
    }),
  );

  const response = await createBetaInviteHandler(setup.value)(
    request({ action: 'resend', applicationId: 'a1' }),
  );

  assertEquals(response.status, 200);
  assertEquals(setup.calls.invited, []);
  assertEquals(setup.calls.generated, [
    {
      email: 'anna@example.test',
      redirectTo: 'https://app.flipbase.de/auth/set-password',
    },
  ]);
  assertEquals(setup.calls.sent.length, 1);
});

Deno.test('versendet keine neue Einladung an bereits registrierte Nutzer', async () => {
  const setup = dependencies();
  setup.setApplication(
    application({
      status: 'accepted',
      granted_days: 60,
      auth_user_id: 'user-1',
      invitation_status: 'sent',
      registered_at: '2026-09-20T18:30:00.000Z',
    }),
  );

  const response = await createBetaInviteHandler(setup.value)(
    request({ action: 'resend', applicationId: 'a1' }),
  );

  assertEquals(response.status, 409);
  assertEquals(setup.calls.generated, []);
  assertEquals(setup.calls.sent, []);
});

Deno.test(
  'wiederholt eine fehlgeschlagene Eingangsbestaetigung ohne Entscheidungsaenderung',
  async () => {
    const setup = dependencies();
    const response = await createBetaInviteHandler(setup.value)(
      request({ action: 'resend_receipt', applicationId: 'a1' }),
    );

    assertEquals(response.status, 200);
    assertEquals(setup.calls.sent.length, 1);
    assertEquals(setup.calls.updated, [
      {
        receipt_email_status: 'sent',
        receipt_email_sent_at: '2026-09-20T18:00:00.000Z',
        receipt_email_last_error: null,
      },
    ]);
    const body = await json(response);
    assertEquals((body.application as BetaInviteApplication).status, 'open');
  },
);
