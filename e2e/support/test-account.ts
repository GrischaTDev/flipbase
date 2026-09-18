import { readFileSync } from 'node:fs';
import { supabaseUrl } from './local-supabase';

/** Laufzeit-Sitzung des Testkontos. Der Ordner e2e/.auth/ steht in .gitignore. */
export const AUTH_STATE_PATH = 'e2e/.auth/session.json';
export const APP_ORIGIN = 'http://127.0.0.1:4200';
/** Derselbe Schlüssel, unter dem supabase-js im Browser die Sitzung ablegt. */
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

interface StorageState {
  readonly origins: readonly {
    readonly localStorage: readonly { name: string; value: string }[];
  }[];
}

interface StoredSession {
  readonly access_token: string;
  /** Unix-Zeitstempel in Sekunden, ab dem das Access-Token abgelaufen ist. */
  readonly expires_at?: number;
}

function readStoredSession(): StoredSession {
  let raw: string;
  try {
    raw = readFileSync(AUTH_STATE_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Die Sitzungsdatei ${AUTH_STATE_PATH} fehlt. Lief das globale Setup (e2e/global-setup.ts) vor diesem Test?`,
        { cause: error },
      );
    }
    throw error;
  }
  const state = JSON.parse(raw) as StorageState;
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === AUTH_STORAGE_KEY);
  if (!entry) throw new Error('Die Sitzung des Testkontos fehlt. Lief das globale Setup?');
  return JSON.parse(entry.value) as StoredSession;
}

export function readAccessToken(): string {
  return readStoredSession().access_token;
}

/** Verbleibende Gültigkeit der gemeinsamen Sitzung in Sekunden (kann negativ sein). */
export function readSessionRemainingSeconds(): number {
  const { expires_at: expiresAt } = readStoredSession();
  if (expiresAt === undefined) {
    throw new Error('Die Sitzung des Testkontos enthält kein Ablaufdatum (expires_at).');
  }
  return expiresAt - Math.floor(Date.now() / 1000);
}
