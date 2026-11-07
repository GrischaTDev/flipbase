import { parseAnalysis, sourceIdentity, vintedSourceItemId } from './analysis.ts';
import { parseMarketDataset } from './market-dataset.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

const now = '2026-11-07T12:00:00.000Z';
const marketDataset = {
  windowDays: 30,
  initialImportDays: 7,
  asOf: now,
  observedSince: '2026-11-01T12:00:00.000Z',
  initialImportStatus: 'complete',
  match: 'model',
  active: {
    count: 2000,
    median: 55,
    lowerQuartile: 40,
    upperQuartile: 70,
    minimum: 1,
    maximum: 200000,
  },
  soldMarked: {
    count: 300,
    median: 45,
    lowerQuartile: 30,
    upperQuartile: 60,
    minimum: 5,
    maximum: 180,
  },
};
const recent = {
  status: 'within_window',
  earliest: '2026-10-20T12:00:00.000Z',
  latest: '2026-10-27T12:00:00.000Z',
  label: '2 Wochen',
  checkedAt: now,
  source: 'vinted_listing',
};
function comparison(id: number, price: number, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Carhartt Prentis Liner',
    url: `https://www.vinted.de/items/${id}-fleece`,
    kind: 'asking',
    price,
    currency: 'EUR',
    sameVariant: true,
    match: 'model',
    evidence: 'Gleiches Modell, Größe L, sehr guter Zustand, Einzelpreis ohne Versand.',
    ...overrides,
  };
}
function response(
  comparisons: ReturnType<typeof comparison>[],
  overrides: Record<string, unknown> = {},
  model: Record<string, unknown> = {},
) {
  return {
    status: 'completed',
    researchedAt: now,
    comparisonDates: comparisons.map(({ url }) => ({ url, listingDate: recent })),
    output: [
      { type: 'web_search_call', action: { sources: comparisons.map(({ url }) => ({ url })) } },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              modelName: 'Carhartt WIP Prentis Liner',
              confidence: 'exact',
              evidence: 'Artikelnummer und Herstellerquelle stimmen überein.',
              comparisons,
              ...model,
            }),
          },
        ],
      },
    ],
    ...overrides,
  };
}

Deno.test(
  '30-Tage-Kennzahlen verwenden belegte Inseratintervalle und keinen erfundenen Rabatt',
  () => {
    const result = parseAnalysis(
      response([comparison(1, 60), comparison(2, 70), comparison(3, 80)]),
    );
    equal(result.askingAverage, 70);
    equal(result.resale, { low: 60, high: 80, count: 3, basis: 'asking' });
    equal(result.soldAverage, null);
    equal(result.comparisonBasis, 'model');
    equal(result.marketWindow, {
      days: 30,
      checkedAt: now,
      verifiedCount: 3,
      undatedCount: 0,
      excludedCount: 0,
    });
  },
);

Deno.test(
  'übernimmt die volle Datenbankverteilung ohne Preisobergrenze und ohne Einzelbeleg-Mischung',
  () => {
    const result = parseAnalysis(
      response([comparison(1, 60), comparison(2, 70), comparison(3, 80)], { marketDataset }),
    );
    equal(result.marketDataset, marketDataset);
    equal(result.askingAverage, null);
    equal(result.soldAverage, null);
    equal(result.currentMarket, null);
    equal(result.resale, null);
  },
);

Deno.test('vertraut keiner vom Modell erfundenen Datenbankstatistik', () => {
  const result = parseAnalysis(response([], {}, { marketDataset }));
  equal(result.marketDataset, undefined);
});

Deno.test('weist ungültige Datenbankkennzahlen und widersprüchliche Zeitpunkte zurück', () => {
  for (const invalid of [
    { ...marketDataset, windowDays: 90 },
    { ...marketDataset, initialImportDays: 30 },
    { ...marketDataset, asOf: '2026-11-07' },
    { ...marketDataset, observedSince: '2026-11-08T12:00:00Z' },
    { ...marketDataset, initialImportStatus: 'guessed' },
    { ...marketDataset, match: 'different' },
    { ...marketDataset, active: { ...marketDataset.active, count: 0 } },
    { ...marketDataset, active: { ...marketDataset.active, minimum: -1 } },
    { ...marketDataset, active: { ...marketDataset.active, median: NaN } },
    { ...marketDataset, soldMarked: { ...marketDataset.soldMarked, lowerQuartile: 100 } },
  ]) {
    equal(parseMarketDataset(invalid), null);
    const result = parseAnalysis(response([], { marketDataset: invalid }));
    equal(result.marketDataset?.initialImportStatus, 'unavailable');
    equal(result.marketDataset?.active, null);
    equal(result.marketDataset?.soldMarked, null);
  }
});

Deno.test('akzeptiert einen laufenden Erstimport ohne erfundene Preise', () => {
  const initial = {
    ...marketDataset,
    initialImportStatus: 'running',
    observedSince: null,
    active: null,
    soldMarked: null,
  };
  equal(parseMarketDataset(initial), initial);
});

Deno.test('Datumsbehauptungen aus KI-Text erzeugen keine verifizierte 30-Tage-Auswertung', () => {
  const result = parseAnalysis(
    response([comparison(1, 60, { listingDate: recent }), comparison(2, 70), comparison(3, 80)], {
      comparisonDates: [],
    }),
  );
  equal(result.askingAverage, null);
  equal(result.resale, null);
  equal(result.marketWindow.undatedCount, 3);
  equal(result.currentMarket, { low: 60, high: 80, count: 3, basis: 'asking', match: 'model' });
  equal(result.comparisons[0].listingDate?.source, 'unverified');
});

Deno.test('unklares Modell lässt ausdrücklich passende Kategorievergleiche zu', () => {
  const result = parseAnalysis(
    response(
      [
        comparison(1, 30, { match: 'category', sameVariant: false }),
        comparison(2, 40, { match: 'category', sameVariant: false }),
        comparison(3, 50, { match: 'category', sameVariant: false }),
        comparison(4, 200, { match: 'different', sameVariant: false }),
        comparison(5, 500),
      ],
      {},
      { modelName: '', confidence: 'unknown', evidence: 'Fleecejacke, Modell nicht belegbar.' },
    ),
  );
  equal(result.comparisonBasis, 'category');
  equal(result.askingAverage, 40);
  equal(result.resale, { low: 30, high: 50, count: 3, basis: 'asking' });
  equal(result.comparisons[4].match, 'different');
  equal(result.newPriceRange, null);
});

Deno.test('Kategorieangebote werden bei vorhandenen Modellvergleichen nicht beigemischt', () => {
  const result = parseAnalysis(
    response([
      comparison(1, 70),
      comparison(2, 10, { match: 'category', sameVariant: false }),
      comparison(3, 20, { match: 'category', sameVariant: false }),
      comparison(4, 30, { match: 'category', sameVariant: false }),
    ]),
  );
  equal(result.comparisonBasis, 'model');
  equal(result.askingAverage, 70);
  equal(result.resale, null);
  equal(result.currentMarket?.count, 1);
});

Deno.test(
  'fehlende Gebrauchtvergleiche ändern ein erkanntes Modell nicht zum Kategorievergleich',
  () => {
    const identified = parseAnalysis(response([comparison(1, 150, { kind: 'retail' })]));
    equal(identified.comparisonBasis, 'model');
    equal(identified.currentMarket, null);
    equal(identified.resale, null);
    const unknown = parseAnalysis(response([], {}, { confidence: 'unknown', modelName: '' }));
    equal(unknown.comparisonBasis, 'category');
  },
);

Deno.test(
  'alte und die Grenze überlappende Intervalle können nicht als aktuell markiert werden',
  () => {
    const comparisons = [comparison(1, 10), comparison(2, 50), comparison(3, 90)];
    const result = parseAnalysis(
      response(comparisons, {
        comparisonDates: [
          {
            url: comparisons[0].url,
            listingDate: {
              ...recent,
              earliest: '2026-09-01T00:00:00.000Z',
              latest: '2026-09-08T00:00:00.000Z',
            },
          },
          {
            url: comparisons[1].url,
            listingDate: {
              ...recent,
              earliest: '2026-10-08T12:00:00.000Z',
              latest: '2026-10-08T12:00:00.000Z',
            },
          },
          {
            url: comparisons[2].url,
            listingDate: {
              ...recent,
              earliest: '2026-10-08T11:59:59.999Z',
              latest: '2026-10-09T12:00:00.000Z',
            },
          },
        ],
      }),
    );
    equal(
      result.comparisons.map((entry) => entry.listingDate?.status),
      ['outside_window', 'within_window', 'unknown'],
    );
    equal(result.askingAverage, 50);
    equal(result.marketWindow.excludedCount, 1);
    equal(result.currentMarket, { low: 50, high: 90, count: 2, basis: 'asking', match: 'model' });
  },
);

Deno.test('ungültige, zukünftige und veraltete Prüfdaten bleiben unverifiziert', () => {
  const comparisons = [comparison(1, 60), comparison(2, 70), comparison(3, 80), comparison(4, 90)];
  const result = parseAnalysis(
    response(comparisons, {
      comparisonDates: [
        { url: comparisons[0].url, listingDate: { ...recent, latest: '2026-11-08T12:00:00.000Z' } },
        { url: comparisons[1].url, listingDate: { ...recent, earliest: 'invalid' } },
        {
          url: comparisons[2].url,
          listingDate: { ...recent, checkedAt: '2026-11-07T13:00:00.000Z' },
        },
        {
          url: comparisons[3].url,
          listingDate: { ...recent, checkedAt: '2026-11-06T12:00:00.000Z' },
        },
      ],
    }),
  );
  equal(result.marketWindow.verifiedCount, 0);
  equal(result.marketWindow.undatedCount, 4);
  equal(result.resale, null);
  equal(
    parseAnalysis(response(comparisons, { researchedAt: 'not-a-date' })).marketWindow.verifiedCount,
    0,
  );
});

Deno.test('Neupreise enthalten nur passende Modelle und keine ähnlichen Nachfolger', () => {
  const result = parseAnalysis(
    response([
      comparison(1, 150, { kind: 'manufacturer' }),
      comparison(2, 120, { kind: 'retail' }),
      comparison(3, 200, { kind: 'retail', match: 'category', sameVariant: false }),
    ]),
  );
  equal(result.newPriceRange, { low: 120, high: 150, count: 2 });
  equal(result.currentMarket, null);
  equal(result.comparisons[0].listingDate, undefined);
});

Deno.test('Verkäufe und Angebotspreise bleiben getrennt statt eine Mischspanne zu bilden', () => {
  const result = parseAnalysis(
    response([
      comparison(1, 50, { kind: 'sold' }),
      comparison(2, 60, { kind: 'sold' }),
      comparison(3, 70, { kind: 'sold' }),
      comparison(4, 200),
      comparison(5, 300),
      comparison(6, 400),
    ]),
  );
  equal(result.soldAverage, 60);
  equal(result.askingAverage, 300);
  equal(result.resale, { low: 50, high: 70, count: 3, basis: 'sold' });
  equal(result.currentMarket, { low: 50, high: 70, count: 3, basis: 'sold', match: 'model' });
});

Deno.test('Vinted-Artikelkennungen verhindern doppelte Länderlinks und Eigenvergleich', () => {
  const result = parseAnalysis(
    response([
      comparison(1, 70),
      comparison(1, 70, { url: 'https://www.vinted.fr/items/1-autre-slug' }),
      comparison(2, 80),
    ]),
    'https://www.vinted.de/items/2-original',
  );
  equal(result.comparisons.length, 1);
  equal(result.askingAverage, 70);
  equal(result.resale, null);
});

Deno.test('ohne tatsächlich benutzte Quelle ist ein Preis kein Vergleich', () => {
  const raw = response([comparison(1, 70)]);
  raw.output[0] = { type: 'web_search_call', action: { sources: [] } };
  equal(parseAnalysis(raw).comparisons.length, 0);
});

Deno.test(
  'serverseitig geladene Katalogbelege dürfen ohne Suchmaschinenindex verwendet werden',
  () => {
    const item = comparison(1, 70);
    const raw = response([item], { comparisonSources: [{ url: item.url }] });
    raw.output[0] = { type: 'web_search_call', action: { sources: [] } };
    equal(parseAnalysis(raw).comparisons.length, 1);
    equal(parseAnalysis(raw).askingAverage, 70);
  },
);

Deno.test('Datumsnachweise fremder Hosts bestätigen kein Vinted-Inserat', () => {
  const item = comparison(1, 70, { url: 'https://www.ebay.de/itm/1' });
  const result = parseAnalysis(response([item]));
  equal(result.askingAverage, null);
  equal(result.currentMarket?.count, 1);
  equal(result.comparisons[0].listingDate?.source, 'unverified');
});

Deno.test('direkte Katalogquellen behalten vor Länderlinks ihre prüfbare deutsche URL', () => {
  const item = comparison(1, 70);
  const foreignUrl = 'https://www.vinted.it/items/1-giacca';
  const raw = response([item], {
    comparisonSources: [{ url: item.url }],
    research: {
      used: {
        completed: true,
        data: { sources: [{ url: foreignUrl, title: 'Italienischer Vergleich' }] },
        raw: {
          output: [{ type: 'web_search_call', action: { sources: [{ url: foreignUrl }] } }],
        },
      },
    },
  });
  const result = parseAnalysis(raw);
  equal(result.comparisons[0].url, item.url);
  equal(result.comparisons[0].listingDate?.status, 'within_window');
  equal(sourceIdentity(item.url), sourceIdentity(foreignUrl));
});

Deno.test('nur feste Vinted-Marktplatzhosts teilen Artikelkennungen über Länder hinweg', () => {
  for (const url of [
    'https://www.vinted.de/items/123-fleece',
    'https://vinted.it/items/123-giacca?utm_source=test',
    'https://www.vinted.co.uk/items/123-jacket',
  ]) {
    equal(vintedSourceItemId(url), '123');
    equal(sourceIdentity(url), 'vinted:123');
  }
  for (const url of [
    'https://www.vinted.evil.test/items/123-fleece',
    'https://www.vinted.com.evil.test/items/123-fleece',
    'https://fake.vinted.de/items/123-fleece',
    'https://www.vinted.de/items/123/extra',
    'https://name@www.vinted.de/items/123',
    'https://www.vinted.de:444/items/123',
    'http://www.vinted.de/items/123',
  ]) {
    equal(vintedSourceItemId(url), null);
    equal(sourceIdentity(url) === 'vinted:123', false);
  }
  const item = comparison(123, 70);
  const raw = response([item]);
  raw.output[0] = {
    type: 'web_search_call',
    action: { sources: [{ url: 'https://www.vinted.evil.test/items/123-fleece' }] },
  };
  equal(parseAnalysis(raw).comparisons.length, 0);
});
