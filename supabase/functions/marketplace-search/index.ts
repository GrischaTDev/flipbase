// Supabase Edge Function: marketplace-search
//
// Sucht serverseitig nach verkauften eBay-Artikeln. Der eBay-Zugangsschlüssel
// bleibt dabei auf dem Server – im Frontend wäre er für jeden lesbar.
//
// Gegenüber der vorherigen Fassung geändert:
//   - `Deno.serve` statt des veralteten `serve` aus deno.land/std
//   - CORS nicht mehr für jede Herkunft offen, sondern auf eine Liste erlaubter
//     Adressen begrenzt
//   - Aufrufe erfordern eine gültige Anmeldung
//   - Fehler werden typsicher behandelt statt `error.message` auf `unknown`

/** Herkünfte, die diese Funktion aufrufen dürfen. */
const ERLAUBTE_HERKUENFTE = new Set(
  (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'http://localhost:4200,http://localhost,http://flipbase.localhost'
  )
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
);

/** Baut die CORS-Kopfzeilen für eine konkrete Herkunft. */
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

/** Liest eine Fehlermeldung aus einem unbekannten Wert. */
function fehlertext(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

interface SuchAnfrage {
  query?: unknown;
  limit?: unknown;
  platform?: unknown;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const herkunft = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsKopf(herkunft) });
  }

  if (req.method !== 'POST') {
    return antwort({ error: 'Nur POST wird unterstützt.' }, 405, herkunft);
  }

  // Herkunft prüfen, sobald der Browser eine mitschickt.
  if (herkunft && !ERLAUBTE_HERKUENFTE.has(herkunft)) {
    return antwort({ error: 'Herkunft nicht erlaubt.' }, 403, herkunft);
  }

  // Nur angemeldete Nutzer dürfen suchen. Ohne diese Prüfung könnte jeder
  // Besucher den eBay-Zugang des Betreibers für eigene Abfragen verbrauchen.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return antwort({ error: 'Nicht angemeldet.' }, 401, herkunft);
  }

  let anfrage: SuchAnfrage;
  try {
    anfrage = (await req.json()) as SuchAnfrage;
  } catch {
    return antwort({ error: 'Ungültiger Anfrageinhalt.' }, 400, herkunft);
  }

  const query = typeof anfrage.query === 'string' ? anfrage.query.trim() : '';
  if (!query) {
    return antwort({ error: 'Suchbegriff fehlt.' }, 400, herkunft);
  }

  const limit = Math.min(Math.max(Number(anfrage.limit) || 8, 1), 50);
  const ebayAppId = Deno.env.get('EBAY_APP_ID') ?? '';

  const items: unknown[] = [];

  if (ebayAppId) {
    try {
      const url =
        'https://svcs.ebay.com/services/search/FindingService/v1' +
        '?OPERATION-NAME=findCompletedItems' +
        '&SERVICE-VERSION=1.13.0' +
        `&SECURITY-APPNAME=${encodeURIComponent(ebayAppId)}` +
        '&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD' +
        `&keywords=${encodeURIComponent(query)}` +
        '&GLOBAL-ID=EBAY-DE' +
        '&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true' +
        `&paginationInput.entriesPerPage=${limit}`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (resp.ok) {
        const json = await resp.json();
        const treffer = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
        for (const it of treffer) {
          items.push({
            itemId: it.itemId?.[0],
            title: it.title?.[0],
            price: Number.parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? '0'),
            currency: it.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] ?? 'EUR',
            imageUrl: it.galleryURL?.[0],
            viewItemURL: it.viewItemURL?.[0],
            endTime: it.listingInfo?.[0]?.endTime?.[0],
            conditionDisplayName: it.condition?.[0]?.conditionDisplayName?.[0] ?? 'Gebraucht',
          });
        }
      }
    } catch (fehler) {
      console.error('eBay-Abfrage fehlgeschlagen:', fehlertext(fehler));
      return antwort(
        { error: 'Die Marktplatz-Abfrage ist fehlgeschlagen.', success: false },
        502,
        herkunft,
      );
    }
  }

  return antwort({ success: true, query, count: items.length, items }, 200, herkunft);
});
