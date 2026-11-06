import {
  createSearchHandler,
  searchOpenAi,
  listingImages,
  type SearchDependencies,
} from './index.ts';
import { parseAnalysis, parseUsage } from './analysis.ts';

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
  equal((await test.request({ workspaceId, listingId, model: 'gpt-6-astra' })).status, 400);
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
    equal(body.analysis.soldAverage, 70);
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
  equal(analysis.comparisons.length, 1);
  equal(analysis.resale, null);
});
Deno.test('leitet ohne drei passende Preise oder eindeutiges Modell keine Marge ab', () => {
  equal(parseAnalysis(provider([comparison(60, 1), comparison(70, 2)])).resale, null);
  equal(parseAnalysis(provider(undefined, 'likely')).resale, null);
  const asking = parseAnalysis(
    provider([
      comparison(100, 1, 'asking'),
      comparison(100, 2, 'asking'),
      comparison(100, 3, 'asking'),
    ]),
  );
  equal(asking.soldAverage, null);
  equal(asking.resale, { low: 70, high: 85, basis: 'asking', count: 3 });
});
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
Deno.test('begrenzt Bilder auf sichere Vinted-Adressen und hoechstens fuenf', () => {
  equal(
    listingImages([
      'http://images1.vinted.net/a',
      'https://vinted.net.evil.test/a',
      'https://user:pass@images1.vinted.net/a',
      'https://images1.vinted.net:444/a',
      ...Array.from({ length: 8 }, (_, i) => `https://images1.vinted.net/${i}`),
    ]).length,
    5,
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
    try {
      for (const key of keys)
        Deno.env.set(
          key,
          key === 'SUPABASE_URL' ? 'https://test.supabase.co' : 'synthetic-test-value',
        );
      globalThis.fetch = async (input, init) => {
        equal(input, 'https://api.openai.com/v1/responses');
        const body = JSON.parse(String(recordInit(init)?.['body']));
        equal(body.model, 'gpt-6-luna');
        equal(body.store, false);
        equal(body.max_tool_calls, 3);
        equal(body.max_output_tokens, 3200);
        equal(body.input[0].content.length, 2);
        equal(body.input[0].content[1].image_url, listing.image_urls[0]);
        equal(JSON.parse(body.input[0].content[0].text).description, listing.description);
        return Response.json(provider());
      };
      await searchOpenAi(listing, listing.image_urls, 'gpt-6-luna');
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
