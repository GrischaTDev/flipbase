import type { Session } from '@supabase/supabase-js';
import { createAnonClient, supabaseUrl } from './local-supabase';

/** Laufzeit-Sitzung des Testkontos. Der Ordner e2e/.auth/ steht in .gitignore. */
export const AUTH_STATE_PATH = 'e2e/.auth/session.json';
/** Nur vom globalen Setup an die Worker vererbte Zugangsdaten des frischen lokalen Kontos. */
export const TEST_ACCOUNT_ENV = 'FLIPBASE_E2E_TEST_ACCOUNT';
export const APP_ORIGIN = 'http://127.0.0.1:4200';
/** Derselbe Schlüssel, unter dem supabase-js im Browser die Sitzung ablegt. */
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

const MIN_SESSION_SECONDS_REMAINING = 120;

function remainingSeconds(session: Session): number {
  const expiresAt = session.expires_at;
  if (expiresAt === undefined || !Number.isFinite(expiresAt)) {
    throw new Error('Die Sitzung des Testkontos enthält kein Ablaufdatum (expires_at).');
  }
  return expiresAt - Math.floor(Date.now() / 1000);
}

/** Jeder Worker meldet sich unabhängig an; Browser dürfen ihre eigene Sitzung erneuern. */
export function createTestAccountSessionProvider(): () => Promise<Session> {
  const raw = process.env[TEST_ACCOUNT_ENV];
  if (!raw) {
    throw new Error('Die Zugangsdaten des lokalen Testkontos fehlen. Lief das globale Setup?');
  }
  let credentials: { email: string; password: string };
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('Die Zugangsdaten des lokalen Testkontos sind ungültig.');
  }
  if (
    typeof credentials?.email !== 'string' ||
    !credentials.email.endsWith('@flipbase.local') ||
    typeof credentials.password !== 'string' ||
    !credentials.password
  ) {
    throw new Error('Die Zugangsdaten des lokalen Testkontos sind ungültig.');
  }

  const client = createAnonClient();
  let session: Session | undefined;
  return async () => {
    if (session && remainingSeconds(session) >= MIN_SESSION_SECONDS_REMAINING) return session;
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error || !data.session) {
      throw new Error(
        `Testkonto konnte nicht angemeldet werden: ${error?.message ?? 'keine Sitzung'}`,
      );
    }
    if (remainingSeconds(data.session) < MIN_SESSION_SECONDS_REMAINING) {
      throw new Error('Die neue Testsitzung muss noch mindestens 120 Sekunden gültig sein.');
    }
    session = data.session;
    return session;
  };
}

export function sessionStorageState(session: Session) {
  return {
    cookies: [],
    origins: [
      {
        origin: APP_ORIGIN,
        localStorage: [{ name: AUTH_STORAGE_KEY, value: JSON.stringify(session) }],
      },
    ],
  };
}
