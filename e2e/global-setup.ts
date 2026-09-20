import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLocalAdminClient } from './support/local-supabase';
import { APP_ORIGIN, AUTH_STATE_PATH, AUTH_STORAGE_KEY } from './support/test-account';

/**
 * Legt je Testlauf über die lokale Admin-Grenze ein Konto an. Der öffentliche
 * Signup bleibt dadurch auch in Browser-Tests geschlossen.
 */
export default async function globalSetup(): Promise<void> {
  const email = `e2e-${randomUUID()}@flipbase.local`;
  const password = randomUUID();
  const admin = createLocalAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(
      `Testkonto konnte nicht angelegt werden: ${createError?.message ?? 'kein Nutzer'}`,
    );
  }
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', created.user.id)
    .single();
  if (membershipError || !membership) {
    throw new Error(
      `Initialer Test-Workspace fehlt: ${membershipError?.message ?? 'keine Zuordnung'}`,
    );
  }
  const { error: setupError } = await admin
    .from('workspaces')
    .update({ setup_completed_at: new Date().toISOString() })
    .eq('id', membership.workspace_id);
  if (setupError) {
    throw new Error(`Test-Workspace konnte nicht vorbereitet werden: ${setupError.message}`);
  }
  const { data, error } = await admin.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(
      `Testkonto konnte nicht angelegt werden: ${error?.message ?? 'keine Sitzung – ist die E-Mail-Bestätigung lokal aus?'}`,
    );
  }
  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
  await writeFile(
    AUTH_STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: APP_ORIGIN,
          localStorage: [{ name: AUTH_STORAGE_KEY, value: JSON.stringify(data.session) }],
        },
      ],
    }),
    'utf8',
  );
}
