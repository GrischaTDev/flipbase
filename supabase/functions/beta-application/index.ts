// Supabase Edge Function: beta-application
//
// Nimmt Bewerbungen von der Landing Page entgegen. Die Tabelle ist fuer anon
// und authenticated vollstaendig gesperrt; geschrieben wird ausschliesslich
// hier, mit Dienstschluessel und erst nach Pruefung. Ein offen beschreibbarer
// Endpunkt im Netz wird sonst zuverlaessig vollgemuellt.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

/** Herkuenfte, die diese Funktion aufrufen duerfen. */
const ERLAUBTE_HERKUENFTE = new Set(
  (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'https://flipbase.de,https://www.flipbase.de,http://localhost:4200'
  )
    .split(',')
    .map((herkunft) => herkunft.trim())
    .filter(Boolean),
);

/** Hoechstzahl Bewerbungen je Herkunft und Stunde. */
const HOECHSTZAHL_JE_STUNDE = 5;

function corsKopf(herkunft: string | null): Record<string, string> {
  const kopf: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (herkunft && ERLAUBTE_HERKUENFTE.has(herkunft)) {
    kopf['Access-Control-Allow-Origin'] = herkunft;
  }
  return kopf;
}

function antwort(daten: unknown, status: number, herkunft: string | null): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { ...corsKopf(herkunft), 'Content-Type': 'application/json' },
  });
}

/**
 * Streuwert der Herkunft.
 *
 * Zum Zaehlen genuegt die Wiedererkennung. Eine Tabelle voller IP-Adressen von
 * Interessenten waere Personenbezug ohne Zweck, deshalb wird gestreut - mit
 * einem Serverschluessel, damit der Wert nicht durch Ausprobieren aller
 * IP-Adressen zurueckgerechnet werden kann.
 */
async function herkunftsStreuwert(adresse: string): Promise<string> {
  const pfeffer = Deno.env.get('BETA_APPLICATION_PEPPER') ?? '';
  const rohdaten = new TextEncoder().encode(`${pfeffer}:${adresse}`);
  const streuwert = await crypto.subtle.digest('SHA-256', rohdaten);
  return Array.from(new Uint8Array(streuwert))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function istText(wert: unknown, hoechstlaenge: number): wert is string {
  return typeof wert === 'string' && wert.trim().length > 0 && wert.trim().length <= hoechstlaenge;
}

const EMAIL_MUSTER = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

Deno.serve(async (anfrage: Request) => {
  const herkunft = anfrage.headers.get('origin');

  if (anfrage.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsKopf(herkunft) });
  }

  if (anfrage.method !== 'POST') {
    return antwort({ error: 'method_not_allowed' }, 405, herkunft);
  }

  if (!herkunft || !ERLAUBTE_HERKUENFTE.has(herkunft)) {
    return antwort({ error: 'origin_not_allowed' }, 403, herkunft);
  }

  let rumpf: Record<string, unknown>;
  try {
    rumpf = (await anfrage.json()) as Record<string, unknown>;
  } catch {
    return antwort({ error: 'invalid_body' }, 400, herkunft);
  }

  const { firstName, lastName, email, consent } = rumpf;

  if (consent !== true) {
    return antwort({ error: 'consent_required' }, 400, herkunft);
  }
  if (!istText(firstName, 100) || !istText(lastName, 100)) {
    return antwort({ error: 'name_invalid' }, 400, herkunft);
  }
  if (!istText(email, 320) || !EMAIL_MUSTER.test(email.trim())) {
    return antwort({ error: 'email_invalid' }, 400, herkunft);
  }

  const dienst = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const adresse = anfrage.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unbekannt';
  const streuwert = await herkunftsStreuwert(adresse);
  const seit = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: zaehlfehler } = await dienst
    .from('beta_application_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('origin_hash', streuwert)
    .gte('created_at', seit);

  if (zaehlfehler) {
    return antwort({ error: 'internal' }, 500, herkunft);
  }
  if ((count ?? 0) >= HOECHSTZAHL_JE_STUNDE) {
    return antwort({ error: 'too_many_requests' }, 429, herkunft);
  }

  await dienst.from('beta_application_attempts').insert({ origin_hash: streuwert });

  const { error: schreibfehler } = await dienst.from('beta_applications').insert({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
  });

  // Eine bereits vorhandene Adresse wird wie ein Erfolg beantwortet. Sonst
  // liesse sich ueber das Formular herausfinden, wer sich beworben hat.
  if (schreibfehler && schreibfehler.code !== '23505') {
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  return antwort({ ok: true }, 200, herkunft);
});
