import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createAnonClient,
  createLocalAdminClient,
  createUserClient,
} from './support/local-supabase';

interface MailpitMessageSummary {
  readonly ID: string;
  readonly To: readonly { readonly Address: string }[];
}

async function invitationLinkFor(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch('http://127.0.0.1:54354/api/v1/messages');
    const list = (await listResponse.json()) as { messages?: readonly MailpitMessageSummary[] };
    const message = list.messages?.find((candidate) =>
      candidate.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const messageResponse = await fetch(`http://127.0.0.1:54354/api/v1/message/${message.ID}`);
      const body = (await messageResponse.json()) as { HTML?: string; Text?: string };
      const content = `${body.HTML ?? ''}\n${body.Text ?? ''}`;
      const link = content
        .match(/https?:\/\/[^\s"'<>]+/gu)
        ?.map((value) => value.replaceAll('&amp;', '&'))
        .find((value) => value.includes('/auth/v1/verify'));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Keine Registrierungseinladung für ${email} in Mailpit gefunden.`);
}

test('genehmigt eine Bewerbung und startet nach der Passwortvergabe 60 Beta-Tage @pr-smoke', async ({
  page,
}) => {
  const suffix = randomUUID();
  const operatorEmail = `e2e-operator-${suffix}@flipbase.local`;
  const applicantEmail = `e2e-applicant-${suffix}@flipbase.local`;
  const operatorPassword = `Operator-${suffix}`;
  const applicantPassword = `Beta-${suffix}`;
  const admin = createLocalAdminClient();

  const operatorCreation = await admin.auth.admin.createUser({
    email: operatorEmail,
    password: operatorPassword,
    email_confirm: true,
  });
  expect(operatorCreation.error).toBeNull();
  const operatorId = operatorCreation.data.user?.id;
  expect(operatorId).toBeTruthy();
  const operatorInsert = await admin.from('platform_operators').insert({ user_id: operatorId });
  expect(operatorInsert.error).toBeNull();

  const applicationInsert = await admin
    .from('beta_applications')
    .insert({
      first_name: 'Anna',
      last_name: 'Beta',
      email: applicantEmail,
      receipt_email_status: 'sent',
    })
    .select('id')
    .single();
  expect(applicationInsert.error).toBeNull();
  const applicationId = applicationInsert.data?.id;
  expect(applicationId).toBeTruthy();

  const operatorLogin = await createAnonClient().auth.signInWithPassword({
    email: operatorEmail,
    password: operatorPassword,
  });
  expect(operatorLogin.error).toBeNull();
  const accessToken = operatorLogin.data.session?.access_token;
  expect(accessToken).toBeTruthy();

  const approval = await createUserClient(accessToken!).functions.invoke('beta-invite', {
    body: { action: 'accept', applicationId, grantedDays: 60 },
  });
  const approvalErrorBody = approval.error
    ? await (approval.error as { context?: Response }).context?.text()
    : null;
  expect(approval.error, approvalErrorBody).toBeNull();
  const invitationLink = await invitationLinkFor(applicantEmail);

  await page.goto(invitationLink);
  await expect(page).toHaveURL(/\/auth\/set-password/u);
  await page.locator('#set-password-input').fill(applicantPassword);
  await page.locator('#set-password-confirm-input').fill(applicantPassword);
  await page.getByRole('checkbox', { name: /AGB und Datenschutzerklärung/u }).click();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/onboarding\/workspace$/u, { timeout: 15_000 });

  await expect
    .poll(async () => {
      const application = await admin
        .from('beta_applications')
        .select('registered_at')
        .eq('id', applicationId!)
        .single();
      return application.data?.registered_at ?? null;
    })
    .not.toBeNull();

  const license = await admin
    .from('workspace_licenses')
    .select('status, granted_days, starts_at, ends_at')
    .eq('beta_application_id', applicationId!)
    .single();
  expect(license.error).toBeNull();
  expect(license.data?.status).toBe('active');
  expect(license.data?.granted_days).toBe(60);
  expect(
    new Date(license.data!.ends_at!).getTime() - new Date(license.data!.starts_at!).getTime(),
  ).toBe(60 * 86_400_000);
});
