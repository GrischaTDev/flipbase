import { parseComparisonListingDate, verifyComparisonDates } from './comparison-dates.ts';
import {
  parseListingPublicationLabel,
  readVintedHtml,
  readVintedListingPage,
  visitListingPayload,
  vintedListingUrl,
} from './listing-details.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

function htmlFor(entries: unknown[]): string {
  const stream = `1:${JSON.stringify(entries)}\n`;
  return `<script>self.__next_f.push(${JSON.stringify([1, stream])})</script>`;
}

function upload(id: string, value: string) {
  return { item_id: id, attributes: [{ code: 'upload_date', data: { value } }] };
}

const now = new Date('2026-11-07T12:00:00.000Z');

Deno.test('liest das Uploadalter nur aus dem passenden Inserat ohne Fotozwang', () => {
  const html = htmlFor([
    upload('456', 'vor 2 Tagen'),
    { item_id: '123', created_at: '2026-11-06T12:00:00Z' },
    upload('123', '2 Wochen'),
  ]);
  equal(parseListingPublicationLabel(html, '123'), '2 Wochen');
  equal(parseListingPublicationLabel(html, '789'), null);
  equal(
    parseListingPublicationLabel(
      htmlFor([upload('123', '1 Tag'), upload('123', '1 Monat')]),
      '123',
    ),
    null,
  );
  equal(
    parseListingPublicationLabel('<script>self.__next_f.push(runCode())</script>', '123'),
    null,
  );
  const ids: string[] = [];
  visitListingPayload(html, (entry) => {
    if (typeof entry['item_id'] === 'string') ids.push(entry['item_id']);
  });
  equal(ids, ['456', '123', '123']);
});

Deno.test('klassifiziert relative Uploadangaben mit konservativen 30-Tage-Grenzen', () => {
  for (const label of [
    '2 Wochen',
    'vor 3 Wochen',
    '1 Tag',
    'vor einer Stunde',
    'heute',
    'gestern',
    '11 h',
    '2 h',
    '22 Min.',
  ])
    equal(parseComparisonListingDate(label, now).status, 'within_window');
  for (const label of ['4 Wochen', '1 Monat', '30 Tage', '2 Monate', 'unbekannt', 'in 2 Tagen'])
    equal(parseComparisonListingDate(label, now).status, 'unknown');
  for (const label of ['6 Wochen', '3 Monate', '4 Jahre'])
    equal(parseComparisonListingDate(label, now).status, 'outside_window');
  const relative = parseComparisonListingDate('2 Wochen', now);
  equal(relative.earliest, '2026-10-17T12:00:00.000Z');
  equal(relative.latest, '2026-10-31T12:00:00.000Z');
  equal(relative.checkedAt, now.toISOString());
  equal(relative.source, 'vinted_listing');
  equal(parseComparisonListingDate(null, now).earliest, null);
  equal(parseComparisonListingDate('22 Min.', now).earliest, '2026-11-07T11:37:00.000Z');
  equal(parseComparisonListingDate('2 h', now).earliest, '2026-11-07T09:00:00.000Z');
});

Deno.test(
  'verwechselt Abrufdatum, ungültige Kalendertage und zukünftige Angaben nicht mit Uploadbelegen',
  () => {
    const exact = parseComparisonListingDate('2026-10-25T08:30:00Z', now);
    equal(exact.status, 'within_window');
    equal(exact.earliest, '2026-10-25T08:30:00.000Z');
    equal(exact.latest, exact.earliest);
    equal(parseComparisonListingDate('2026-10-25', now).status, 'within_window');
    equal(parseComparisonListingDate('2026-10-08', now).status, 'unknown');
    equal(parseComparisonListingDate('2026-09-01', now).status, 'outside_window');
    equal(parseComparisonListingDate('2026-02-30', now).earliest, null);
    equal(parseComparisonListingDate('2026-11-08T00:00:00Z', now).status, 'unknown');
    equal(parseComparisonListingDate('letzte Woche indexiert', now).earliest, null);
  },
);

Deno.test('lässt für die Quellenprüfung nur feste öffentliche Vinted-Adressen zu', async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    equal(init && 'redirect' in init ? init.redirect : null, 'error');
    return new Response(htmlFor([upload('123', '2 Wochen')]));
  };
  try {
    equal(
      vintedListingUrl('https://www.vinted.de/items/123-jacket?utm_source=x#photos')?.url.href,
      'https://www.vinted.de/items/123-jacket',
    );
    for (const url of [
      'http://www.vinted.de/items/123',
      'https://www.vinted.de:444/items/123',
      'https://www.vinted.de.evil.test/items/123',
      'https://name@www.vinted.de/items/123',
      'https://www.vinted.de/items/123/extra',
      'https://www.vinted.de/items/123456789012345678901',
      'https://127.0.0.1/items/123',
    ])
      equal(vintedListingUrl(url), null);
    const result = await readVintedListingPage(
      'https://www.vinted.de/items/123?secret=value',
      new AbortController().signal,
    );
    equal(result.itemId, '123');
    equal(requests, ['https://www.vinted.de/items/123']);
    await readVintedHtml(
      new URL('https://www.vinted.de/catalog?search_text=fleece'),
      new AbortController().signal,
      8_000_000,
    );
    let rejected = false;
    try {
      await readVintedHtml(new URL('https://www.vinted.de/help'), new AbortController().signal);
    } catch {
      rejected = true;
    }
    equal(rejected, true);
    equal(requests.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test(
  'begrenzt Detailprüfungen, dedupliziert Inserate und überschreibt erfundene KI-Daten',
  async () => {
    const originalFetch = globalThis.fetch;
    const originalNow = Date.now;
    let clock = now.getTime();
    const requests: string[] = [];
    Date.now = () => clock;
    globalThis.fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      clock += 2500;
      const id = /\/items\/(\d+)/.exec(url)![1];
      return new Response(htmlFor([upload(id, '2 Wochen')]));
    };
    try {
      const entries = [
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: 'asking',
          url: `https://www.vinted.de/items/${i + 1}-fleece`,
        })),
        { kind: 'asking', url: 'https://www.vinted.de/items/1-alias' },
        {
          kind: 'asking',
          url: 'https://www.ebay.de/itm/1',
          listingDate: {
            status: 'within_window',
            source: 'vinted_listing',
            earliest: '2026-11-01',
          },
        },
        { kind: 'retail', url: 'https://www.vinted.de/items/99' },
      ];
      const result = (await verifyComparisonDates(entries, now, new AbortController().signal)) as {
        listingDate: { status: string; source: string; checkedAt: string | null };
      }[];
      equal(requests.length, 6);
      equal(
        result.slice(0, 6).map((value) => value.listingDate.status),
        Array(6).fill('within_window'),
      );
      equal(result[6].listingDate.source, 'unverified');
      equal(result[7].listingDate, result[0].listingDate);
      equal(result[8].listingDate.source, 'unverified');
      equal(result[8].listingDate.status, 'unknown');
      equal(result[8].listingDate.checkedAt, null);
      equal(result[9].listingDate.source, 'unverified');
    } finally {
      globalThis.fetch = originalFetch;
      Date.now = originalNow;
    }
  },
);

Deno.test(
  'startet nach Abbruch keine Quellenprüfung und behandelt zu große Antworten als unbelegt',
  async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(new Uint8Array(3_000_001));
    };
    const entries = [{ kind: 'asking', url: 'https://www.vinted.de/items/123-fleece' }];
    try {
      const controller = new AbortController();
      controller.abort();
      const skipped = (await verifyComparisonDates(entries, now, controller.signal)) as {
        listingDate: { source: string };
      }[];
      equal(calls, 0);
      equal(skipped[0].listingDate.source, 'unverified');
      const oversized = (await verifyComparisonDates(
        entries,
        now,
        new AbortController().signal,
      )) as { listingDate: { source: string } }[];
      equal(calls, 1);
      equal(oversized[0].listingDate.source, 'unverified');
    } finally {
      globalThis.fetch = original;
    }
  },
);
