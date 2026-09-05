// Supabase Edge Function: beta-application
//
// Nimmt Bewerbungen von der Landing Page entgegen. Die Tabelle ist fuer anon
// und authenticated vollstaendig gesperrt; geschrieben wird ausschliesslich
// hier, mit Dienstschluessel und erst nach Pruefung. Ein offen beschreibbarer
// Endpunkt im Netz wird sonst zuverlaessig vollgemuellt.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

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
const ERLAUBTE_HERKUENFTE = new Set(
  (
    Deno.env.get('BETA_APPLICATION_ALLOWED_ORIGINS') ??
    'https://flipbase.de,https://www.flipbase.de'
  )
    .split(',')
    .map((herkunft) => herkunft.trim())
    .filter(Boolean),
);

/** Hoechstzahl Bewerbungen je Herkunft und Stunde. */
const HOECHSTZAHL_JE_STUNDE = 5;

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
const HOECHSTZAHL_GESAMT_JE_STUNDE = 60;

/**
 * Pfeffer fuer den Streuwert der Herkunft.
 *
 * Fehlt oder leert sich diese Variable, faellt herkunftsStreuwert sonst still
 * auf ungesalzenes SHA-256 ueber die IP-Adresse zurueck - der IPv4-Raum ist
 * vollstaendig vorab berechenbar, der Streuwert damit zurueckrechenbar. Wird
 * einmal beim Start gelesen; eine fehlende Variable weist die Funktion pro
 * Anfrage sichtbar mit Status 500 ab, statt unbemerkt ungeschuetzt zu laufen.
 */
const PFEFFER = Deno.env.get('BETA_APPLICATION_PEPPER');

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
 * IP-Adressen zurueckgerechnet werden kann. Der Pfeffer ist deshalb ein
 * Pflichtparameter: Der Aufrufer prueft eine fehlende oder leere Variable
 * schon vorher und weist mit Status 500 ab, statt hier still auf einen leeren
 * Wert auszuweichen.
 */
async function herkunftsStreuwert(adresse: string, pfeffer: string): Promise<string> {
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

  if (!PFEFFER) {
    console.error(
      'beta-application: BETA_APPLICATION_PEPPER fehlt oder ist leer - Bewerbungen werden abgelehnt.',
    );
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  let rohRumpf: unknown;
  try {
    rohRumpf = await anfrage.json();
  } catch {
    return antwort({ error: 'invalid_body' }, 400, herkunft);
  }

  // anfrage.json() liefert fuer den gueltigen Rumpf "null" den Wert null,
  // ohne zu werfen. Ohne diese Pruefung wuerde die Destrukturierung darunter
  // ausserhalb des try/catch werfen, und Deno wuerde mit einer generischen
  // 500 ohne CORS-Kopfzeilen antworten - im Browser nicht von einem
  // CORS-Fehler zu unterscheiden.
  if (typeof rohRumpf !== 'object' || rohRumpf === null) {
    return antwort({ error: 'invalid_body' }, 400, herkunft);
  }
  const rumpf = rohRumpf as Record<string, unknown>;

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const dienstschluessel = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // createClient('', '') wirft "supabaseUrl is required" ausserhalb jedes
  // try/catch - Deno antwortet dann mit einer generischen 500 ohne
  // CORS-Kopfzeilen, im Browser nicht von einem CORS-Fehler zu unterscheiden.
  // Genau das wird oben beim Pfeffer schon vermieden; dieselbe Fehlerklasse
  // wird hier ebenso abgefangen.
  if (!supabaseUrl || !dienstschluessel) {
    console.error(
      'beta-application: SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt oder ist leer.',
    );
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  const dienst = createClient(supabaseUrl, dienstschluessel, { auth: { persistSession: false } });

  // Der letzte Eintrag der Kette stammt vom naechstgelegenen Proxy und laesst
  // sich vom Aufrufer nicht faelschen. Der erste Eintrag dagegen wird vom
  // Aufrufer selbst gesetzt - ein Bot koennte ihn bei jeder Anfrage neu waehlen
  // und so bei der Drosselung je Herkunft immer ein frisches Kontingent
  // bekommen.
  const adresse =
    anfrage.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((teil) => teil.trim())
      .filter(Boolean)
      .pop() ?? 'unbekannt';
  const streuwert = await herkunftsStreuwert(adresse, PFEFFER);
  const seit = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Gesamtgrenze ueber alle Herkuenfte hinweg, siehe Kommentar bei
  // HOECHSTZAHL_GESAMT_JE_STUNDE: haengt an keiner Kopfzeile und greift daher
  // auch bei gefaelschtem oder fehlendem x-forwarded-for.
  const { count: gesamtzahl, error: gesamtzaehlfehler } = await dienst
    .from('beta_application_attempts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', seit);

  if (gesamtzaehlfehler) {
    console.error('beta-application: Gesamtzaehlung fehlgeschlagen:', gesamtzaehlfehler.message);
    return antwort({ error: 'internal' }, 500, herkunft);
  }
  if ((gesamtzahl ?? 0) >= HOECHSTZAHL_GESAMT_JE_STUNDE) {
    return antwort({ error: 'too_many_requests' }, 429, herkunft);
  }

  const { count, error: zaehlfehler } = await dienst
    .from('beta_application_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('origin_hash', streuwert)
    .gte('created_at', seit);

  if (zaehlfehler) {
    console.error('beta-application: Herkunftszaehlung fehlgeschlagen:', zaehlfehler.message);
    return antwort({ error: 'internal' }, 500, herkunft);
  }
  if ((count ?? 0) >= HOECHSTZAHL_JE_STUNDE) {
    return antwort({ error: 'too_many_requests' }, 429, herkunft);
  }

  // Schlaegt dieser Eintrag fehl, zaehlt der Versuch nicht mit und die
  // Drosselung wird lautlos schwaecher - deshalb wird das Ergebnis wie bei
  // jeder anderen Abfrage in dieser Datei geprueft.
  const { error: zaehleintragfehler } = await dienst
    .from('beta_application_attempts')
    .insert({ origin_hash: streuwert });

  if (zaehleintragfehler) {
    console.error('beta-application: Zaehleintrag fehlgeschlagen:', zaehleintragfehler.message);
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  // Raeumt Zaehlversuche auf, die aelter als das Zeitfenster sind - ohne
  // eigenen Scheduler, denn dieser Endpunkt wird oft genug aufgerufen, um die
  // Tabelle so klein zu halten. Anders als bei den Zaehlabfragen oben darf ein
  // Fehler hier eine gueltige Bewerbung nicht abweisen: Misslingt das
  // Aufraeumen, bleiben ein paar alte Streuwerte laenger stehen - das ist
  // hoechstens ein spaeter aufgeraeumter Datensatz, kein falsches Ergebnis.
  // Deshalb nur protokollieren und weitermachen, nicht wie oben mit Status 500
  // abweisen.
  const { error: aufraeumfehler } = await dienst
    .from('beta_application_attempts')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (aufraeumfehler) {
    console.error('beta-application: Aufraeumen fehlgeschlagen:', aufraeumfehler.message);
  }

  const { error: schreibfehler } = await dienst.from('beta_applications').insert({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    consent_at: new Date().toISOString(),
  });

  // Eine bereits vorhandene Adresse wird wie ein Erfolg beantwortet. Sonst
  // liesse sich ueber das Formular herausfinden, wer sich beworben hat.
  if (schreibfehler && schreibfehler.code !== '23505') {
    console.error('beta-application: Schreiben fehlgeschlagen:', schreibfehler.message);
    return antwort({ error: 'internal' }, 500, herkunft);
  }

  return antwort({ ok: true }, 200, herkunft);
});
