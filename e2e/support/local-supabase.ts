import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../src/environments/environment.development';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Bricht ab, bevor ein Test gegen eine andere als die lokale Supabase schreiben könnte. */
export function assertLocalSupabaseUrl(url: string): string {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Browser-Tests laufen nur gegen die lokale Supabase, nicht gegen ${host}.`);
  }
  return url;
}

export const supabaseUrl = assertLocalSupabaseUrl(environment.supabaseUrl);
const supabaseAnonKey = environment.supabaseAnonKey;
// Ausschliesslich der feste Dienstschluessel der lokalen Supabase-CLI. Die
// Host-Pruefung oben verhindert, dass er je gegen ein entferntes System laeuft.
const localServiceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const noSessionStorage = { persistSession: false, autoRefreshToken: false } as const;

export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: noSessionStorage });
}

export function createLocalAdminClient(): SupabaseClient {
  return createClient(supabaseUrl, localServiceRoleKey, { auth: noSessionStorage });
}

/** Handelt als angemeldetes Testkonto, ohne erneut die Anmeldung aufzurufen. */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: noSessionStorage,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
