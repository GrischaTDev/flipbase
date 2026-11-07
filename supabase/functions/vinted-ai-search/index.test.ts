import {
  createSearchHandler,
  searchOpenAi,
  listingImages,
  type SearchDependencies,
} from './index.ts';
import { parseAnalysis, parseUsage } from './analysis.ts';
import { RESEARCH_LIMITS } from './research.ts';
import { parseListingDetails, loadListingDetails } from './listing-details.ts';

function recordInit(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}
const workspaceId = '54000000-0000-4000-8000-000000000001';
const listingId = '54000000-0000-4000-8000-000000000002';
const listing = {
  id: listingId,
  url: 'https://www.vinted.de/items/123-jacket',
  title: 'Modell 42',
  description: 'Etikett ABC',
  image_urls: ['https://images1.vinted.net/a.jpg'],
  item_price: 20,
  total_price: 22,
  currency: 'EUR',
  brand: 'Marke',
  size: '42',
  condition: 'Gut',
};
const comparison = (price: number, index: number, kind = 'sold') => ({
  title: 'Modell 42',
  url: `https://www.ebay.de/itm/${index}`,
  kind,
  price,
  currency: 'EUR',
  sameVariant: true,
  evidence: 'Modell ABC 42, gebraucht, tatsächlich gezahlter Preis',
});
function provider(
  comparisons = [comparison(60, 1), comparison(70, 2), comparison(80, 3)],
  confidence = 'exact',
) {
  return {
    id: 'resp_test',
    status: 'completed',
    usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200 }, output_tokens: 500 },
    output: [
      { type: 'web_search_call', action: { sources: comparisons.map(({ url }) => ({ url })) } },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              modelName: 'Marke Modell ABC',
              confidence,
              evidence: 'Etikett und Hersteller bestätigt',
              comparisons,
            }),
          },
        ],
      },
    ],
  };
}
function productProvider(
  comparisons = [comparison(120, 1, 'retail')],
  summary = 'Herstellerpreis 120 EUR',
) {
  const raw = provider(comparisons);
  raw.output[1].content![0].text = JSON.stringify({
    modelName: 'Marke Modell ABC',
    searchQuery: 'Marke Modell ABC',
    confidence: 'exact',
    evidence: 'Etikett und Hersteller bestätigt',
    sources: [],
    retail: { summary, limitations: [], comparisons, sources: [] },
  });
  return raw;
}
function marketProvider(comparisons = [comparison(70, 2)], summary = 'Marktvergleich') {
  const raw = provider(comparisons);
  raw.output[1].content![0].text = JSON.stringify({
    summary,
    limitations: [],
    comparisons,
    sources: [],
  });
  return raw;
}
function verifiedProvider(comparisons: ReturnType<typeof comparison>[], confidence = 'exact') {
  const vinted = comparisons.map((entry, index) => ({
    ...entry,
    url: `https://www.vinted.de/items/${index + 1}-jacket`,
  }));
  const now = new Date();
  const postedAt = new Date(now.getTime() - 10 * 86_400_000).toISOString();
  return {
    ...provider(vinted, confidence),
    researchedAt: now.toISOString(),
    comparisonDates: vinted.map(({ url }) => ({
      url,
      listingDate: {
        status: 'within_window',
        earliest: postedAt,
        latest: postedAt,
        label: '10 Tage',
        checkedAt: now.toISOString(),
        source: 'vinted_listing',
      },
    })),
  };
}
function fixture(overrides: Partial<SearchDependencies> = {}) {
  const saved: Record<string, unknown>[] = [];
  let calls = 0;
  const deps: SearchDependencies = {
    authenticate: async () => 'operator',
    authorize: async () => true,
    configured: () => true,
    listing: async () => listing,
    reserve: async () => ({ id: 1, cached: false }),
    save: async (_id, values) => {
      saved.push(values);
    },
    usage: async () => [],
    search: async () => {
      calls++;
      return provider();
    },
    ...overrides,
  };
  const handler = createSearchHandler(deps);
  const request = (
    body: unknown = { workspaceId, listingId },
    headers: Record<string, string> = { Authorization: 'Bearer test' },
  ) =>
    handler(
      new Request('https://app.test/functions/v1/vinted-ai-search', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  return { request, saved, calls: () => calls };
}
Deno.test(
  'alle vier freigegebenen Modelle werden unveraendert an den Anbieter uebergeben',
  async () => {
    for (const model of ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra'] as const) {
      let selected = '';
      const test = fixture({
        search: async (_listing, _images, chosen) => {
          selected = chosen;
          return provider();
        },
      });
      equal((await test.request({ workspaceId, listingId, model })).status, 200);
      equal(selected, model);
    }
    equal(parseUsage(provider(), 'gpt-6.1-terra').estimatedCostUsd, 0.01331);
    equal(parseUsage(provider(), 'gpt-6-astra').estimatedCostUsd, 0.0432);
  },
);
Deno.test('weist fehlende Anmeldung und Beta-Nutzer vor Anbieteraufruf ab', async () => {
  const noToken = fixture();
  equal((await noToken.request({}, {})).status, 401);
  equal(noToken.calls(), 0);
  const beta = fixture({ authorize: async () => false });
  equal((await beta.request()).status, 403);
  equal(beta.calls(), 0);
  const revoked = fixture({ authenticate: async () => null });
  equal((await revoked.request()).status, 401);
});
Deno.test('weist fremde Herkunft, ungueltige Eingaben und fremde Modelle ab', async () => {
  const test = fixture();
  equal(
    (await test.request({}, { Authorization: 'Bearer test', Origin: 'https://evil.test' })).status,
    403,
  );
  equal((await test.request({ workspaceId: 'bad', listingId })).status, 400);
  equal(
    (await test.request({ workspaceId, listingId, model: 'not-an-allowed-model' })).status,
    400,
  );
  equal((await test.request({ workspaceId, listingId, model: '__proto__' })).status, 400);
  equal((await test.request({ workspaceId, listingId, text: 'x'.repeat(4096) })).status, 400);
  equal(test.calls(), 0);
});
Deno.test(
  'reserviert vor Kosten und nutzt ausschliesslich serverseitige Inseratdaten',
  async () => {
    let reserved = false;
    const test = fixture({
      reserve: async (_user, workspace, id, hash, model) => {
        equal(workspace, workspaceId);
        equal(id, listingId);
        equal(hash.length, 64);
        equal(model, 'gpt-6-luna');
        reserved = true;
        return { id: 1, cached: false };
      },
      search: async (item, images) => {
        equal(reserved, true);
        equal(item.title, listing.title);
        equal(images, listing.image_urls);
        return provider();
      },
    });
    const response = await test.request({ workspaceId, listingId, title: 'Erfindung', price: 0 });
    equal(response.status, 200);
    const body = await response.json();
    equal(body.listing.totalPrice, 22);
    equal(body.analysis.soldAverage, null);
    equal(body.analysis.currentMarket, {
      low: 60,
      high: 80,
      count: 3,
      basis: 'sold',
      match: 'model',
    });
    equal(test.saved.length, 2);
    equal(test.saved[0].input_tokens, 1000);
    equal(test.saved[1].status, 'completed');
  },
);
Deno.test(
  'startet bei Reservierungsfehler, Limits oder paralleler Suche keinen Anbieteraufruf',
  async () => {
    for (const code of ['search_busy', 'search_limit']) {
      const test = fixture({ reserve: async () => ({ id: 0, cached: false, error: code }) });
      equal((await test.request()).status, 429);
      equal(test.calls(), 0);
    }
    const test = fixture({
      reserve: async () => {
        throw new Error('db down');
      },
    });
    equal((await test.request()).status, 503);
    equal(test.calls(), 0);
  },
);
Deno.test('laedt Cache und Statistik ohne erneuten Anbieteraufruf', async () => {
  const test = fixture({
    reserve: async () => ({ id: 1, cached: true, result: { analysis: {}, usage: {} } }),
  });
  const response = await test.request();
  equal(response.status, 200);
  equal((await response.json()).cacheHit, true);
  equal(test.calls(), 0);
  equal(test.saved.length, 0);
  const stats = fixture();
  equal((await stats.request({ workspaceId, action: 'usage' })).status, 200);
  equal(stats.calls(), 0);
});
Deno.test(
  'erfasst Kosten auch bei unvollstaendiger Antwort und haelt Abbrueche offen',
  async () => {
    const incomplete = fixture({ search: async () => ({ ...provider(), status: 'incomplete' }) });
    equal((await incomplete.request()).status, 502);
    equal(incomplete.saved[0].estimated_cost_usd, 0.010332);
    equal(incomplete.saved[1].status, 'failed');
    const aborted = fixture({
      search: async () => {
        throw new Error('timeout');
      },
    });
    equal((await aborted.request()).status, 502);
    equal(aborted.saved[0].status, 'unknown');
    equal(aborted.saved[0].estimated_cost_usd, undefined);
    const failure = fixture({
      save: async () => {
        throw new Error('db down');
      },
    });
    equal((await failure.request()).status, 503);
  },
);
Deno.test('behandelt fehlende Verbrauchswerte nicht als kostenlos', () => {
  equal(parseUsage({}, 'gpt-6-luna').estimatedCostUsd, null);
  equal(parseUsage(provider(), 'gpt-6.1-sol').estimatedCostUsd, 0.01662);
  equal(
    parseUsage(
      { usage: { input_tokens: 2, output_tokens: 1, input_tokens_details: { cached_tokens: 3 } } },
      'gpt-6-luna',
    ).estimatedCostUsd,
    null,
  );
});
Deno.test('akzeptiert nur gefundene EUR-Quellen derselben Variante und entfernt Duplikate', () => {
  const valid = comparison(60, 1);
  const invalids = [
    { ...comparison(3, 2), currency: 'USD' },
    { ...comparison(5, 3), sameVariant: false },
    { ...comparison(2, 4), price: -1 },
  ];
  const raw = provider([valid, valid, ...invalids]);
  raw.output[1].content![0].text = JSON.stringify({
    modelName: 'ABC',
    confidence: 'exact',
    evidence: '',
    comparisons: [valid, valid, ...invalids, comparison(20, 99)],
  });
  const analysis = parseAnalysis(raw);
  equal(analysis.comparisons.length, 2);
  equal(analysis.comparisons[1].sameVariant, false);
  equal(analysis.resale, null);
});
Deno.test(
  'berechnet bei wahrscheinlichem Modell nur eine vorlaeufige Spanne und benoetigt drei Preise',
  () => {
    const prices = [comparison(60, 1), comparison(70, 2), comparison(80, 3)];
    equal(parseAnalysis(verifiedProvider(prices.slice(0, 2))).resale, null);
    equal(parseAnalysis(verifiedProvider(prices, 'likely')).resale?.count, 3);
    equal(parseAnalysis(verifiedProvider(prices, 'unknown')).resale, null);
    const asking = parseAnalysis(
      verifiedProvider([
        comparison(100, 1, 'asking'),
        comparison(100, 2, 'asking'),
        comparison(100, 3, 'asking'),
      ]),
    );
    equal(asking.soldAverage, null);
    equal(asking.resale, { low: 100, high: 100, count: 3, basis: 'asking' });
  },
);
Deno.test('zaehlt verschiedene Query-Links desselben Inserats nicht als mehrere Verkaeufe', () => {
  const comparisons = [0, 1, 2].map((index) => ({
    ...comparison(60, 1),
    url: `https://www.ebay.de/itm/1?tracking=${index}`,
  }));
  const analysis = parseAnalysis(provider(comparisons));
  equal(analysis.comparisons.length, 1);
  equal(analysis.resale, null);
});
Deno.test(
  'eine leere Modellidentifikation darf trotz exact-Angabe keine Ampel ermoeglichen',
  () => {
    const raw = provider();
    raw.output[1].content![0].text = JSON.stringify({
      modelName: ' ',
      confidence: 'exact',
      evidence: 'Vermutung',
      comparisons: [comparison(60, 1), comparison(70, 2), comparison(80, 3)],
    });
    const analysis = parseAnalysis(raw);
    equal(analysis.confidence, 'unknown');
    equal(analysis.resale, null);
  },
);
Deno.test('uebergibt auch spaete Etikettenbilder und begrenzt auf sichere Vinted-Adressen', () => {
  equal(
    listingImages([
      'http://images1.vinted.net/a',
      'https://vinted.net.evil.test/a',
      'https://user:pass@images1.vinted.net/a',
      'https://images1.vinted.net:444/a',
      ...Array.from({ length: 8 }, (_, i) => `https://images1.vinted.net/${i}`),
    ]).length,
    8,
  );
});
Deno.test(
  'sendet begrenzte Vision-Webanfrage mit vorhandenem Serverzugang und ohne Speicherung',
  async () => {
    const keys = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
      'OPENAI_API_KEY',
    ];
    const previous = keys.map((key) => Deno.env.get(key));
    const originalFetch = globalThis.fetch;
    const requests: Record<string, unknown>[] = [];
    const urls: string[] = [];
    try {
      for (const key of keys)
        Deno.env.set(
          key,
          key === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'synthetic-test-value',
        );
      globalThis.fetch = async (url, init) => {
        urls.push(String(url));
        if (new URL(String(url)).pathname === '/catalog') return new Response('');
        const body = JSON.parse(String(recordInit(init)?.['body']));
        requests.push(body);
        return Response.json(requests.length === 1 ? productProvider() : marketProvider());
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna');
      equal(requests.length, 2);
      equal(
        urls.map((url) => new URL(url).hostname),
        ['api.openai.com', 'www.vinted.de', 'api.openai.com'],
      );
      for (const [index, body] of requests.entries()) {
        const request = body as {
          model: string;
          store: boolean;
          tool_choice: string;
          reasoning: { effort: string };
          max_output_tokens: number;
          max_tool_calls: number;
          tools: { search_context_size: string }[];
          text: {
            format: {
              schema: {
                required: string[];
                properties: { sources: { maxItems: number }; retail?: unknown };
              };
            };
          };
          input: { content: { text?: string; image_url?: string }[] }[];
        };
        equal(request.model, 'gpt-6-luna');
        equal(request.store, false);
        equal(request.tool_choice, 'required');
        equal(request.reasoning.effort, 'low');
        equal(request.tools[0].search_context_size, 'low');
        equal(request.max_output_tokens, RESEARCH_LIMITS.outputTokens);
        equal(
          request.max_tool_calls,
          index === 0 ? RESEARCH_LIMITS.productTools : RESEARCH_LIMITS.usedTools,
        );
        equal(request.input[0].content.length, index === 0 ? 2 : 1);
        const input = JSON.parse(request.input[0].content[0].text!);
        equal(input.description, listing.description);
        equal(input.itemPrice, 20);
        equal(input.totalPrice, 22);
        equal(input.listingWindowDays, 30);
        if (index === 0) {
          equal(request.text.format.schema.properties.sources.maxItems, 3);
          equal(request.text.format.schema.required.includes('searchQuery'), true);
          equal(request.input[0].content[1].image_url, listing.image_urls[0]);
        } else {
          equal(input.identification.modelName, 'Marke Modell ABC');
          equal(input.identification.searchQuery, 'Marke Modell ABC');
          equal(input.retail.summary, 'Herstellerpreis 120 EUR');
        }
      }
      equal(parseUsage(raw, 'gpt-6-luna').inputTokens, 2000);
      equal(parseUsage(raw, 'gpt-6-luna').webSearchCalls, 2);
      equal(parseAnalysis(raw).research?.used.summary, 'Marktvergleich');
    } finally {
      globalThis.fetch = originalFetch;
      keys.forEach((key, index) => {
        const value = previous[index];
        if (value === undefined) Deno.env.delete(key);
        else Deno.env.set(key, value);
      });
    }
  },
);

const detailsHtml = (objects: unknown[]) => {
  const stream = objects.map((value, index) => `${index}:${JSON.stringify(value)}\n`).join('');
  // React darf einen JSON-Datensatz über mehrere Scriptblöcke verteilen.
  const middle = Math.floor(stream.length / 2);
  return [stream.slice(0, middle), stream.slice(middle)]
    .map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`)
    .join('');
};
Deno.test(
  'liest alle sechs Fotos und Beschreibung derselben Anzeige statt des einzelnen Feed-Fotos',
  async () => {
    const images = Array.from(
      { length: 6 },
      (_, index) => `https://images1.vinted.net/${index}.jpg`,
    );
    const html = detailsHtml([
      {
        data: {
          item_id: '999',
          description: 'Fremde Anzeige',
          photos: [{ url: 'https://images1.vinted.net/other' }],
        },
      },
      { data: { item_id: '123', photos: images.map((url) => ({ url })) } },
      { data: { item_id: '123', description: 'Innenetikett und Modellnummer' } },
    ]);
    equal(parseListingDetails(html, '123'), {
      image_urls: images,
      description: 'Innenetikett und Modellnummer',
      attributes: [],
      category: null,
    });
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, init) => {
        equal(String(url), listing.url);
        equal(recordInit(init)?.['redirect'], 'error');
        equal(recordInit(init)?.['headers'], undefined);
        return new Response(html);
      };
      const enriched = await loadListingDetails({ ...listing, description: null });
      equal(enriched.image_urls, images);
      equal(enriched.description, 'Innenetikett und Modellnummer');
      equal(enriched.detailsStatus, 'loaded');
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
Deno.test(
  'liest die Artikelmerkmale der Detailseite und uebergibt sie beiden Recherchen',
  async () => {
    const attribute = (code: string, label: string, value: unknown) => ({
      code,
      type: 'text',
      data: { title: label, value, id: 'not-needed', seller_id: 'private-id' },
    });
    const images = Array.from(
      { length: 6 },
      (_, index) => `https://images1.vinted.net/${index}.jpg`,
    );
    const html = detailsHtml([
      {
        item_id: '999',
        catalog_id: '999',
        breadcrumbs: [{ title: 'Fremde Kategorie', url: '/catalog/999-other' }],
        attributes: [attribute('material', 'Material', 'Leder')],
      },
      {
        item_id: '123',
        photos: images.map((url) => ({ url })),
        description: 'Eigene Artikelbeschreibung',
      },
      {
        item_id: '123',
        catalog_id: '1858',
        breadcrumbs: [
          { title: 'Herren', url: '/catalog/5-men' },
          { title: 'Kleidung', url: '/catalog/2050-clothing' },
          { title: 'Jacken & Mäntel', url: '/catalog/1206-outerwear' },
          { title: 'Jacken', url: '/catalog/2052-jackets' },
          { title: 'Fleecejacken', url: '/catalog/1858-fleece-jackets' },
          {
            title: 'Carhartt Fleecejacken',
            url: '/catalog/1858-fleece-jackets/brand/362-carhartt',
          },
        ],
      },
      {
        item_id: '123',
        attributes: [
          attribute('brand', 'Marke', 'Carhartt'),
          attribute('size', 'Größe', 'L'),
          attribute('status', 'Zustand', 'Sehr gut'),
          attribute('material', 'Material', ['Fleece', 'Polyester']),
          attribute('color', 'Farbe', ['Creme', 'Schwarz']),
          attribute('measurements', 'Maße', 'Brustweite 58 cm'),
          attribute('article_number', 'Artikelnummer', 'I025120'),
          attribute('weight', 'Gewicht', 450),
          attribute('upload_date', 'Hochgeladen', '11 h'),
          attribute('broken', 'Ungültig', { private: true }),
        ],
      },
    ]);
    const originalFetch = globalThis.fetch;
    const contexts: Record<string, unknown>[] = [];
    try {
      const requestBodies: { input: { content: { text: string }[] }[] }[] = [];
      globalThis.fetch = async (url, init) => {
        if (String(url) === listing.url) return new Response(html);
        if (new URL(String(url)).pathname === '/catalog') return new Response('');
        const body = JSON.parse(String(recordInit(init)?.['body']));
        requestBodies.push(body);
        const input = JSON.parse(body.input[0].content[0].text);
        contexts.push(input);
        return Response.json(
          input.identification
            ? marketProvider([], 'Kontext bestätigt')
            : productProvider([], 'Kontext bestätigt'),
        );
      };
      const enriched = await loadListingDetails({
        ...listing,
        brand: 'Feed-Marke',
        size: 'XXL',
        condition: 'Neu',
      });
      equal(enriched.attributes?.length, 8);
      const result = await searchOpenAi(enriched, enriched.image_urls, 'gpt-6-astra');
      equal(contexts.length, 2);
      equal(
        requestBodies.map((body) => body.input[0].content.length),
        [7, 1],
      );
      for (const input of contexts) {
        equal(input.brand, 'Carhartt');
        equal(input.size, 'L');
        equal(input.condition, 'Sehr gut');
        equal(input.description, 'Eigene Artikelbeschreibung');
        equal(input.detailsStatus, 'loaded');
        equal(input.category, {
          id: '1858',
          path: ['Herren', 'Kleidung', 'Jacken & Mäntel', 'Jacken', 'Fleecejacken'],
        });
        equal(
          (input.attributes as { value: string }[]).map((entry) => entry.value),
          [
            'Carhartt',
            'L',
            'Sehr gut',
            'Fleece, Polyester',
            'Creme, Schwarz',
            'Brustweite 58 cm',
            'I025120',
            '450',
          ],
        );
        equal(JSON.stringify(input).includes('private-id'), false);
        equal(JSON.stringify(input).includes('Leder'), false);
        equal(JSON.stringify(input).includes('upload_date'), false);
      }
      equal(parseAnalysis(result).research?.retail.completed, true);
      equal(parseAnalysis(result).research?.used.completed, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
Deno.test(
  'erhaelt Feed-Daten bei gesperrten, fremden oder zu grossen Inseratseiten ohne Script-Ausfuehrung',
  async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const response of [
        new Response('blocked', { status: 403 }),
        new Response(
          detailsHtml([{ item_id: '999', photos: [{ url: 'https://images1.vinted.net/other' }] }]),
        ),
        new Response('x'.repeat(3_000_001)),
        new Response('<script>throw new Error("never execute")</script>'),
      ]) {
        globalThis.fetch = async () => response;
        const enriched = await loadListingDetails(listing);
        equal(enriched.image_urls, listing.image_urls);
        equal(enriched.detailsStatus, 'unavailable');
      }
      let fetched = false;
      globalThis.fetch = async () => {
        fetched = true;
        return new Response('');
      };
      await loadListingDetails({ ...listing, url: 'https://www.vinted.de.evil.test/items/123' });
      equal(fetched, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
Deno.test(
  'behaelt Recherchequellen ohne Preisbeleg und bereinigt unbedienbare Zitiermarker',
  () => {
    const raw = {
      ...provider([]),
      research: {
        identification: {
          raw: provider([comparison(0, 99)]),
          summary: 'Merkmale citeturn0search1 [Hersteller](https://www.ebay.de/itm/99)',
          completed: true,
        },
        retail: {
          raw: provider([]),
          data: { summary: 'Ausgelaufen', limitations: ['Kein aktueller Neupreis'] },
          completed: true,
        },
        used: { raw: {}, data: { summary: '', limitations: ['Zeitlimit'] }, completed: false },
      },
    };
    const analysis = parseAnalysis(raw);
    equal(analysis.research?.identification.sources[0].url, 'https://www.ebay.de/itm/99');
    equal(analysis.research?.identification.summary, 'Merkmale  Hersteller');
    equal(analysis.research?.retail.limitations, ['Kein aktueller Neupreis']);
    equal(analysis.research?.used.completed, false);
    equal(analysis.resale, null);
  },
);
Deno.test(
  'verknuepft Trackingvarianten mit echten Quellen und zaehlt das untersuchte Inserat nicht mit',
  () => {
    const self = { ...comparison(30, 1), url: listing.url };
    const retail = {
      ...comparison(120, 2, 'retail'),
      url: 'https://shop.test/product?size=L&utm_source=search',
    };
    const raw = provider([self, retail]);
    raw.output[1].content![0].text = JSON.stringify({
      modelName: 'ABC',
      confidence: 'exact',
      evidence: 'Nummer',
      comparisons: [self, { ...retail, url: 'https://shop.test/product?size=L' }],
    });
    const analysis = parseAnalysis(raw, listing.url);
    equal(analysis.comparisons.length, 1);
    equal(analysis.comparisons[0].url, retail.url);
    equal(analysis.newPriceRange, { low: 120, high: 120, count: 1 });
  },
);
Deno.test(
  'weist Kosten nach abgebrochener Teilrecherche als unbekannt aus und behaelt erfolgreiche Recherche',
  async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    try {
      globalThis.fetch = async (url) => {
        if (new URL(String(url)).pathname === '/catalog') return new Response('');
        requests++;
        if (requests === 2) throw new Error('timeout');
        return Response.json(productProvider());
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra');
      equal(requests, 2);
      equal(parseUsage(raw, 'gpt-6-astra').estimatedCostUsd, null);
      equal(parseUsage(raw, 'gpt-6-astra').inputTokens, 1000);
      equal(parseUsage(raw, 'gpt-6-astra').outputTokens, 500);
      equal(parseUsage(raw, 'gpt-6-astra').knownCostUsd, 0.0432);
      equal(parseUsage(raw, 'gpt-6-astra').incomplete, true);
      equal(parseAnalysis(raw).research?.retail.summary, 'Herstellerpreis 120 EUR');
      equal(parseAnalysis(raw).research?.used.completed, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'verlinkt benannte Belege nur nach Abgleich mit den Quellen derselben Teilrecherche',
  () => {
    const raw = {
      ...provider([]),
      research: {
        identification: {
          raw: provider([comparison(20, 1)]),
          data: {
            sources: [
              { title: 'Belegtes Modell', url: 'https://www.ebay.de/itm/1' },
              { title: 'Erfundene Quelle', url: 'https://invented.test/item' },
            ],
          },
          completed: true,
        },
      },
    };
    equal(parseAnalysis(raw).research?.identification.sources, [
      { url: 'https://www.ebay.de/itm/1', title: 'Belegtes Modell' },
    ]);
  },
);
Deno.test(
  'erhaelt gemeldeten Verbrauch bei unvollstaendiger Identifikation und Marktantwort',
  async () => {
    const originalFetch = globalThis.fetch;
    try {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json({ ...provider(), status: 'incomplete' });
      };
      const incomplete = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra');
      equal(calls, 1);
      equal(incomplete.status, 'incomplete');
      equal(parseUsage(incomplete, 'gpt-6-astra').inputTokens, 1000);
      calls = 0;
      globalThis.fetch = async (url) => {
        if (new URL(String(url)).pathname === '/catalog') return new Response('');
        calls++;
        return Response.json(
          calls === 1 ? productProvider() : { ...provider(), status: 'incomplete' },
        );
      };
      const partial = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra');
      equal(calls, 2);
      equal(parseUsage(partial, 'gpt-6-astra').inputTokens, 2000);
      equal(parseUsage(partial, 'gpt-6-astra').estimatedCostUsd, 0.0864);
      equal(parseAnalysis(partial).research?.used.completed, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'liefert nutzbare Teilergebnisse ohne sie als vollstaendigen 24-Stunden-Cache zu speichern',
  async () => {
    const raw = {
      ...provider(),
      research: {
        identification: { raw: provider(), summary: 'Modell erkannt', completed: true },
        retail: {
          raw: provider(),
          data: { summary: 'Herstellerpreis', comparisons: [] },
          completed: true,
        },
        used: { raw: {}, data: { limitations: ['Zeitlimit'], comparisons: [] }, completed: false },
      },
    };
    const test = fixture({ search: async () => raw });
    const response = await test.request();
    equal(response.status, 200);
    equal((await response.json()).analysis.research.used.completed, false);
    equal(test.saved.at(-1)?.status, 'failed');
    equal(test.saved.at(-1)?.error_code, 'research_incomplete');
  },
);

Deno.test(
  'beendet eine vollstaendige Recherche nach 113 Sekunden innerhalb der gemeinsamen Grenze',
  async () => {
    const originalFetch = globalThis.fetch;
    const originalTimeout = AbortSignal.timeout;
    let elapsed = 0;
    let paidCalls = 0;
    const timers: { deadline: number; controller: AbortController }[] = [];
    try {
      AbortSignal.timeout = (milliseconds: number) => {
        const controller = new AbortController();
        timers.push({ deadline: elapsed + milliseconds, controller });
        return controller.signal;
      };
      globalThis.fetch = async (url, init) => {
        const catalog = new URL(String(url)).pathname === '/catalog';
        if (!catalog) paidCalls++;
        elapsed += catalog ? 4_000 : paidCalls === 1 ? 54_000 : 55_000;
        for (const timer of timers)
          if (elapsed >= timer.deadline)
            timer.controller.abort(new DOMException('Deadline reached', 'TimeoutError'));
        const requestSignal = recordInit(init)?.['signal'];
        if (requestSignal instanceof AbortSignal) requestSignal.throwIfAborted();
        if (catalog) return new Response('');
        return Response.json(
          paidCalls === 1
            ? productProvider([], 'Vollständige Marktrecherche')
            : marketProvider([], 'Vollständige Marktrecherche'),
        );
      };
      const result = parseAnalysis(await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra'));
      equal(paidCalls, 2);
      equal(elapsed, 113_000);
      equal(timers[0].deadline, 130_000);
      equal(result.research?.retail.completed, true);
      equal(result.research?.used.completed, true);
    } finally {
      globalThis.fetch = originalFetch;
      AbortSignal.timeout = originalTimeout;
    }
  },
);

Deno.test('erneuert den Cache-Schlüssel nach Änderung der Rechercheversion', async () => {
  const hash = async (version: string) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify({ version, ...listing, image_urls: listing.image_urls }),
          ),
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  const oldHash = await hash('vinted-product-research-6');
  const expectedHash = await hash('vinted-product-research-7');
  let capturedHash = '';
  const test = fixture({
    reserve: async (_user, _workspace, _listing, inputHash) => {
      capturedHash = inputHash;
      return { id: 1, cached: inputHash === oldHash, result: { analysis: {}, usage: {} } };
    },
  });
  const response = await test.request();
  equal(response.status, 200);
  equal(capturedHash, expectedHash);
  equal(capturedHash === oldHash, false);
  equal(test.calls(), 1);
  equal((await response.json()).cacheHit, false);
});

Deno.test('erhält unbekannte Gesamtkosten und lehnt tatsächlich ungültige Preise ab', async () => {
  const unknown = fixture({ listing: async () => ({ ...listing, total_price: null }) });
  const response = await unknown.request();
  equal(response.status, 200);
  equal((await response.json()).listing.totalPrice, null);
  equal(unknown.calls(), 1);
  for (const total of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = fixture({ listing: async () => ({ ...listing, total_price: total }) });
    equal((await invalid.request()).status, 400);
    equal(invalid.calls(), 0);
  }
});
