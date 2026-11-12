import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import type { VintedMarketDataset } from '../src/app/features/deal-monitor/models/vinted-ai-search';

// Diese Datei mockt die gesamte Supabase-API und braucht keine echte Sitzung.
test.use({ storageState: { cookies: [], origins: [] } });

const workspace = '92000000-0000-4000-8000-000000000003';
const secondWorkspace = '92000000-0000-4000-8000-000000000004';
const makeItem = (i: number) => ({
  id: `92000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: `Nike Sneaker ${i}`,
  url: `https://www.vinted.de/items/${i}`,
  image_urls:
    i === 4
      ? []
      : i === 5
        ? ['https://images1.vinted.net/feed-fixture/broken.svg']
        : i === 6
          ? ['https://example.test/unsafe.svg']
          : Array.from(
              { length: i === 2 ? 1 : i === 3 ? 2 : 4 },
              (_, index) => `https://images1.vinted.net/feed-fixture/${i}-${index + 1}.svg`,
            ),
  item_price: 18 + i,
  total_price: 20 + i,
  currency: 'EUR',
  brand: 'Nike',
  size: '42',
  condition: 'Gut',
  is_hidden: false,
  first_seen_at: new Date(Date.now() - i * 1000).toISOString(),
  catalog_id: 1049,
  category_path: 'Herren > Schuhe > Sneaker',
  reference_price: i === 1 ? 60 : null,
  reference_scope: i === 1 ? 'category_brand_condition' : null,
  discount_percent: i === 1 ? 68.33 : null,
  watchlist_title: i === 1 ? 'Meine Sneaker' : null,
});

type FavoriteFixtureStore = Map<string, Record<string, unknown> | null>;

const aiSearchResult = {
  analysis: {
    modelName: 'Nike Air Test 42',
    confidence: 'exact',
    evidence: 'Modellnummer auf Etikett und Herstellerseite stimmen überein.',
    research: {
      identification: {
        summary: '',
        limitations: [],
        completed: true,
        sources: [
          { title: 'Modellmerkmale beim Hersteller', url: 'https://www.nike.com/de/t/test' },
        ],
      },
      retail: {
        summary: 'Das Modell kostet beim Hersteller aktuell 120 Euro.',
        limitations: [],
        completed: true,
        sources: [{ title: 'Aktueller Shoppreis', url: 'https://www.nike.com/de/t/test' }],
      },
      used: {
        summary: 'Vergleichbare Verkäufe liegen zwischen 65 und 85 Euro.',
        limitations: [],
        completed: true,
        sources: [{ title: 'Gebrauchter Vergleich', url: 'https://www.ebay.de/itm/5400' }],
      },
    },
    newPriceRange: { low: 120, high: 120, count: 1 },
    comparisons: [
      {
        title: 'Hersteller Nike Air Test',
        url: 'https://www.nike.com/de/t/test',
        kind: 'manufacturer',
        price: 120,
        evidence: 'Aktueller Neupreis des identifizierten Modells.',
      },
      ...[65, 70, 85].map((price, index) => ({
        title: `Vergleichsverkauf ${index + 1}`,
        url: `https://www.ebay.de/itm/540${index}`,
        kind: 'sold',
        price,
        evidence: 'Gleiche Variante, vergleichbarer Zustand, belegter Verkaufspreis.',
      })),
    ],
    soldAverage: 73.33,
    askingAverage: null,
    comparisonBasis: 'model',
    marketWindow: {
      days: 30,
      checkedAt: '2026-11-06T12:00:00Z',
      verifiedCount: 3,
      undatedCount: 0,
      excludedCount: 0,
    },
    resale: { low: 65, high: 85, basis: 'sold', count: 3 },
  },
  model: 'gpt-6-luna',
  cacheHit: false,
  searchedAt: '2026-11-06T12:00:00Z',
  listing: {
    title: 'Nike Sneaker 1',
    itemPrice: 19,
    totalPrice: 21,
    currency: 'EUR',
    photoCount: 4,
    hasDescription: true,
  },
  usage: {
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 500,
    webSearchCalls: 2,
    estimatedCostUsd: 0.02035,
  },
  stats: [
    {
      model: 'gpt-6-luna',
      requests: 2,
      unknown_cost_requests: 0,
      total_tokens: 3000,
      web_search_calls: 4,
      estimated_cost_usd: 0.0407,
      average_cost_usd: 0.02035,
    },
  ],
};

const marketDataset: VintedMarketDataset = {
  windowDays: 30,
  initialImportDays: 7,
  asOf: '2026-11-07T12:00:00Z',
  observedSince: '2026-11-01T12:00:00Z',
  initialImportStatus: 'complete',
  match: 'model',
  active: {
    count: 1248,
    median: 55,
    lowerQuartile: 40,
    upperQuartile: 70,
    minimum: 12,
    maximum: 240,
  },
  soldMarked: {
    count: 214,
    median: 45,
    lowerQuartile: 35,
    upperQuartile: 60,
    minimum: 10,
    maximum: 160,
  },
};

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 834, 1440]) {
    test.describe(`AI Search ${theme} ${width}px`, () => {
      test.use({ hasTouch: width < 1000, isMobile: width < 1000 });
      test('analysiert nur auf Admin-Klick, zeigt Recherchequellen ohne Kostenformular und Modellvergleich', async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await fixture(page, new Map(), undefined, true);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const requests: Record<string, unknown>[] = [];
        await page.route('http://127.0.0.1:54351/functions/v1/vinted-ai-search', async (route) => {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          if (body['action'] === 'usage') {
            await route.fulfill({ json: { stats: [] } });
            return;
          }
          requests.push(body);
          await gate;
          await route.fulfill({
            json: {
              ...aiSearchResult,
              model: body['model'],
              analysis: {
                ...aiSearchResult.analysis,
                marketDataset,
                research: {
                  ...aiSearchResult.analysis.research,
                  used: {
                    ...aiSearchResult.analysis.research.used,
                    summary:
                      'Die Vergleichsbasis enthält aktive und als verkauft markierte Artikel.',
                  },
                },
              },
            },
          });
        });
        await page.goto('/vinted-bot');
        const launch = page.getByRole('button', { name: 'AI Search', exact: true }).first();
        await expect(launch).toBeVisible();
        expect(requests).toHaveLength(0);
        await launch.click();
        const dialog = page.getByRole('dialog', { name: 'AI Search', exact: true });
        await expect(dialog.getByRole('button', { name: 'Suchen', exact: true })).toBeVisible();
        expect(requests).toHaveLength(0);
        await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
        await expect(
          dialog.getByText('Artikel und Vergleichspreise werden gesucht …'),
        ).toBeVisible();
        release();
        await expect(
          dialog.getByRole('heading', { name: 'Nike Air Test 42', exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText('Das Modell kostet beim Hersteller aktuell 120 Euro.'),
        ).toBeVisible();
        await expect(
          dialog.getByText(
            'Die Vergleichsbasis enthält aktive und als verkauft markierte Artikel.',
          ),
        ).toBeVisible();
        await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
        const active = dialog.getByRole('region', { name: 'Aktive Angebote', exact: true });
        const sold = dialog.getByRole('region', { name: 'Als verkauft markiert', exact: true });
        await expect(active.getByText('1.248', { exact: true })).toBeVisible();
        await expect(active).toContainText('55,00');
        await expect(active).toContainText('240,00');
        await expect(sold.getByText('214', { exact: true })).toBeVisible();
        await expect(
          sold.getByText('Zuletzt beobachtete Angebotspreise', { exact: true }),
        ).toBeVisible();
        await expect(sold).toContainText('45,00');
        await expect(dialog.getByText(/Beobachtung seit 01.11.2026/)).toBeVisible();
        await expect(dialog.getByText(/Erstimport · 7 Tage · abgeschlossen/)).toBeVisible();
        await expect(dialog.getByText(/Preisabstand zum Einkauf:/)).toHaveCount(0);
        await expect(dialog.getByText(/30-Tage-Auswahl nach Einstelldatum:/)).toHaveCount(0);
        await expect(dialog.getByText(/Ø belegte Verkaufspreise/)).toHaveCount(0);
        const modelSource = dialog.getByRole('link', { name: /Modellmerkmale beim Hersteller/ });
        await expect(modelSource).toHaveAttribute('href', 'https://www.nike.com/de/t/test');
        await expect(modelSource).toHaveAttribute('target', '_blank');
        await expect(
          dialog.getByRole('link', { name: /Hersteller Nike Air Test/ }),
        ).toHaveAttribute('href', 'https://www.nike.com/de/t/test');
        expect(requests).toHaveLength(1);
        await dialog.getByRole('combobox', { name: 'Modell', exact: true }).click();
        await expect(
          page.getByRole('option', { name: 'GPT-6.1 Terra', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('option', { name: 'GPT-6 Astra', exact: true })).toBeVisible();
        await page.getByRole('option', { name: 'GPT-6.1 Sol', exact: true }).click();
        expect(requests).toHaveLength(1);
        await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
        await expect(
          dialog.getByRole('heading', { name: 'Modellvergleich', exact: true }),
        ).toBeVisible();
        const modelComparison = dialog.getByRole('region', {
          name: 'Modellvergleich',
          exact: true,
        });
        await expect(modelComparison.getByText(/1.248 aktive Angebote/)).toHaveCount(2);
        await expect(modelComparison.getByText(/214 als verkauft markiert/)).toHaveCount(2);
        expect(requests.map((body) => body['model'])).toEqual(['gpt-6-luna', 'gpt-6.1-sol']);
        await page.evaluate(axe.source);
        const accessibility = await page.evaluate(async () => {
          const browser = window as typeof window & { axe: typeof axe };
          return browser.axe.run(document.querySelector('app-vinted-ai-search-modal')!, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          });
        });
        expect(accessibility.violations).toEqual([]);
        if ((width === 1440 && theme === 'light') || (width === 390 && theme === 'dark')) {
          await dialog
            .getByRole('heading', { name: 'Nike Air Test 42', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('ai-search-top.png') });
          await dialog
            .getByRole('region', { name: 'Beobachteter Gebrauchtmarkt', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('ai-search-market.png') });
          await dialog
            .getByRole('heading', { name: 'Wiederverkauf', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('ai-search-resale.png') });
        }
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(launch).toBeFocused();
      });
    });
  }
}

test('zeigt den laufenden Erstimport ohne erfundene Vergleichspreise in AI Search', async ({
  page,
}) => {
  await fixture(page, new Map(), undefined, true);
  await page.route('http://127.0.0.1:54351/functions/v1/vinted-ai-search', async (route) => {
    if (route.request().postDataJSON().action === 'usage') {
      await route.fulfill({ json: { stats: [] } });
      return;
    }
    await route.fulfill({
      json: {
        ...aiSearchResult,
        analysis: {
          ...aiSearchResult.analysis,
          marketDataset: {
            ...marketDataset,
            initialImportStatus: 'running',
            observedSince: null,
            active: null,
            soldMarked: null,
          },
          comparisons: aiSearchResult.analysis.comparisons.filter(
            (item) => item.kind === 'manufacturer',
          ),
          research: {
            ...aiSearchResult.analysis.research,
            used: { summary: '', limitations: [], completed: true, sources: [] },
          },
        },
      },
    });
  });
  await page.goto('/vinted-bot');
  await page.getByRole('button', { name: 'AI Search', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'AI Search', exact: true });
  await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
  const market = dialog.getByRole('region', { name: 'Beobachteter Gebrauchtmarkt', exact: true });
  await expect(market.getByText('0 passende Artikel', { exact: true })).toHaveCount(2);
  await expect(market.getByText(/Erstimport · 7 Tage · läuft/)).toBeVisible();
  await expect(market.getByText(/Beobachtung seit/)).toHaveCount(0);
  await expect(dialog.getByText(/Ø belegte Verkaufspreise|Preisabstand zum Einkauf:/)).toHaveCount(
    0,
  );
  await expect(dialog.getByText(/Keine rechnerische Wiederverkaufsspanne/)).toHaveCount(0);
});

test('verbirgt AI Search für Beta-Nutzer und verwirft verspätete Ergebnisse nach Schließen', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/vinted-bot');
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'AI Search', exact: true })).toHaveCount(0);
  await fixture(page, new Map(), undefined, true);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requestedModel: string | null = null;
  await page.route('http://127.0.0.1:54351/functions/v1/vinted-ai-search', async (route) => {
    if (route.request().postDataJSON().action === 'usage') {
      await route.fulfill({ json: { stats: [] } });
      return;
    }
    requestedModel = route.request().postDataJSON().model;
    await gate;
    await route.fulfill({ json: aiSearchResult });
  });
  await page.reload();
  await page.getByRole('button', { name: 'AI Search', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Modell', exact: true }).click();
  await page.getByRole('option', { name: 'GPT-6 Astra', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'AI Search', exact: true })
    .getByRole('button', { name: 'Suchen', exact: true })
    .click();
  await expect.poll(() => requestedModel).toBe('gpt-6-astra');
  await expect(page.getByText('Artikel und Vergleichspreise werden gesucht …')).toBeVisible();
  await page.keyboard.press('Escape');
  release();
  await expect(page.getByRole('dialog', { name: 'AI Search', exact: true })).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Nike Air Test 42', exact: true }),
  ).not.toBeVisible();
});

test('zeigt Modellquellen und Recherchegrenzen auch ohne Preisbelege und bei fehlenden Inseratdetails', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await fixture(page, new Map(), undefined, true);
  await page.route('http://127.0.0.1:54351/functions/v1/vinted-ai-search', async (route) => {
    if (route.request().postDataJSON().action === 'usage') {
      await route.fulfill({ json: { stats: [] } });
      return;
    }
    await route.fulfill({
      json: {
        ...aiSearchResult,
        listing: { ...aiSearchResult.listing, detailsStatus: 'unavailable' },
        usage: {
          ...aiSearchResult.usage,
          estimatedCostUsd: null,
          incomplete: true,
          knownCostUsd: 0.02,
        },
        analysis: {
          ...aiSearchResult.analysis,
          confidence: 'likely',
          marketWindow: { ...aiSearchResult.analysis.marketWindow, verifiedCount: 0 },
          comparisons: [],
          resale: null,
          soldAverage: null,
          newPriceRange: null,
          research: {
            ...aiSearchResult.analysis.research,
            retail: {
              ...aiSearchResult.analysis.research.retail,
              summary: 'Das ältere Modell ist nicht mehr regulär im Handel.',
            },
            used: {
              summary: '',
              limitations: ['Diese Teilrecherche konnte nicht abgeschlossen werden.'],
              completed: false,
              sources: [],
            },
          },
        },
      },
    });
  });
  await context.route('https://www.nike.com/de/t/test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Modellquelle</p>' }),
  );
  await page.goto('/vinted-bot');
  await page.getByRole('button', { name: 'AI Search', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'AI Search', exact: true });
  await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(dialog.getByText(/Inseratdetails konnten nicht geladen werden/)).toBeVisible();
  await expect(
    dialog.getByText('Das ältere Modell ist nicht mehr regulär im Handel.'),
  ).toBeVisible();
  await expect(
    dialog.getByText('Diese Teilrecherche konnte nicht abgeschlossen werden.'),
  ).toBeVisible();
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(dialog.getByText(/Geschätzte bekannte Teilkosten:/)).toContainText('0,0200');
  await expect(dialog.getByText(/Ursprüngliche Analyse:/)).toContainText('Gesamtkosten unbekannt');
  const popup = page.waitForEvent('popup');
  await dialog.getByRole('link', { name: /Modellmerkmale beim Hersteller/ }).click();
  const source = await popup;
  await expect(source.getByText('Modellquelle', { exact: true })).toBeVisible();
  await source.close();
});

test('trennt Kategorievergleiche mit ungeklärtem Alter von bestätigten 30-Tage-Inseraten', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await fixture(page, new Map(), undefined, true);
  let searches = 0;
  await page.route('http://127.0.0.1:54351/functions/v1/vinted-ai-search', async (route) => {
    if (route.request().postDataJSON().action === 'usage') {
      await route.fulfill({ json: { stats: [] } });
      return;
    }
    searches++;
    await route.fulfill({
      json: {
        ...aiSearchResult,
        listing: { ...aiSearchResult.listing, itemPrice: 35, totalPrice: null },
        analysis: {
          ...aiSearchResult.analysis,
          modelName: '',
          confidence: 'unknown',
          evidence: 'Marke und Kategorie sind erkennbar, eine Modellnummer fehlt.',
          comparisonBasis: 'category',
          newPriceRange: null,
          soldAverage: null,
          askingAverage: searches === 1 ? null : 55,
          resale: searches === 1 ? null : { low: 40, high: 70, basis: 'asking', count: 3 },
          currentMarket: { low: 40, high: 70, basis: 'asking', count: 3, match: 'category' },
          marketWindow: {
            ...aiSearchResult.analysis.marketWindow,
            verifiedCount: searches === 1 ? 1 : 3,
            undatedCount: searches === 1 ? 2 : 0,
            excludedCount: 1,
          },
          comparisons: [
            { price: 40, status: 'within_window', label: '2 Wochen' },
            { price: 55, status: 'unknown', label: '1 Monat' },
            { price: 70, status: 'unknown', label: null },
            { price: 90, status: 'outside_window', label: '3 Monate' },
          ].map((comparison, index) => ({
            title: `Vergleichbarer Artikel ${index + 1}`,
            url: `https://www.vinted.de/items/${5100 + index}`,
            kind: 'asking',
            price: comparison.price,
            evidence: 'Gleiche Marke, Kategorie und vergleichbarer Zustand; Modell unbekannt.',
            match: 'category',
            sameVariant: false,
            listingDate: {
              status: searches > 1 && index < 3 ? 'within_window' : comparison.status,
              earliest: comparison.status === 'within_window' ? '2026-10-16T12:00:00Z' : null,
              latest: comparison.status === 'within_window' ? '2026-10-23T12:00:00Z' : null,
              label: searches > 1 && index < 3 ? '2 Wochen' : comparison.label,
              checkedAt: '2026-11-06T12:00:00Z',
              source: 'vinted_listing',
            },
          })),
          research: {
            ...aiSearchResult.analysis.research,
            used: {
              summary: 'Ähnliche Artikel werden für 40 bis 70 Euro angeboten.',
              limitations: [],
              completed: true,
              sources: [],
            },
          },
        },
      },
    });
  });
  await page.goto('/vinted-bot');
  await page.getByRole('button', { name: 'AI Search', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'AI Search', exact: true });
  await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Modell unbekannt', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Vergleichsbasis: ähnliche Artikel derselben Marke und Kategorie'),
  ).toBeVisible();
  await expect(dialog.getByText(/Innerhalb der letzten 30 Tage eingestellt/)).toHaveText(
    'Innerhalb der letzten 30 Tage eingestellt · Quelle: 2 Wochen',
  );
  await expect(dialog.getByText(/Einstelldatum ungeklärt · keine 30-Tage-Zuordnung/)).toHaveCount(
    2,
  );
  await expect(dialog.getByText(/Älter als 30 Tage · nicht in der Auswertung/)).toBeVisible();
  await expect(dialog.getByText(/Aktuelle Angebotsspanne:/)).toContainText('40,00');
  await expect(dialog.getByText(/Aktuelle Angebotsspanne:/)).toContainText('70,00');
  await expect(
    dialog.getByText('Einschließlich Inseraten ohne bestätigtes Einstelldatum'),
  ).toBeVisible();
  await expect(dialog.getByText(/Ø geforderte Gebrauchtpreise/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(dialog.getByText(/Ø geforderte Gebrauchtpreise/)).toContainText('30-Tage-Inserate');
  await expect(
    dialog.getByRole('region', { name: 'Wiederverkaufsbewertung' }).getByText('Angebotsspanne:'),
  ).toContainText('40,00');
  await expect(dialog.getByText(/3 geforderte Angebotspreise/)).toContainText(
    'Inserate innerhalb der letzten 30 Tage eingestellt',
  );
  await expect(dialog.getByText('Artikelpreis:')).toContainText('35,00');
  await expect(dialog.getByText(/Einkauf inkl. gemeldetem Käuferschutz:/)).toHaveCount(0);
  await expect(dialog.getByText(/Preisabstand zum Einkauf:/)).toHaveCount(0);
  await expect(dialog.getByText(/15–30 % Abschlag/)).toHaveCount(0);
});

async function fixture(
  page: Page,
  favoriteStore: FavoriteFixtureStore = new Map(),
  userId = '92000000-0000-4000-8000-000000000001',
  operator = false,
) {
  // Lokale Bildantworten statt fremder Produktfotos: prüft Raster und Fehlerzustände.
  await page.route('https://images1.vinted.net/feed-fixture/**', async (route) => {
    if (route.request().url().endsWith('/broken.svg')) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const index = Number(/-(\d+)\.svg$/.exec(route.request().url())?.[1] ?? 1);
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e8e5df"/><g transform="translate(${index === 2 ? -40 : 0},${index === 3 ? -160 : 0}) scale(${index === 1 ? 1 : 1.4})"><path d="M100 230 165 210 210 255 300 290 330 335 315 370 85 370 65 345Z" fill="#444b50"/><path d="M70 340H326L315 370H85Z" fill="#fafafa"/><path d="m165 244 48 20m-34-6 48 20m-34-6 48 20" stroke="#ddd" stroke-width="6"/></g><text x="20" y="40" fill="#444" font-family="sans-serif" font-size="22">Testbild ${index}</text></svg>`,
    });
  });
  const user = {
    id: userId,
    email: 'feed@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.addInitScript(
    ({ user, token }) => {
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { user, token },
  );
  let items = Array.from({ length: 8 }, (_, i) => makeItem(i + 1));
  const watchlists: Record<string, unknown>[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let failSave = false;
  let failFavorites = false;
  let covered = true;
  let watchlistGate: Promise<void> | null = null;
  let releaseWatchlists: (() => void) | undefined;
  let waitingForWatchlists = false;
  await page.routeWebSocket(/127\.0\.0\.1:54351/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      const [joinRef, ref, topic, event] = JSON.parse(message) as unknown[];
      if (['phx_join', 'phx_leave', 'heartbeat'].includes(String(event)))
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
    });
  });
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1) ?? '';
    let json: unknown = [];
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Monitor Test' };
    if (name === 'is_platform_operator') json = operator;
    if (name === 'list_my_workspace_access')
      json = [workspace, secondWorkspace].map((workspaceId) => ({
        workspace_id: workspaceId,
        access_status: 'active',
        ends_at: null,
        server_time: new Date().toISOString(),
      }));
    if (name === 'workspaces')
      json = [
        {
          id: workspace,
          name: 'Testbereich',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          created_at: new Date().toISOString(),
        },
        {
          id: secondWorkspace,
          name: 'Zweitbereich',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          created_at: new Date().toISOString(),
        },
      ];
    if (name === 'vinted_categories')
      json =
        Number(url.searchParams.get('offset') ?? 0) === 0
          ? [{ id: 1049, path: 'Herren > Schuhe > Sneaker' }]
          : [];
    if (name === 'sniper_watchlists') {
      const firstWorkspace = url.searchParams.get('workspace_id') === `eq.${workspace}`;
      if (firstWorkspace && watchlistGate) {
        waitingForWatchlists = true;
        await watchlistGate;
      }
      json = firstWorkspace && Number(url.searchParams.get('offset') ?? 0) === 0 ? watchlists : [];
    }
    if (name === 'sniper_supported_brands') json = [{ brand: 'Nike' }];
    if (name === 'sniper_feed_search') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      json = {
        items: (body['p_workspace_id'] === secondWorkspace ? [makeItem(700)] : items).filter(
          (item) =>
            String(body['p_title_query'] ?? '')
              .toLowerCase()
              .split(/\s+/u)
              .every((word) => item.title.toLowerCase().includes(word)),
        ),
        covered,
        reported_at: new Date().toISOString(),
      };
    }
    if (
      [
        'sniper_favorites_page',
        'save_sniper_favorite',
        'remove_sniper_favorite',
        'clear_sniper_favorites',
        'import_sniper_favorites',
      ].includes(name)
    ) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      const scope = `${user.id}:${body['p_workspace_id']}:`;
      const key = (item: Record<string, unknown>) =>
        scope + /\/items\/(\d+)/u.exec(String(item['url']))?.[1];
      if (
        body['p_expected_user_id'] !== user.id ||
        (failFavorites && name !== 'sniper_favorites_page')
      ) {
        await route.fulfill({ status: 400, json: { message: 'Speichern fehlgeschlagen' } });
        return;
      }
      if (name === 'sniper_favorites_page')
        json = {
          items: [...favoriteStore.entries()]
            .filter(([id, item]) => id.startsWith(scope) && item !== null)
            .map(([, item]) => item),
          next_cursor: null,
        };
      if (name === 'save_sniper_favorite') {
        const item = body['p_item'] as Record<string, unknown>;
        if (!favoriteStore.get(key(item))) favoriteStore.set(key(item), item);
        json = true;
      }
      if (name === 'remove_sniper_favorite') {
        favoriteStore.set(scope + body['p_external_id'], null);
        json = true;
      }
      if (name === 'clear_sniper_favorites') {
        for (const id of favoriteStore.keys())
          if (id.startsWith(scope)) favoriteStore.set(id, null);
        json = true;
      }
      if (name === 'import_sniper_favorites') {
        const rows = body['p_items'] as Record<string, unknown>[];
        for (const item of rows)
          if (!favoriteStore.has(key(item))) favoriteStore.set(key(item), item);
        json = rows.length;
      }
    }
    if (name === 'save_sniper_watchlist') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      if (failSave) {
        await route.fulfill({ status: 400, json: { message: 'Speichern fehlgeschlagen' } });
        return;
      }
      const row = {
        id: body['p_id'] ?? '92000000-0000-4000-8000-000000000090',
        workspace_id: body['p_workspace_id'],
        title: body['p_title'],
        catalog_id: body['p_catalog_id'],
        brand: body['p_brand'],
        search_text: body['p_search_text'],
        price_from: body['p_price_from'],
        price_to: body['p_price_to'],
        condition: body['p_condition'],
        discount_threshold_percent: body['p_discount_threshold_percent'],
        is_active: body['p_is_active'],
        legacy_brand_id: null,
      };
      if (watchlists.length) watchlists[0] = row;
      else watchlists.push(row);
      json = row.id;
    }
    if (name === 'delete_sniper_watchlist') {
      watchlists.splice(0);
      json = null;
    }
    await route.fulfill({ json });
  });
  return {
    calls,
    clearFeed: () => {
      items = [];
    },
    failFavorites: (value: boolean) => {
      failFavorites = value;
    },
    add: (...ids: number[]) => {
      items = [...(ids.length ? ids : [99]).map(makeItem), ...items];
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
    uncovered: () => {
      covered = false;
    },
    holdWatchlists: () => {
      watchlistGate = new Promise<void>((resolve) => {
        releaseWatchlists = resolve;
      });
    },
    waitingForWatchlists: () => waitingForWatchlists,
    releaseWatchlists: () => {
      watchlistGate = null;
      releaseWatchlists?.();
    },
  };
}

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations,
  );
  expect(violations).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`Vinted Bot Feed und Suchfilter verwalten ${theme} @pr-smoke`, async ({ page }) => {
    await page.setViewportSize(
      theme === 'light' ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
    );
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const mock = await fixture(page);
    // Ueber die fruehere Adresse, damit auch die Weiterleitung abgedeckt ist.
    await page.goto('/deal-monitor');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page).toHaveURL(/\/vinted-bot$/);
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(8);
    const finds = page.getByRole('region', { name: 'Artikel im Vinted Feed', exact: true });
    await expect(finds.getByRole('article')).toHaveCount(8);
    await expect(page.getByText('Weitere Funde', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Prüft alle 2 Sekunden auf neue Funde', { exact: false }),
    ).toHaveCount(0);
    await expect(page.getByText('Botmeldung', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zulauf pausieren', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Neuer Suchfilter', exact: true })).toHaveCount(
      0,
    );
    const firstCard = page.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
    await expect(firstCard.getByRole('img')).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 2', exact: true }).getByRole('img'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 3', exact: true }).getByRole('img'),
    ).toHaveCount(1);
    for (const id of [4, 5, 6]) {
      const card = page.getByRole('article', { name: `Nike Sneaker ${id}`, exact: true });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('Kein Artikelbild', { exact: true })).toBeVisible();
      await expect(card.getByRole('img')).toHaveCount(0);
    }
    await firstCard.scrollIntoViewIfNeeded();
    const photos = firstCard.getByRole('img');
    await expect
      .poll(() =>
        photos.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
      )
      .toBe(true);
    const boxes = await photos.evaluateAll((images) =>
      images.map((image) => {
        const { x, y, width, height } = image.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(boxes[0].height / boxes[0].width).toBeCloseTo(4 / 3, 2);
    if (theme === 'light') {
      const allCards = await finds.getByRole('article').evaluateAll((articles) =>
        articles.map((article) => {
          const { x, y, width, height } = article.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      // Die Filter belegen links eine eigene Spalte; das Raster nutzt die übrige Breite.
      const filterColumn = await page.locator('[data-feed-filters]').boundingBox();
      expect(filterColumn!.x + filterColumn!.width).toBeLessThanOrEqual(allCards[0].x);
      const firstRow = allCards.filter((card) => Math.abs(card.y - allCards[0].y) < 1);
      expect(firstRow.length).toBeGreaterThanOrEqual(3);
      for (const [index, card] of firstRow.entries()) {
        if (index > 0) expect(firstRow[index - 1].x).toBeLessThan(card.x);
        expect(card.width).toBeCloseTo(allCards[0].width, 0);
      }
      expect(allCards[0].width).toBeGreaterThanOrEqual(220);
      expect(allCards[firstRow.length].y).toBeGreaterThan(allCards[0].y);
      expect(allCards[firstRow.length].width).toBeCloseTo(allCards[0].width, 0);
    }
    const viewItem = firstCard.getByRole('link', {
      name: 'Nike Sneaker 1 – auf Vinted ansehen (neuer Tab)',
      exact: true,
    });
    await expect(viewItem).toHaveAttribute('href', 'https://www.vinted.de/items/1');
    await expect(viewItem).toHaveAttribute('target', '_blank');
    await expect(viewItem).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(firstCard.locator('dt').filter({ hasText: 'Marke:' })).toHaveCount(1);
    await page.context().route('https://www.vinted.de/items/1', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Vinted Testziel</title><p>Artikel 1</p>',
      }),
    );
    const opened = page.waitForEvent('popup');
    await viewItem.click();
    const itemTab = await opened;
    await expect(itemTab).toHaveURL('https://www.vinted.de/items/1');
    await itemTab.close();
    await page.bringToFront();
    await expect(page).toHaveURL(/\/vinted-bot$/);
    await expect(firstCard).toBeVisible();
    await checkAxe(page);
    await firstCard.evaluate((card) => card.scrollIntoView({ block: 'center' }));
    await firstCard.screenshot({ path: `test-results/deal-card-${theme}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/deal-monitor-${theme}.png`, fullPage: true });

    await page.goto('/vinted-bot/filters');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Suchfilter', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neuer Suchfilter', exact: true }).click();
    await expect(page.getByLabel('Name des Suchfilters')).toBeFocused();
    await page.getByLabel('Name des Suchfilters').fill('Meine Sneaker');
    await page.getByLabel('Marke', { exact: true }).fill('Nike');
    await checkAxe(page);
    mock.failSave(true);
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Suchfilter konnte nicht gespeichert' }),
    ).toBeVisible();
    await expect(page.getByLabel('Name des Suchfilters')).toHaveValue('Meine Sneaker');
    mock.failSave(false);
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(
      page.getByRole('form', { name: 'Suchfilter bearbeiten', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Meine Sneaker', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausieren', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aktivieren', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Suchfilter bearbeiten', exact: true }).click();
    await page.getByLabel('Name des Suchfilters').fill('Ungespeichert');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Änderungen verwerfen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
    await page.getByRole('button', { name: 'Suchfilter löschen', exact: true }).click();
    await checkAxe(page);
    await page
      .getByRole('dialog', { name: 'Suchfilter löschen?', exact: true })
      .getByRole('button', { name: 'Suchfilter löschen', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Noch keine Suchfilter angelegt', exact: true }),
    ).toBeVisible();
    expect(
      mock.calls
        .filter((call) => call.name === 'save_sniper_watchlist')
        .every((call) => call.body['p_workspace_id'] === workspace),
    ).toBe(true);
    mock.uncovered();
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      page.getByText('Für diesen Bereich sammelt der Monitor noch nicht.', { exact: false }),
    ).toBeVisible();
    // Der bestehende Workspace-Schutz sperrt den Wechsel auf der
    // Erfassungsseite; nach dem Speichern geht es zurück zum Feed.
    await page.goto('/vinted-bot/filters');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Neuer Suchfilter', exact: true }).click();
    await page.getByLabel('Name des Suchfilters').fill('Verzögert gespeichert');
    mock.holdWatchlists();
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect.poll(mock.waitingForWatchlists).toBe(true);
    const workspaceSwitch = page.locator('[aria-controls="header-workspace-menu"]');
    await expect(workspaceSwitch).toBeDisabled();
    mock.releaseWatchlists();
    await expect(
      page.getByRole('form', { name: 'Suchfilter bearbeiten', exact: true }),
    ).toHaveCount(0);
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(workspaceSwitch).toBeEnabled();
    await workspaceSwitch.click();
    await page.getByRole('button', { name: 'Zweitbereich', exact: true }).click();
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    expect(
      mock.calls.filter((call) => call.name === 'sniper_feed_search').at(-1)?.body[
        'p_workspace_id'
      ],
    ).toBe(secondWorkspace);
    expect(runtimeErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ]) {
    test.describe(`Kartenansicht ${theme} ${viewport.width}px`, () => {
      test.use({ hasTouch: viewport.width <= 390, isMobile: viewport.width <= 390 });
      test(`Feed-Karten und Filterleiste ${theme} ${viewport.width}px @pr-smoke`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        const runtimeErrors: string[] = [];
        const consoleIssues: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning')
            consoleIssues.push(message.text());
        });
        const mock = await fixture(page);
        await page.goto('/vinted-bot');
        await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
        await expect(page).toHaveURL(/\/vinted-bot$/);
        await expect(page).toHaveTitle(/Flipbase/);
        await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
        await expect(page.getByRole('article')).toHaveCount(8);
        const pageHeader = page.locator('app-page-header');
        const filters = page.locator('[data-feed-filters]');
        const maxPrice = page.getByRole('spinbutton', { name: 'Höchstpreis in Euro' });
        const resetFilters = page.getByRole('button', { name: 'Filter zurücksetzen', exact: true });
        const titleSearch = page.getByRole('searchbox', {
          name: 'Artikel im Titel durchsuchen',
          exact: true,
        });
        // Suchfeld und Auswahlfelder teilen sich dieselbe Toolbar-Höhe.
        expect((await titleSearch.boundingBox())!.height).toBeCloseTo(
          (await page.locator('#feed-watchlist').boundingBox())!.height,
          0,
        );
        // Per Tastatur öffnen: ein Mausklick ließe den Zeiger für die spätere
        // AXE-Prüfung im Hover-Zustand über dem Feld stehen.
        await page.locator('#feed-brand').focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('listbox')).toBeVisible();
        // Marken kommen nur aus den Bot-Filtern; eine Freitextsuche gibt es dort nicht.
        await expect(page.locator('[data-feed-filters] input[role="combobox"]')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveCount(0);
        await expect(page.getByText('Letzte 3 Tage', { exact: true })).toHaveCount(0);
        // Breit stehen die Filter links neben den Funden, schmal darüber.
        const filterPlacement = await filters.boundingBox();
        const firstCardBox = await page.getByRole('article').first().boundingBox();
        if (viewport.width >= 1440) {
          expect(filterPlacement!.x + filterPlacement!.width).toBeLessThanOrEqual(firstCardBox!.x);
        } else {
          expect(filterPlacement!.y + filterPlacement!.height).toBeLessThanOrEqual(firstCardBox!.y);
        }
        await expect(
          page.getByRole('checkbox', {
            name: 'Langsamer Modus: neue Funde einzeln einschieben',
            exact: true,
          }),
        ).not.toBeChecked();
        const filtersBeforeInput = await filters.boundingBox();
        const priceBeforeInput = await maxPrice.boundingBox();
        await expect(resetFilters).toBeHidden();
        await maxPrice.fill('123.45');
        await expect(resetFilters).toBeVisible();
        const filtersAfterInput = await filters.boundingBox();
        const priceAfterInput = await maxPrice.boundingBox();
        const resetBox = await resetFilters.boundingBox();
        expect(filtersAfterInput!.height).toBeCloseTo(filtersBeforeInput!.height, 0);
        expect(priceAfterInput!.x).toBeCloseTo(priceBeforeInput!.x, 0);
        expect(priceAfterInput!.width).toBeCloseTo(priceBeforeInput!.width, 0);
        if (filtersAfterInput!.width < 320) {
          // Schmale Filterkarte: Felder in voller Breite, Zurücksetzen unten rechts.
          expect(resetBox!.y).toBeGreaterThanOrEqual(priceAfterInput!.y + priceAfterInput!.height);
          expect(resetBox!.x + resetBox!.width).toBeCloseTo(
            priceAfterInput!.x + priceAfterInput!.width,
            0,
          );
        } else {
          expect(resetBox!.x).toBeGreaterThanOrEqual(priceAfterInput!.x + priceAfterInput!.width);
          expect(resetBox!.y + resetBox!.height).toBeCloseTo(
            priceAfterInput!.y + priceAfterInput!.height,
            0,
          );
        }
        const priceTextFits = await maxPrice.evaluate((input: HTMLInputElement) => {
          const styles = getComputedStyle(input);
          const context = document.createElement('canvas').getContext('2d')!;
          context.font = styles.font;
          const available =
            input.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
          return context.measureText(input.value).width <= available;
        });
        expect(priceTextFits).toBe(true);
        await filters.screenshot({ path: testInfo.outputPath('feed-filters-active.png') });
        if (viewport.width <= 390) {
          expect(resetBox!.width).toBeGreaterThanOrEqual(44);
          expect(resetBox!.height).toBeGreaterThanOrEqual(44);
          await resetFilters.tap();
        } else {
          await resetFilters.focus();
          await page.keyboard.press('Enter');
        }
        await expect(maxPrice).toHaveValue('');
        await expect(resetFilters).toBeHidden();
        expect((await filters.boundingBox())!.height).toBeCloseTo(filtersBeforeInput!.height, 0);
        const headerBefore = await pageHeader.innerHTML();
        // Das Zahlenfeld hinterlässt beim Blur ein leeres style-Attribut.
        // Dieser harmlose Browserzustand ist keine Änderung der Filterleiste.
        const filterMarkup = async () => (await filters.innerHTML()).replaceAll(' style=""', '');
        const filtersBefore = await filterMarkup();
        const firstCard = page.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
        const preview = firstCard.getByRole('button', {
          name: 'Nike Sneaker 1 in Großansicht öffnen',
          exact: true,
        });
        const viewItem = firstCard.getByRole('link', {
          name: 'Nike Sneaker 1 – auf Vinted ansehen (neuer Tab)',
          exact: true,
        });
        await expect(firstCard.getByRole('heading', { name: 'Nike Sneaker 1' })).toBeVisible();
        await expect(firstCard.locator('dl app-badge')).toHaveCount(4);
        await expect(firstCard.getByRole('img')).toHaveCount(1);
        await expect
          .poll(() =>
            firstCard.getByRole('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        const normalPhoto = await preview.boundingBox();
        expect(normalPhoto!.height / normalPhoto!.width).toBeCloseTo(4 / 3, 2);
        await checkAxe(page);
        await page
          .getByRole('region', { name: 'Artikel im Vinted Feed' })
          .screenshot({ path: testInfo.outputPath('feed-standard.png') });

        const favorite = firstCard.getByRole('button', { name: 'Zu Favoriten hinzufügen' });
        await favorite.click();
        const savedFavorite = firstCard.getByRole('button', { name: 'Aus Favoriten entfernen' });
        await expect(savedFavorite).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const favoriteBox = await savedFavorite.boundingBox();
        const currentPhoto = await preview.boundingBox();
        expect(favoriteBox!.y + favoriteBox!.height).toBeGreaterThan(
          currentPhoto!.y + currentPhoto!.height - 20,
        );
        expect(await pageHeader.innerHTML()).toBe(headerBefore);
        expect(await filterMarkup()).toBe(filtersBefore);
        await checkAxe(page);
        await page
          .getByRole('region', { name: 'Artikel im Vinted Feed' })
          .screenshot({ path: testInfo.outputPath('feed-favorite.png') });
        if (viewport.width <= 390) {
          const touchState = await savedFavorite.evaluate((button) => ({
            coarse: matchMedia('(pointer: coarse)').matches,
            minWidth: getComputedStyle(button).minWidth,
            spacing: getComputedStyle(button).getPropertyValue('--spacing'),
            classes: button.className,
          }));
          expect(favoriteBox!.width, JSON.stringify(touchState)).toBeGreaterThanOrEqual(44);
        }
        await page.context().route('https://www.vinted.de/items/1', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<title>Vinted Testziel</title><p>Artikel 1</p>',
          }),
        );
        const opened = page.waitForEvent('popup');
        await viewItem.click();
        const itemTab = await opened;
        await expect(itemTab).toHaveURL('https://www.vinted.de/items/1');
        await itemTab.close();
        await preview.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(
          page.getByRole('dialog').getByRole('img', { name: 'Großansicht: Nike Sneaker 1' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(preview).toBeFocused();
        await savedFavorite.click();
        await expect(favorite).toHaveAttribute('aria-pressed', 'false');
        await expect(firstCard.getByRole('heading', { name: 'Nike Sneaker 1' })).toBeVisible();
        expect(await pageHeader.innerHTML()).toBe(headerBefore);
        expect(await filterMarkup()).toBe(filtersBefore);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(runtimeErrors).toEqual([]);
        await testInfo.attach('console-issues', {
          body: consoleIssues.join('\n') || 'Keine Warnungen oder Fehler.',
          contentType: 'text/plain',
        });
        expect(
          mock.calls
            .filter((call) => call.name === 'sniper_feed_search')
            .every((call) => call.body['p_workspace_id'] === workspace),
        ).toBe(true);
      });
    });
  }
}

test.describe('Dezimaleingabe auf dem Tablet', () => {
  test.use({
    viewport: { width: 834, height: 1112 },
    hasTouch: true,
    locale: 'de-DE',
    reducedMotion: 'reduce',
  });

  test('erhält Dezimalstellen und Einfügeposition im Preisfilter @pr-smoke', async ({ page }) => {
    const mock = await fixture(page);
    await page.goto('/vinted-bot');
    const price = page.getByRole('spinbutton', { name: 'Mindestpreis in Euro', exact: true });
    await expect(price).toBeVisible();
    await price.pressSequentially('12.34', { delay: 50 });
    await expect(price).toHaveValue('12,34');
    await price.press('Home');
    await price.press('ArrowRight');
    await price.pressSequentially('78', { delay: 50 });
    await expect(price).toHaveValue('1782,34');
    await price.fill('12.30');
    await price.press('Tab');
    await expect(price).toHaveValue('12,30');
    await price.fill('');
    await price.pressSequentially('12,30', { delay: 50 });
    await expect(price).toHaveValue('12,30');
    await price.fill('');
    await price.pressSequentially('0.05', { delay: 50 });
    await expect(price).toHaveValue('0,05');
    await expect
      .poll(
        () =>
          mock.calls.filter((call) => call.name === 'sniper_feed_search').at(-1)?.body[
            'p_min_price'
          ],
      )
      .toBe(0.05);
    await page.getByRole('button', { name: 'Filter zurücksetzen', exact: true }).click();
    await expect(price).toHaveValue('');
    await expect(page.getByRole('article')).toHaveCount(8);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    await checkAxe(page);
  });
});

test('Widescreen-Modus teilt den Feed auf einem 49-Zoll-Bildschirm in mehrere Suchen @pr-smoke', async ({
  page,
}, testInfo) => {
  // 49 Zoll im 32:9-Format, zum Beispiel 5120 × 1440 Pixel.
  await page.setViewportSize({ width: 5120, height: 1440 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('flipbase_widescreen', 'true'));
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await fixture(page);
  await page.goto('/vinted-bot');
  await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.getByRole('article')).toHaveCount(8);

  const cardsIn = (search: number) =>
    page
      .locator('app-deal-feed-search')
      .nth(search)
      .getByRole('article')
      .evaluateAll((articles) =>
        articles.map((article) => {
          const { x, y, width } = article.getBoundingClientRect();
          return { x, y, width };
        }),
      );
  const columnsIn = (search: number) =>
    page
      .locator('app-deal-feed-search')
      .nth(search)
      .locator('[id^="feed-finds-grid"]')
      .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  // Eine Suche nutzt die ganze Breite: alle Funde in einer Reihe, Platz für viele weitere.
  const single = await cardsIn(0);
  expect(single.every((card) => Math.abs(card.y - single[0].y) < 1)).toBe(true);
  expect(await columnsIn(0)).toBeGreaterThanOrEqual(15);

  await page.getByRole('button', { name: 'Weitere Suche hinzufügen', exact: true }).click();
  await expect(page.locator('app-deal-feed-search')).toHaveCount(2);
  await expect(page.getByRole('article')).toHaveCount(16);
  const [first, second] = [await cardsIn(0), await cardsIn(1)];
  const secondFilters = await page.locator('[data-feed-filters]').nth(1).boundingBox();
  // Die zweite Suche beginnt mit ihren Filtern rechts neben den Funden der ersten.
  expect(first.at(-1)!.x + first.at(-1)!.width).toBeLessThanOrEqual(secondFilters!.x);
  expect(secondFilters!.x).toBeGreaterThan(2400);
  expect(second[0].x).toBeGreaterThan(secondFilters!.x + secondFilters!.width);
  expect(first[0].width).toBeGreaterThanOrEqual(220);
  expect(await columnsIn(0)).toBeGreaterThanOrEqual(7);
  expect(await columnsIn(1)).toBe(await columnsIn(0));
  await expect(page.locator('#feed-min-price-2')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('feed-widescreen-two-searches.png') });
  await checkAxe(page);

  await page.getByRole('button', { name: 'Suche 2 entfernen', exact: true }).click();
  await expect(page.locator('app-deal-feed-search')).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test('Account-Favoriten bleiben auf Tablet und Desktop nach Feed-Bereinigung erhalten @core-smoke', async ({
  page,
  browser,
}, testInfo) => {
  const store: FavoriteFixtureStore = new Map();
  const desktop = await fixture(page, store);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/vinted-bot');
  await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Artikel im Titel durchsuchen', exact: true });
  await search.fill('Sneaker 2');
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(
    desktop.calls.filter((call) => call.name === 'sniper_feed_search').at(-1)?.body[
      'p_title_query'
    ],
  ).toBe('Sneaker 2');
  desktop.failFavorites(true);
  await page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Änderung konnte nicht gespeichert' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  desktop.failFavorites(false);
  await page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Aus Favoriten entfernen', exact: true }),
  ).toBeVisible();
  desktop.clearFeed();
  const tabletContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 900 },
    storageState: { cookies: [], origins: [] },
  });
  const tablet = await tabletContext.newPage();
  try {
    const tabletBackend = await fixture(tablet, store);
    tabletBackend.clearFeed();
    await tablet.goto('/vinted-bot/favorites');
    await tablet.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      tablet.getByRole('article', { name: 'Nike Sneaker 2', exact: true }),
    ).toBeVisible();
    await checkAxe(tablet);
    await tablet.screenshot({
      path: testInfo.outputPath('account-favorites-tablet.png'),
      fullPage: true,
    });
    await page.goto('/vinted-bot/favorites');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('article')).toHaveCount(1);
    await tablet.getByRole('button', { name: 'Aus Favoriten entfernen', exact: true }).click();
    await expect(tablet.getByRole('article')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('article')).toHaveCount(0);
    // Ein alter Browserimport darf den auf dem Tablet entfernten Favoriten nicht wiederherstellen.
    await page.evaluate(
      ({ workspace, item }) =>
        localStorage.setItem('flipbase_vinted_favorites_' + workspace, JSON.stringify([item])),
      { workspace, item: makeItem(2) },
    );
    await page.reload();
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    const legacy = page.getByRole('button', {
      name: 'Lokale Favoriten in meinen Account übernehmen',
      exact: true,
    });
    await expect(legacy).toBeEnabled();
    await legacy.click();
    await expect(legacy).not.toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  } finally {
    await tabletContext.close();
  }
});
