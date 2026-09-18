import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createAnonClient } from './support/local-supabase';
import { APP_ORIGIN, AUTH_STATE_PATH, AUTH_STORAGE_KEY } from './support/test-account';

/**
 * Registriert je Testlauf genau ein Konto. Lokal ist keine E-Mail-Bestätigung nötig,
 * deshalb liefert die Registrierung direkt die Sitzung – ohne zweite Anmeldung.
 */
export default async function globalSetup(): Promise<void> {
  const { data, error } = await createAnonClient().auth.signUp({
    email: `e2e-${randomUUID()}@flipbase.local`,
    password: randomUUID(),
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
