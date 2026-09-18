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

export function readAccessToken(): string {
  const state = JSON.parse(readFileSync(AUTH_STATE_PATH, 'utf8')) as StorageState;
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === AUTH_STORAGE_KEY);
  if (!entry) throw new Error('Die Sitzung des Testkontos fehlt. Lief das globale Setup?');
  return (JSON.parse(entry.value) as { access_token: string }).access_token;
}
