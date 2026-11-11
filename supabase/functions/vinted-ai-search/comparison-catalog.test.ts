import { loadComparisonCatalog, parseComparisonCatalog } from './comparison-catalog.ts';
import type { ResearchListing } from './research.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

const listing: ResearchListing = {
  id: 'f37236dd-93f4-4fa2-b09e-ab8049631b48',
  url: 'https://www.vinted.de/items/123-giacca-carhartt',
  title: 'Giacca Carhartt',
  description: 'Fleecejacke mit Tasche',
  image_urls: [],
  item_price: 10,
  total_price: 11.2,
  currency: 'EUR',
  brand: 'Carhartt',
  size: 'L',
  condition: 'Sehr gut',
  category: {
    id: '1858',
    path: ['Herren', 'Kleidung', 'Jacken & Mäntel', 'Jacken', 'Fleecejacken'],
  },
};

function product(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Carhartt WIP Prentis Liner',
    url: `/items/${id}-fleece`,
    price: { amount: '59.95', currencyCode: 'EUR' },
    totalItemPrice: { amount: '63.65', currencyCode: 'EUR' },
    itemBox: { firstLine: 'Carhartt', secondLine: 'L · Sehr gut' },
    ...overrides,
  };
}

function htmlFor(products: Record<string, unknown>[]) {
  // Dieselbe RSC-Struktur wie die öffentliche Katalogseite, kein ausführbarer Fremdcode.
  const stream = `a:${JSON.stringify(['$', 'section', null, { items: { items: products.map((productItem) => ({ productItem })) } }])}\n`;
  return `<script>self.__next_f.push(${JSON.stringify([1, stream])});</script>`;
}

Deno.test(
  'liest Einzelartikelpreise, Größe und Zustand aus Katalogdaten und entfernt Ziel/Duplikate',
  () => {
    const html = htmlFor([
      product(123),
      product(124),
      product(124),
      product(125, { itemBox: { firstLine: 'Carhartt WIP', secondLine: 'M · Gut' } }),
      product(126, { itemBox: { firstLine: 'Adidas', secondLine: 'L · Sehr gut' } }),
    ]);
    equal(parseComparisonCatalog(html, listing), [
      {
        title: 'Carhartt WIP Prentis Liner',
        url: 'https://www.vinted.de/items/124-fleece',
        price: 59.95,
        currency: 'EUR',
        brand: 'Carhartt',
        details: 'L · Sehr gut',
      },
      {
        title: 'Carhartt WIP Prentis Liner',
        url: 'https://www.vinted.de/items/125-fleece',
        price: 59.95,
        currency: 'EUR',
        brand: 'Carhartt WIP',
        details: 'M · Gut',
      },
    ]);
  },
);

Deno.test(
  'verwirft fremde URLs, abweichende Kennungen und fehlende oder unzulässige Einzelpreise',
  () => {
    const bad = [
      product(124, { url: 'https://www.vinted.de.evil.test/items/124' }),
      product(124, { url: 'https://name@www.vinted.de/items/124' }),
      product(124, { url: 'https://127.0.0.1/items/124' }),
      product(124, { url: 'https://www.vinted.de/items/125' }),
      product(124, { price: null }),
      product(124, { price: { amount: '59.95', currencyCode: 'USD' } }),
      product(124, { price: { amount: '0', currencyCode: 'EUR' } }),
      product(124, { price: { amount: '-5', currencyCode: 'EUR' } }),
      product(124, { price: { amount: 'NaN', currencyCode: 'EUR' } }),
      product(124, { price: { amount: 100001, currencyCode: 'EUR' } }),
    ];
    equal(parseComparisonCatalog(htmlFor(bad), listing), []);
    equal(parseComparisonCatalog('<script>self.__next_f.push(malicious())</script>', listing), []);
  },
);

Deno.test('begrenzt große Katalogseiten auf 24 eindeutige Kandidaten und kompakte Texte', () => {
  const result = parseComparisonCatalog(
    htmlFor(
      Array.from({ length: 40 }, (_, index) =>
        product(index + 200, {
          title: 't'.repeat(500),
          itemBox: { firstLine: 'Carhartt', secondLine: 'd'.repeat(500) },
        }),
      ),
    ),
    listing,
  );
  equal(result.length, 24);
  equal(result[0].title.length, 300);
  equal(result[0].details.length, 300);
  equal(result.at(-1)?.url, 'https://www.vinted.de/items/223-fleece');
});

Deno.test(
  'sucht einmal nach Modell und Kategorie ohne günstige Feed-Preisgrenze zu übernehmen',
  async () => {
    const original = globalThis.fetch;
    const requests: URL[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push(new URL(String(input)));
      equal(init && 'redirect' in init ? init.redirect : null, 'error');
      return new Response(htmlFor([product(124)]));
    };
    try {
      const result = await loadComparisonCatalog(
        listing,
        { confidence: 'likely', modelName: 'Carhartt WIP Prentis Liner' },
        new AbortController().signal,
      );
      equal(result.candidates.length, 1);
      equal(result.limitation, null);
      equal(requests.length, 1);
      const url = requests[0];
      equal(url.origin, 'https://www.vinted.de');
      equal(url.pathname, '/catalog');
      equal(url.searchParams.get('order'), 'newest_first');
      equal(url.searchParams.get('per_page'), '24');
      equal(url.searchParams.get('page'), '1');
      equal(url.searchParams.get('catalog_ids[]'), '1858');
      equal(url.searchParams.get('search_text')?.includes('Prentis Liner'), true);
      equal(
        [...url.searchParams.keys()].some((key) => /price/i.test(key)),
        false,
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  'nutzt bei unbekanntem Modell die Kategorie und vermeidet eine ungezielte gesamte Markensuche',
  async () => {
    const original = globalThis.fetch;
    const requests: URL[] = [];
    globalThis.fetch = async (input) => {
      requests.push(new URL(String(input)));
      return new Response(htmlFor([]));
    };
    try {
      const result = await loadComparisonCatalog(
        listing,
        { confidence: 'unknown', modelName: 'Unsicherer Modellname' },
        new AbortController().signal,
      );
      equal(requests[0].searchParams.get('search_text'), 'Carhartt Fleecejacken');
      equal(result.candidates, []);
      equal(typeof result.limitation, 'string');
      const missing = await loadComparisonCatalog(
        { ...listing, category: null },
        { confidence: 'unknown', modelName: 'Unsicherer Modellname' },
        new AbortController().signal,
      );
      equal(requests.length, 1);
      equal(missing.candidates, []);
      equal(typeof missing.limitation, 'string');
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  'entfernt Modellzusätze und doppelte Marken aus der Suche und bevorzugt die gezielte Suchphrase',
  async () => {
    const original = globalThis.fetch;
    const queries: (string | null)[] = [];
    globalThis.fetch = async (input) => {
      queries.push(new URL(String(input)).searchParams.get('search_text'));
      return new Response(htmlFor([]));
    };
    try {
      for (const modelName of [
        'Carhartt WIP Prentis Liner, wahrscheinlich Wax / Wall',
        'Carhartt WIP Prentis Liner; Größe L',
        'Carhartt WIP Prentis Liner (wahrscheinlich Wax)',
      ])
        await loadComparisonCatalog(
          listing,
          { confidence: 'likely', modelName },
          new AbortController().signal,
        );
      await loadComparisonCatalog(
        listing,
        {
          confidence: 'likely',
          modelName: 'Carhartt WIP Prentis Liner, wahrscheinlich Wax / Wall',
          searchQuery: 'Carhartt Prentis Liner',
        },
        new AbortController().signal,
      );
      equal(queries, [
        'Carhartt WIP Prentis Liner',
        'Carhartt WIP Prentis Liner',
        'Carhartt WIP Prentis Liner',
        'Carhartt Prentis Liner',
      ]);
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  'lässt bei gesperrten oder zu großen Katalogantworten die weitere Webrecherche verfügbar',
  async () => {
    const original = globalThis.fetch;
    try {
      for (const response of [
        new Response('blocked', { status: 403 }),
        new Response(new Uint8Array(8_000_001)),
      ]) {
        globalThis.fetch = async () => response;
        const result = await loadComparisonCatalog(
          listing,
          { confidence: 'likely', modelName: 'Prentis Liner' },
          new AbortController().signal,
        );
        equal(result.candidates, []);
        equal(typeof result.limitation, 'string');
      }
    } finally {
      globalThis.fetch = original;
    }
  },
);
