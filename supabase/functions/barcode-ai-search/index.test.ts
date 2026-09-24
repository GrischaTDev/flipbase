import {
  type BarcodeAiDependencies,
  createBarcodeAiHandler,
  estimateCostUsd,
  parseCandidates,
} from './index.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
  }
}

function request(body: unknown, authorization = 'Bearer operator-token'): Request {
  return new Request('https://example.test/functions/v1/barcode-ai-search', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Partial<BarcodeAiDependencies> = {}): BarcodeAiDependencies {
  return {
    authenticate: async () => ({ id: 'operator-1' }),
    isOperator: async () => true,
    isConfigured: () => true,
    search: async () => ({
      candidates: [],
      usage: { inputTokens: 1000, outputTokens: 200, webSearchCalls: 1, estimatedCostUsd: 0.0102 },
    }),
    ...overrides,
  };
}

Deno.test('verweigert Nichtbetreibern die kostenpflichtige Suche', async () => {
  let searchCalled = false;
  const handler = createBarcodeAiHandler(
    dependencies({
      isOperator: async () => false,
      search: async () => {
        searchCalled = true;
        throw new Error('nicht erreichbar');
      },
    }),
  );
  const response = await handler(request({ ean: '4099758601276' }));
  assertEquals(response.status, 403);
  assertEquals(searchCalled, false);
});

Deno.test('liefert ohne Secret keinen bezahlten Aufruf aus', async () => {
  const handler = createBarcodeAiHandler(dependencies({ isConfigured: () => false }));
  const response = await handler(request({ ean: '4099758601276' }));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: 'not_configured' });
});

Deno.test('schliesst erfundene Quellen aus den Produktvorschlaegen aus', () => {
  const candidate = (sourceUrl: string) => ({
    title: 'JAKO J-SFG Twist',
    brand: 'JAKO',
    model: 'J-SFG Twist',
    size: '40',
    color: 'Skydiver',
    category: 'Fußballschuhe',
    sourceUrl,
    confidence: 'likely',
    evidence: 'Modell und Farbe genannt',
  });
  const response = {
    output: [
      {
        type: 'web_search_call',
        action: { sources: [{ url: 'https://shop.example.test/jako-twist' }] },
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              candidates: [
                candidate('https://shop.example.test/jako-twist'),
                candidate('https://erfunden.example.test/produkt'),
              ],
            }),
          },
        ],
      },
    ],
  };
  assertEquals(
    parseCandidates(response).map((entry) => entry.sourceUrl),
    ['https://shop.example.test/jako-twist'],
  );
});

Deno.test('schaetzt Suchaufrufe und Tokens getrennt', () => {
  assertEquals(
    estimateCostUsd(
      {
        input_tokens: 10_000,
        output_tokens: 1_000,
        input_tokens_details: { cached_tokens: 2_000 },
      },
      2,
    ),
    0.02132,
  );
});
