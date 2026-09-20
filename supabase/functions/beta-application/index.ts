// Supabase Edge Function: beta-application
//
// Nimmt Bewerbungen von der Landing Page entgegen. Die Tabelle ist fuer anon
// und authenticated vollstaendig gesperrt; geschrieben wird ausschliesslich
// hier, mit Dienstschluessel und erst nach Pruefung. Ein offen beschreibbarer
// Endpunkt im Netz wird sonst zuverlaessig vollgemuellt.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { sendBetaEmail } from '../_shared/beta-email-delivery.ts';
import { renderApplicationReceipt } from '../_shared/beta-email-template.ts';
import { classifyDuplicateApplication } from './duplicate-application.ts';

/**
 * Herkuenfte, die diese Funktion aufrufen duerfen.
 *
 * Eigene Variable statt der von marketplace-search mitbenutzten
 * ALLOWED_ORIGINS: Selbst gehostetes Supabase gibt allen Edge Functions eine
 * gemeinsame Umgebung, es gibt keine Variable je Funktion. marketplace-search
 * wird aus der laufenden App aufgerufen und braucht in Produktion
 * ALLOWED_ORIGINS=...,https://app.flipbase.de. Laese diese Funktion dieselbe
 * Variable, wuerde sie die Landing Page mit demselben Wert abweisen - der
 * Browser meldete das als CORS-Fehler, der Besucher saehe nur "Das hat nicht
 * geklappt", und in der Datenbank stuende nichts. Die eingebaute Vorgabe
 * enthaelt nur die Produktionsherkuenfte dieser Funktion; wer lokal
 * entwickelt, setzt BETA_APPLICATION_ALLOWED_ORIGINS deshalb ausdruecklich.
 */
const BETA_ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get('BETA_APPLICATION_ALLOWED_ORIGINS') ??
    'https://flipbase.de,https://www.flipbase.de'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

/** Hoechstzahl Bewerbungen je Herkunft und Stunde. */
const MAX_PER_ORIGIN_PER_HOUR = 5;

/**
 * Hoechstzahl aller Bewerbungsversuche je Stunde, herkunftsunabhaengig.
 *
 * Die Drosselung je Herkunft haengt an x-forwarded-for - einer Angabe, die der
 * Aufrufer selbst setzt und bei jeder Anfrage neu waehlen kann. Diese Grenze
 * braucht keinerlei Kopfzeile und greift deshalb auch dann noch, wenn die
 * Kette gefaelscht oder ganz weggelassen wird - sie ist die einzige Schranke,
 * die nicht von Angaben des Aufrufers abhaengt.
 *
 * Das hat einen Preis: Wer zwoelf frei erfundene x-forwarded-for-Werte mit je
 * fuenf Bewerbungen schickt, schoepft die 60 aus und sperrt damit fuer den
 * Rest der Stunde auch echte Interessenten aus - unabhaengig von deren
 * Herkunft. Das wird bewusst in Kauf genommen: Eine blockierte Stunde ist
 * voruebergehend und faellt auf (die Tabelle fuellt sich sichtbar schnell);
 * eine ohne Gesamtgrenze vollgeschriebene Bewerbungsliste faellt nicht auf und
 * bleibt es dauerhaft. Die einzige Alternative ohne diesen Nachteil - eine
 * verlaesslich echte Kopfzeile - existiert hier nicht, siehe oben.
 */
const MAX_TOTAL_PER_HOUR = 60;

/**
 * Pfeffer fuer den Streuwert der Herkunft.
 *
 * Fehlt oder leert sich diese Variable, faellt hashOrigin sonst still auf
 * ungesalzenes SHA-256 ueber die IP-Adresse zurueck - der IPv4-Raum ist
 * vollstaendig vorab berechenbar, der Streuwert damit zurueckrechenbar. Wird
 * einmal beim Start gelesen; eine fehlende Variable weist die Funktion pro
 * Anfrage sichtbar mit Status 500 ab, statt unbemerkt ungeschuetzt zu laufen.
 */
const PEPPER = Deno.env.get('BETA_APPLICATION_PEPPER');

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && BETA_ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function respond(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

/**
 * Streuwert der Herkunft.
 *
 * Zum Zaehlen genuegt die Wiedererkennung. Eine Tabelle voller IP-Adressen von
 * Interessenten waere Personenbezug ohne Zweck, deshalb wird gestreut - mit
 * einem Serverschluessel, damit der Wert nicht durch Ausprobieren aller
 * IP-Adressen zurueckgerechnet werden kann. Der Pfeffer ist deshalb ein
 * Pflichtparameter: Der Aufrufer prueft eine fehlende oder leere Variable
 * schon vorher und weist mit Status 500 ab, statt hier still auf einen leeren
 * Wert auszuweichen.
 */
async function hashOrigin(address: string, pepper: string): Promise<string> {
  const rawData = new TextEncoder().encode(`${pepper}:${address}`);
  const digest = await crypto.subtle.digest('SHA-256', rawData);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unbekannter Versandfehler';
  return message.slice(0, 500);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return respond({ error: 'method_not_allowed' }, 405, origin);
  }

  if (!origin || !BETA_ALLOWED_ORIGINS.has(origin)) {
    return respond({ error: 'origin_not_allowed' }, 403, origin);
  }

  if (!PEPPER) {
    console.error(
      'beta-application: BETA_APPLICATION_PEPPER fehlt oder ist leer - Bewerbungen werden abgelehnt.',
    );
    return respond({ error: 'internal' }, 500, origin);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return respond({ error: 'invalid_body' }, 400, origin);
  }

  // request.json() liefert fuer den gueltigen Rumpf "null" den Wert null,
  // ohne zu werfen. Ohne diese Pruefung wuerde die Destrukturierung darunter
  // ausserhalb des try/catch werfen, und Deno wuerde mit einer generischen
  // 500 ohne CORS-Kopfzeilen antworten - im Browser nicht von einem
  // CORS-Fehler zu unterscheiden.
  if (typeof rawBody !== 'object' || rawBody === null) {
    return respond({ error: 'invalid_body' }, 400, origin);
  }
  const body = rawBody as Record<string, unknown>;

  const { firstName, lastName, email, consent } = body;

  if (consent !== true) {
    return respond({ error: 'consent_required' }, 400, origin);
  }
  if (!isText(firstName, 100) || !isText(lastName, 100)) {
    return respond({ error: 'name_invalid' }, 400, origin);
  }
  if (!isText(email, 320) || !EMAIL_PATTERN.test(email.trim())) {
    return respond({ error: 'email_invalid' }, 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // createClient('', '') wirft "supabaseUrl is required" ausserhalb jedes
  // try/catch - Deno antwortet dann mit einer generischen 500 ohne
  // CORS-Kopfzeilen, im Browser nicht von einem CORS-Fehler zu unterscheiden.
  // Genau das wird oben beim Pfeffer schon vermieden; dieselbe Fehlerklasse
  // wird hier ebenso abgefangen.
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'beta-application: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt oder ist leer.',
    );
    return respond({ error: 'internal' }, 500, origin);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Der letzte Eintrag der Kette stammt vom naechstgelegenen Proxy und laesst
  // sich vom Aufrufer nicht faelschen. Der erste Eintrag dagegen wird vom
  // Aufrufer selbst gesetzt - ein Bot koennte ihn bei jeder Anfrage neu waehlen
  // und so bei der Drosselung je Herkunft immer ein frisches Kontingent
  // bekommen.
  const address =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .pop() ?? 'unbekannt';
  const originHash = await hashOrigin(address, PEPPER);
  // Zaehlen und Eintragen laufen in einem einzigen, in der Datenbank
  // serialisierten Schritt. Getrennt gefragt sahen zwei gleichzeitige Anfragen
  // denselben Stand und kamen beide durch; die Grenze liess sich so um einige
  // Anfragen ueberschreiten. Die Funktion raeumt zugleich die Zaehlversuche
  // auf, die aelter als 24 Stunden sind - deshalb braucht es hier weder eine
  // eigene Zaehlung noch ein eigenes Aufraeumen mehr.
  const { data: allowed, error: throttleError } = await serviceClient.rpc(
    'beta_application_attempt',
    {
      p_origin_hash: originHash,
      p_max_per_origin: MAX_PER_ORIGIN_PER_HOUR,
      p_max_total: MAX_TOTAL_PER_HOUR,
    },
  );

  if (throttleError) {
    console.error('beta-application: Drosselung fehlgeschlagen:', throttleError.message);
    return respond({ error: 'internal' }, 500, origin);
  }

  if (allowed !== true) {
    return respond({ error: 'too_many_requests' }, 429, origin);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const inserted = await serviceClient
    .from('beta_applications')
    .insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: normalizedEmail,
      consent_at: new Date().toISOString(),
    })
    .select('id, first_name, email, status, receipt_email_status')
    .single();

  // Eine bereits vorhandene Adresse wird wie ein Erfolg beantwortet. Sonst
  // liesse sich ueber das Formular herausfinden, wer sich beworben hat.
  if (inserted.error && inserted.error.code !== '23505') {
    console.error('beta-application: Schreiben fehlgeschlagen:', inserted.error.message);
    return respond({ error: 'internal' }, 500, origin);
  }

  let application = inserted.data;
  if (!application) {
    const existing = await serviceClient
      .from('beta_applications')
      .select('id, first_name, email, status, receipt_email_status')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existing.error || !existing.data) {
      console.error(
        'beta-application: Vorhandene Bewerbung konnte nicht fuer die Bestaetigung geladen werden.',
      );
      return respond({ error: 'internal' }, 500, origin);
    }
    application = existing.data;
  }

  const disposition = classifyDuplicateApplication({
    status: application.status,
    receiptEmailStatus: application.receipt_email_status,
  });
  if (disposition === 'rejected') {
    return respond({ error: 'application_rejected' }, 409, origin);
  }
  if (disposition === 'already_confirmed') {
    return respond({ ok: true, receiptEmailSent: true }, 200, origin);
  }

  try {
    const receipt = renderApplicationReceipt({
      firstName: application.first_name,
    });
    await sendBetaEmail({ to: application.email, ...receipt });

    const { error: updateError } = await serviceClient
      .from('beta_applications')
      .update({
        receipt_email_status: 'sent',
        receipt_email_sent_at: new Date().toISOString(),
        receipt_email_last_error: null,
      })
      .eq('id', application.id);

    if (updateError) {
      console.error('beta-application: Versandstatus konnte nicht gespeichert werden.');
      return respond({ ok: true, receiptEmailSent: false }, 200, origin);
    }

    return respond({ ok: true, receiptEmailSent: true }, 200, origin);
  } catch (error) {
    const errorMessage = boundedErrorMessage(error);
    console.error('beta-application: Eingangsbestaetigung konnte nicht versendet werden.');
    await serviceClient
      .from('beta_applications')
      .update({
        receipt_email_status: 'failed',
        receipt_email_sent_at: null,
        receipt_email_last_error: errorMessage,
      })
      .eq('id', application.id);

    return respond({ ok: true, receiptEmailSent: false }, 200, origin);
  }
});
