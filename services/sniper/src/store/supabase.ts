import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { SnipeConfig } from '../config.js';

/**
 * Der Dienst schreibt mit dem Service-Role-Schluessel und umgeht damit RLS -
 * die beiden Sniper-Tabellen geben angemeldeten Nutzern ausdruecklich nur
 * Leserechte. Dieser Schluessel darf niemals in einen Frontend-Bau geraten.
 *
 * Keine Sitzung, keine automatische Erneuerung: Der Dienst meldet niemanden an,
 * er traegt seinen Schluessel bei jeder Anfrage mit.
 */
export function createSupabaseClient(config: SnipeConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
