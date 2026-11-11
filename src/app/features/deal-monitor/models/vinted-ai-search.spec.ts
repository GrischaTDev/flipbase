import { describe, expect, it } from 'vitest';
import { VintedAiResult, resaleEstimate } from './vinted-ai-search';

const result = (basis: 'sold' | 'asking' = 'sold', low = 65, high = 85): VintedAiResult => ({
  analysis: {
    modelName: 'Modell',
    confidence: 'exact',
    evidence: '',
    comparisons: [],
    soldAverage: 70,
    askingAverage: null,
    resale: { low, high, basis, count: 3 },
  },
  listing: {
    title: 'Artikel',
    itemPrice: 20,
    totalPrice: 22,
    currency: 'EUR',
    photoCount: 1,
    hasDescription: true,
  },
  model: 'gpt-6-luna',
  cacheHit: false,
  searchedAt: '',
  stats: [],
  usage: {
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 500,
    webSearchCalls: 2,
    estimatedCostUsd: 0.02,
  },
});
describe('resaleEstimate', () => {
  it('zieht Käuferschutz, Einkaufsversand, Verkaufsgebühr und weitere Kosten ab', () => {
    expect(resaleEstimate(result(), 5, 10, 4)).toEqual({
      low: 27.5,
      high: 45.5,
      purchaseCost: 31,
      tone: 'green',
      position: 16,
    });
  });
  it('gibt für reine Angebotspreise auch bei hoher Spanne kein Grün aus', () => {
    expect(resaleEstimate(result('asking'), 0, 0, 0)?.tone).toBe('yellow');
  });
  it('behandelt eine wahrscheinliche Modellzuordnung auch mit Verkaufspreisen vorsichtig', () => {
    const tentative = result();
    tentative.analysis.confidence = 'likely';
    expect(resaleEstimate(tentative)?.tone).toBe('yellow');
  });
  it('wertet Kategorievergleiche auch bei bekanntem Zielmodell nicht als sichere Gewinnbasis', () => {
    const category = result();
    category.analysis.comparisonBasis = 'category';
    expect(resaleEstimate(category)?.tone).toBe('yellow');
  });
  it('zeigt Verluste rot und geringe oder unsichere Spannen gelb', () => {
    expect(resaleEstimate(result('sold', 10, 15), 0, 0, 0)?.tone).toBe('red');
    expect(resaleEstimate(result('sold', 20, 40), 0, 0, 0)?.tone).toBe('yellow');
  });
  it('unterdrückt die Bewertung bei fehlender Vergleichsbasis und ungültigen Kosten', () => {
    const missing = result();
    missing.analysis.resale = null;
    for (const value of [null, -1, NaN, Infinity])
      expect(resaleEstimate(result(), value, 0, 0)).toBeNull();
    expect(resaleEstimate(result(), 0, 101, 0)).toBeNull();
    expect(resaleEstimate(missing, 0, 0, 0)).toBeNull();
    expect(resaleEstimate(null, 0, 0, 0)).toBeNull();
  });
  it('rechnet bei widersprüchlichem Gesamtpreis mindestens mit dem Artikelpreis', () => {
    const inconsistent = result();
    inconsistent.listing.totalPrice = 1;
    expect(resaleEstimate(inconsistent, 0, 0, 0)?.purchaseCost).toBe(20);
  });
  it('berechnet bei aktualisiertem Artikelpreis ohne belegten Gesamtpreis keinen Preisabstand', () => {
    const changedPrice = result();
    changedPrice.listing.itemPrice = 35;
    changedPrice.listing.totalPrice = null;
    expect(resaleEstimate(changedPrice)).toBeNull();
  });
  it('leitet bei einer breiten Angebotsbasis keinen Gewinn aus ergänzenden Einzelverkäufen ab', () => {
    const tracked = result('sold', 120, 150);
    tracked.analysis.marketDataset = {
      windowDays: 30,
      initialImportDays: 7,
      asOf: '2026-11-07T12:00:00Z',
      observedSince: '2026-11-01T12:00:00Z',
      initialImportStatus: 'complete',
      match: 'model',
      active: {
        count: 1200,
        median: 40,
        lowerQuartile: 30,
        upperQuartile: 50,
        minimum: 15,
        maximum: 100,
      },
      soldMarked: {
        count: 200,
        median: 35,
        lowerQuartile: 25,
        upperQuartile: 45,
        minimum: 10,
        maximum: 80,
      },
    };
    expect(resaleEstimate(tracked)).toBeNull();
    tracked.analysis.marketDataset.active = null;
    tracked.analysis.marketDataset.soldMarked = null;
    expect(resaleEstimate(tracked)).toBeNull();
  });
});
