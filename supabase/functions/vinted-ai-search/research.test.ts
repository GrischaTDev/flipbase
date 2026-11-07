import { parseAnalysis, parseUsage } from './analysis.ts';
import { searchOpenAi } from './research.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
const listing = {
  id: 'research-listing',
  url: 'https://www.vinted.de/items/123-fleece',
  title: 'Carhartt Fleecejacke',
  description: 'Fleece, kaum getragen',
  image_urls: ['https://images1.vinted.net/front', 'https://images1.vinted.net/label'],
  item_price: 20,
  total_price: 22,
  currency: 'EUR',
  brand: 'Carhartt',
  size: 'L',
  condition: 'Sehr gut',
  category: { id: '1858', path: ['Herren', 'Kleidung', 'Fleecejacken'] },
};
const product = {
  modelName: 'Carhartt Prentis Liner',
  searchQuery: 'Carhartt Prentis Liner',
  confidence: 'likely',
  evidence: 'Text und Etikett passen.',
  sources: [],
  retail: {
    summary: 'Kein aktueller Original-Neupreis belegt.',
    limitations: [],
    comparisons: [],
    sources: [],
  },
};
function provider(data: unknown, usage: unknown = { input_tokens: 1000, output_tokens: 500 }) {
  return {
    status: 'completed',
    usage,
    output: [
      { type: 'web_search_call', action: { sources: [] } },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] },
    ],
  };
}
const detailsHtml = (entry: unknown) =>
  `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(entry)}\n`])})</script>`;

Deno.test(
  'nutzt nach Modell- und Neupreisrecherche den gesamten Datenbestand ohne weitere KI- oder Vinted-Abrufe',
  async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    let datasetCalls = 0;
    try {
      globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        const body = JSON.parse(String(record(init)['body']));
        equal(body.input[0].content.length, 3);
        return Response.json(provider(product));
      };
      const dataset = {
        windowDays: 30,
        initialImportDays: 7,
        asOf: '2026-11-07T12:00:00.000Z',
        observedSince: '2026-11-01T12:00:00.000Z',
        initialImportStatus: 'complete',
        match: 'model',
        active: {
          count: 2000,
          median: 55,
          lowerQuartile: 40,
          upperQuartile: 70,
          minimum: 1,
          maximum: 200,
        },
        soldMarked: {
          count: 250,
          median: 45,
          lowerQuartile: 35,
          upperQuartile: 60,
          minimum: 5,
          maximum: 160,
        },
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna', {
        marketDataset: async (item, modelName) => {
          datasetCalls++;
          equal(item.id, listing.id);
          equal(modelName, product.modelName);
          return dataset;
        },
      });
      equal(calls, ['https://api.openai.com/v1/responses']);
      equal(datasetCalls, 1);
      const result = parseAnalysis(raw);
      equal(result.marketDataset, dataset);
      equal(result.research?.used.completed, true);
      equal(result.comparisons, []);
      equal(parseUsage(raw, 'gpt-6-luna').webSearchCalls, 1);
      equal(parseUsage(raw, 'gpt-6-luna').incomplete, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'erfindet bei Datenbankfehlern keine Preise und startet keinen kostenpflichtigen Livefallback',
  async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        return Response.json(
          provider({ ...product, confidence: 'unknown' }, { input_tokens: 1000 }),
        );
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra', {
        marketDataset: async (_item, modelName) => {
          equal(modelName, null);
          throw new Error('database unavailable');
        },
      });
      equal(calls, 1);
      const result = parseAnalysis(raw);
      equal(result.marketDataset?.initialImportStatus, 'unavailable');
      equal(result.marketDataset?.match, 'category');
      equal(result.marketDataset?.active, null);
      equal(result.research?.used.completed, false);
      equal(result.research?.used.limitations, [
        'Die gespeicherten Vergleichsdaten konnten nicht geladen werden.',
      ]);
      equal(parseUsage(raw, 'gpt-6-astra').incomplete, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test('startet ab 0,75 USD bekannten Erstkosten keinen weiteren Abruf', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return Response.json(provider(product, { input_tokens: 73_500, output_tokens: 100 }));
    };
    const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra');
    equal(calls, ['https://api.openai.com/v1/responses']);
    equal(parseUsage(raw, 'gpt-6-astra').estimatedCostUsd, 0.75);
    const result = parseAnalysis(raw);
    equal(result.research?.retail.completed, true);
    equal(result.research?.used.completed, false);
    equal(
      result.research?.used.limitations.some((value) => value.includes('Kosten- oder Zeitbudget')),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test(
  'ungeklärter Erstverbrauch verhindert weitere Kosten und bleibt ausdrücklich unbekannt',
  async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        return Response.json(provider(product, { input_tokens: 1000 }));
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-astra');
      equal(calls, 1);
      equal(parseUsage(raw, 'gpt-6-astra').estimatedCostUsd, null);
      equal(parseUsage(raw, 'gpt-6-astra').incomplete, true);
      equal(parseAnalysis(raw).research?.used.completed, false);
      equal(
        parseAnalysis(raw).research?.used.limitations.some((value) =>
          value.includes('nicht vollständig gemeldet'),
        ),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'nutzt bei unklarem Modell Kategorie und Originalquellen vor der gezielten Gebrauchtanalyse',
  async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    const candidateUrl = 'https://www.vinted.de/items/456-fleece';
    const candidate = {
      title: 'Carhartt Fleece L',
      url: 'https://www.vinted.fr/items/456-veste?utm_source=search',
      kind: 'sold',
      price: 999,
      currency: 'EUR',
      sameVariant: false,
      match: 'category',
      evidence: 'Gleiche Marke, Fleecejacke, L, sehr gut; Modell unbestimmt.',
    };
    try {
      globalThis.fetch = async (url, init) => {
        urls.push(String(url));
        const target = new URL(String(url));
        if (target.pathname === '/catalog')
          return new Response(
            detailsHtml({
              productItem: {
                id: 456,
                url: candidateUrl,
                title: candidate.title,
                price: { amount: '65', currencyCode: 'EUR' },
                itemBox: { firstLine: 'Carhartt', secondLine: 'L · Sehr gut' },
              },
            }),
          );
        if (target.pathname.startsWith('/items/'))
          return new Response(
            detailsHtml({
              item_id: '456',
              attributes: [
                { code: 'upload_date', data: { title: 'Hochgeladen', value: '2 Wochen' } },
              ],
            }),
          );
        const body = JSON.parse(String(record(init)['body'])) as Record<string, unknown>;
        bodies.push(body);
        return Response.json(
          bodies.length === 1
            ? provider({
                ...product,
                modelName: 'Carhartt Fleecejacke',
                confidence: 'unknown',
                searchQuery: 'Carhartt Fleecejacken',
              })
            : provider({
                summary: 'Vergleich über dieselbe Kategorie, Modell nicht belegt.',
                limitations: [],
                comparisons: [candidate],
                sources: [],
              }),
        );
      };
      const result = parseAnalysis(await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna'));
      equal(
        urls.map((url) => new URL(url).pathname),
        ['/v1/responses', '/catalog', '/v1/responses', '/items/456-fleece'],
      );
      equal(bodies.length, 2);
      const firstInput = (bodies[0]['input'] as { content: unknown[] }[])[0].content;
      const usedInput = (bodies[1]['input'] as { content: { text: string }[] }[])[0].content;
      equal(firstInput.length, 3);
      equal(usedInput.length, 1);
      const context = JSON.parse(usedInput[0].text);
      equal(context.identification.confidence, 'unknown');
      equal(context.identification.modelName, 'Carhartt Fleecejacke');
      equal(context.identification.searchQuery, 'Carhartt Fleecejacken');
      equal(bodies[0]['max_tool_calls'], 3);
      equal(bodies[1]['max_tool_calls'], 2);
      equal(context.retail, product.retail);
      equal(context.catalogCandidates.length, 1);
      equal(context.catalogCandidates[0].price, 65);
      const search = new URL(urls[1]).searchParams;
      equal(search.get('search_text'), 'Carhartt Fleecejacken');
      equal(search.get('catalog_ids[]'), '1858');
      equal(search.has('price_to'), false);
      equal(search.has('price_from'), false);
      equal(search.get('per_page'), '24');
      equal(result.confidence, 'unknown');
      equal(result.comparisonBasis, 'category');
      equal(result.comparisons.length, 1);
      equal(result.comparisons[0].url, candidateUrl);
      equal(result.comparisons[0].price, 65);
      equal(result.comparisons[0].kind, 'asking');
      equal(result.comparisons[0].listingDate?.status, 'within_window');
      equal(result.askingAverage, 65);
      equal(result.soldAverage, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'unvollständige Originalrecherche ohne Webaufruf darf keine zweite Recherche starten',
  async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        const raw = provider(product);
        return Response.json({
          ...raw,
          output: raw.output.filter((entry) => entry.type !== 'web_search_call'),
        });
      };
      const raw = await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna');
      equal(calls, 1);
      equal(raw.status, 'incomplete');
      equal(parseUsage(raw, 'gpt-6-luna').inputTokens, 1000);
      equal(parseUsage(raw, 'gpt-6-luna').outputTokens, 500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'verwendet die kompakte Modellabfrage statt Farbe und Unsicherheitszusatz im Modellnamen',
  async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    try {
      globalThis.fetch = async (url, init) => {
        urls.push(String(url));
        if (new URL(String(url)).pathname === '/catalog') return new Response('');
        const body = JSON.parse(String(record(init)['body'])) as Record<string, unknown>;
        bodies.push(body);
        return Response.json(
          bodies.length === 1
            ? provider({
                ...product,
                modelName: 'Carhartt WIP Prentis Liner, wahrscheinlich Wax / Wall',
                searchQuery: 'Carhartt Prentis Liner',
              })
            : provider({
                summary: 'Keine weiteren Quellen.',
                limitations: [],
                comparisons: [],
                sources: [],
              }),
        );
      };
      const result = parseAnalysis(await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna'));
      equal(urls.length, 3);
      equal(bodies.length, 2);
      equal(new URL(urls[1]).searchParams.get('search_text'), 'Carhartt Prentis Liner');
      equal(bodies[1]['max_tool_calls'], 4);
      const context = JSON.parse(
        (bodies[1]['input'] as { content: { text: string }[] }[])[0].content[0].text,
      );
      equal(context.identification.searchQuery, 'Carhartt Prentis Liner');
      equal(
        context.identification.modelName,
        'Carhartt WIP Prentis Liner, wahrscheinlich Wax / Wall',
      );
      equal(result.research?.used.completed, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

Deno.test(
  'nutzt eine konkrete Textabfrage auch ohne Kategorie und verhindert reine Markensuchen',
  async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const [query, expectedCatalogCalls] of [
        ['Carhartt Fleecejacke', 1],
        ['Carhartt', 0],
      ] as const) {
        const urls: string[] = [];
        let paidCalls = 0;
        globalThis.fetch = async (url) => {
          urls.push(String(url));
          if (new URL(String(url)).pathname === '/catalog') return new Response('');
          paidCalls++;
          return Response.json(
            paidCalls === 1
              ? provider({
                  ...product,
                  modelName: 'Carhartt Fleecejacke',
                  confidence: 'unknown',
                  searchQuery: query,
                })
              : provider({
                  summary: 'Modell unklar.',
                  limitations: [],
                  comparisons: [],
                  sources: [],
                }),
          );
        };
        const raw = await searchOpenAi(
          { ...listing, category: null },
          listing.image_urls,
          'gpt-6-luna',
        );
        const catalogUrls = urls.filter((url) => new URL(url).pathname === '/catalog');
        equal(paidCalls, 2);
        equal(catalogUrls.length, expectedCatalogCalls);
        if (expectedCatalogCalls)
          equal(new URL(catalogUrls[0]).searchParams.get('search_text'), query);
        equal(parseAnalysis(raw).research?.used.completed, true);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
