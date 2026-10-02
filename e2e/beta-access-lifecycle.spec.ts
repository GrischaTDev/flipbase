import { invitationLinkFor } from './support/beta-email';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import {
  createAnonClient,
  createLocalAdminClient,
  createUserClient,
} from './support/local-supabase';
import { AUTH_STORAGE_KEY } from './support/test-account';

test('beendet und verlängert eine Beta bei offenem Browser und erhält die Anmeldung @core-smoke', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const admin = createLocalAdminClient();
  const suffix = randomUUID();
  const password = `Beta-${suffix}`;
  const operator = await admin.auth.admin.createUser({
    email: `beta-operator-${suffix}@flipbase.local`,
    password,
    email_confirm: true,
  });
  expect(operator.error).toBeNull();
  expect(
    (await admin.from('platform_operators').insert({ user_id: operator.data.user!.id })).error,
  ).toBeNull();
  const application = await admin
    .from('beta_applications')
    .insert({
      first_name: 'Beta',
      last_name: 'Lifecycle',
      email: `beta-access-${suffix}@flipbase.local`,
      status: 'accepted',
      granted_days: 60,
    })
    .select('id')
    .single();
  expect(application.error).toBeNull();
  const created = await admin.auth.admin.createUser({
    email: `beta-access-${suffix}@flipbase.local`,
    user_metadata: { beta_application_id: application.data!.id },
  });
  expect(created.error).toBeNull();
  const operatorLogin = await createAnonClient().auth.signInWithPassword({
    email: operator.data.user!.email!,
    password,
  });
  expect(operatorLogin.error).toBeNull();
  const operatorClient = createUserClient(operatorLogin.data.session!.access_token);
  const token = Buffer.from(randomUUID().replaceAll('-', '').padEnd(32, 'x')).toString('base64url');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hashText = Buffer.from(hash).toString('hex');
  const requestId = randomUUID();
  const prepared = await admin.rpc('prepare_beta_invitation', {
    p_application_id: application.data!.id,
    p_request_id: requestId,
    p_token_hash: hashText,
  });
  expect(prepared.error).toBeNull();
  expect(
    (
      await admin.rpc('complete_beta_invitation', {
        p_request_id: requestId,
        p_lease_id: prepared.data.lease_id,
        p_sent: true,
        p_error: null,
      })
    ).error,
  ).toBeNull();
  const registered = await createAnonClient().functions.invoke('beta-register', {
    body: { action: 'complete', token, password, acceptedTerms: true, requestId: randomUUID() },
  });
  expect(registered.error).toBeNull();
  expect(registered.data.session.access_token).toBeTruthy();
  const membership = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', created.data.user!.id)
    .single();
  expect(
    (
      await admin
        .from('workspaces')
        .update({ setup_completed_at: new Date().toISOString() })
        .eq('id', membership.data!.workspace_id)
    ).error,
  ).toBeNull();
  const operatorMembership = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', operator.data.user!.id)
    .single();
  expect(
    (
      await admin
        .from('workspaces')
        .update({ setup_completed_at: new Date().toISOString() })
        .eq('id', operatorMembership.data!.workspace_id)
    ).error,
  ).toBeNull();

  const applicantLogin = await createAnonClient().auth.signInWithPassword({
    email: created.data.user!.email!,
    password,
  });
  expect(applicantLogin.error).toBeNull();
  const applicantContext = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL!,
          localStorage: [
            { name: AUTH_STORAGE_KEY, value: JSON.stringify(applicantLogin.data.session) },
          ],
        },
      ],
    },
  });
  try {
    const applicantPage = await applicantContext.newPage();
    await applicantPage.goto(`${baseURL}/dashboard`);
    await expect(applicantPage).toHaveURL(/\/dashboard$/u);
    await page.goto('/');
    await page.evaluate(([key, session]) => localStorage.setItem(key, JSON.stringify(session)), [
      AUTH_STORAGE_KEY,
      operatorLogin.data.session,
    ] as const);
    await page.goto('/admin/users');
    const row = page.getByRole('row').filter({ hasText: created.data.user!.email! });
    await row.getByRole('button', { name: 'Laufzeit ändern', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Beta-Laufzeit ändern' })).toBeVisible();
    await page.getByRole('button', { name: 'Beta jetzt beenden', exact: true }).click();
    await page.getByRole('button', { name: 'Beta beenden', exact: true }).click();
    await expect(row.getByText('Beta beendet', { exact: true })).toBeVisible();
    await expect(applicantPage).toHaveURL(/\/beta-ended$/u, { timeout: 35_000 });
    await expect(
      applicantPage.getByRole('heading', { name: 'Deine Beta ist beendet' }),
    ).toBeVisible();
    await applicantPage.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(applicantPage.getByRole('heading', { name: 'Your beta has ended' })).toBeVisible();
    await applicantPage.getByRole('button', { name: 'DE', exact: true }).click();
    await applicantPage.addScriptTag({ content: axe.source });
    const violations = await applicantPage.evaluate(
      async () =>
        (
          await (window as Window & { axe: typeof axe }).axe.run(document.body, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          })
        ).violations,
    );
    expect(violations).toEqual([]);
    const login = await createAnonClient().auth.signInWithPassword({
      email: created.data.user!.email!,
      password,
    });
    expect(login.error).toBeNull();
    const data = await createUserClient(login.data.session!.access_token)
      .from('sources')
      .select('id')
      .eq('workspace_id', membership.data!.workspace_id);
    expect(data.error).toBeNull();
    expect(data.data).toEqual([]);
    await row.getByRole('button', { name: 'Laufzeit ändern', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Beta verlängern um Tage' }).fill('7');
    await page.getByRole('button', { name: 'Laufzeit verlängern', exact: true }).click();
    await expect(row.getByText('Beta aktiv', { exact: true })).toBeVisible();
    await applicantPage.getByRole('button', { name: 'Zugang erneut prüfen', exact: true }).click();
    await expect(applicantPage).toHaveURL(/\/dashboard$/u);
    expect((await operatorClient.rpc('list_platform_beta_lifecycle')).error).toBeNull();
    expect(
      (
        await admin
          .from('workspace_licenses')
          .update({
            ends_at: new Date(Date.now() - 1000).toISOString(),
            ended_at: null,
            status: 'active',
          })
          .eq('workspace_id', membership.data!.workspace_id)
      ).error,
    ).toBeNull();
    await expect(applicantPage).toHaveURL(/\/beta-ended$/u, { timeout: 35_000 });
    await expect(
      applicantPage.getByRole('heading', { name: 'Deine Beta ist abgelaufen' }),
    ).toBeVisible();
  } finally {
    await applicantContext.close();
  }
});

for (const expired of [false, true]) {
  test(`zieht eine ${expired ? 'abgelaufene' : 'offene'} Registrierung zurück und gibt die E-Mail frei @core-smoke`, async ({
    page,
  }) => {
    const admin = createLocalAdminClient();
    const suffix = randomUUID();
    const password = `Operator-${suffix}`;
    const email = `withdraw-${suffix}@flipbase.local`;
    const operator = await admin.auth.admin.createUser({
      email: `withdraw-operator-${suffix}@flipbase.local`,
      password,
      email_confirm: true,
    });
    expect(operator.error).toBeNull();
    expect(
      (await admin.from('platform_operators').insert({ user_id: operator.data.user!.id })).error,
    ).toBeNull();
    const membership = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', operator.data.user!.id)
      .single();
    expect(
      (
        await admin
          .from('workspaces')
          .update({ setup_completed_at: new Date().toISOString() })
          .eq('id', membership.data!.workspace_id)
      ).error,
    ).toBeNull();
    const application = await admin
      .from('beta_applications')
      .insert({
        first_name: 'Offene',
        last_name: 'Beta',
        email,
        status: 'accepted',
        granted_days: 60,
      })
      .select('id')
      .single();
    expect(application.error).toBeNull();
    const token = Buffer.from(randomUUID().replaceAll('-', '').padEnd(32, 'x')).toString(
      'base64url',
    );
    const tokenHash = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ).toString('hex');
    const requestId = randomUUID();
    const prepared = await admin.rpc('prepare_beta_invitation', {
      p_application_id: application.data!.id,
      p_request_id: requestId,
      p_token_hash: tokenHash,
    });
    expect(prepared.error).toBeNull();
    const created = await admin.auth.admin.createUser({
      email,
      user_metadata: { beta_application_id: application.data!.id },
    });
    expect(created.error).toBeNull();
    expect(
      (
        await admin.rpc('complete_beta_invitation', {
          p_request_id: requestId,
          p_lease_id: prepared.data.lease_id,
          p_sent: true,
          p_error: null,
        })
      ).error,
    ).toBeNull();
    if (expired) {
      expect(
        (
          await admin
            .from('beta_applications')
            .update({ invitation_expires_at: new Date(Date.now() - 1000).toISOString() })
            .eq('id', application.data!.id)
        ).error,
      ).toBeNull();
      expect(
        (
          await admin
            .from('beta_registration_links')
            .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
            .eq('application_id', application.data!.id)
        ).error,
      ).toBeNull();
    }
    const login = await createAnonClient().auth.signInWithPassword({
      email: operator.data.user!.email!,
      password,
    });
    expect(login.error).toBeNull();
    await page.goto('/');
    await page.evaluate(([key, session]) => localStorage.setItem(key, JSON.stringify(session)), [
      AUTH_STORAGE_KEY,
      login.data.session,
    ] as const);
    await page.goto('/admin/users');
    const row = page.getByRole('row').filter({ hasText: email });
    await expect(
      row.getByText(expired ? 'Registrierungsfrist abgelaufen' : 'Wartet auf Registrierung', {
        exact: true,
      }),
    ).toBeVisible();
    let currentToken = token;
    if (expired) {
      await row.getByRole('button', { name: 'Einladung erneut senden', exact: true }).click();
      await expect(row.getByText('Wartet auf Registrierung', { exact: true })).toBeVisible();
      const freshUrl = new URL(await invitationLinkFor(email));
      currentToken = new URLSearchParams(freshUrl.hash.slice(1)).get('beta_token')!;
      expect(currentToken).not.toBe(token);
      expect(
        (
          await createAnonClient().functions.invoke('beta-register', {
            body: { action: 'inspect', token: currentToken },
          })
        ).error,
      ).toBeNull();
      const invitation = await admin
        .from('beta_registration_links')
        .select('issued_at,expires_at')
        .eq('application_id', application.data!.id)
        .is('revoked_at', null)
        .single();
      expect(invitation.error).toBeNull();
      expect(Date.parse(invitation.data!.expires_at) - Date.parse(invitation.data!.issued_at)).toBe(
        7 * 86400000,
      );
    }
    await row
      .getByRole('button', { name: 'Freigabe zurückziehen und löschen', exact: true })
      .click();
    await page.getByRole('button', { name: 'Zurückziehen und löschen', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await admin.from('beta_applications').select('id').eq('email', email)).data).toEqual(
      [],
    );
    expect((await admin.auth.admin.getUserById(created.data.user!.id)).error).not.toBeNull();
    const invalid = await createAnonClient().functions.invoke('beta-register', {
      body: { action: 'inspect', token: currentToken },
    });
    expect(invalid.error).not.toBeNull();
    const submitted = await createAnonClient().functions.invoke('beta-application', {
      headers: { Origin: new URL(page.url()).origin },
      body: { firstName: 'Neue', lastName: 'Bewerbung', email, consent: true },
    });
    expect(submitted.error).toBeNull();
    const newApplication = await admin
      .from('beta_applications')
      .select('id,status')
      .eq('email', email)
      .single();
    expect(newApplication.error).toBeNull();
    expect(newApplication.data!.id).not.toBe(application.data!.id);
    expect(newApplication.data!.status).toBe('open');
  });
}
