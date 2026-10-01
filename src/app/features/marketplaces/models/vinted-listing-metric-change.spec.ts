import { describe, expect, it } from 'vitest';
import { observeVintedListingMetrics } from './vinted-listing-metric-change';
import type { MarketplaceMetrics } from './marketplace.models';

const observation = (
  views: number | null,
  favorites: number | null,
  hour: number,
): MarketplaceMetrics => ({ views, favorites, observedAt: `2026-10-01T${hour}:00:00Z` });

describe('Kontogebundene Kennzahlenbeobachtung', () => {
  it('firstObservationSetsBaseline', () => {
    expect(observeVintedListingMetrics(null, observation(5, 2, 10))).toEqual({
      metrics: observation(5, 2, 10),
      change: null,
    });
  });
  it('unknownCounterMakesNoDelta', () => {
    expect(
      observeVintedListingMetrics(observation(null, 2, 10), observation(5, null, 11))?.change,
    ).toBeNull();
  });
  it('rechnet ungültige Zähler nicht als bekannte Ausgangswerte', () => {
    expect(
      observeVintedListingMetrics(observation(-1, 2, 10), observation(5, Infinity, 11))?.change,
    ).toBeNull();
  });
  it('zeroToOneShowsIncrease', () => {
    expect(
      observeVintedListingMetrics(observation(0, 0, 10), observation(1, 1, 11))?.change,
    ).toEqual({ views: 1, favorites: 1, observedAt: '2026-10-01T11:00:00Z' });
  });
  it('olderOrRepeatedObservationMakesNoEffect', () => {
    expect(observeVintedListingMetrics(observation(1, 1, 11), observation(8, 8, 10))).toBeNull();
    expect(observeVintedListingMetrics(observation(1, 1, 11), observation(8, 8, 11))).toBeNull();
    expect(
      observeVintedListingMetrics(observation(1, 1, 11), {
        views: 8,
        favorites: 8,
        observedAt: null,
      }),
    ).toBeNull();
  });
  it('decreaseResetsBaseline', () => {
    const decreased = observeVintedListingMetrics(observation(5, 5, 10), observation(4, 4, 11));
    expect(decreased?.change).toBeNull();
    expect(observeVintedListingMetrics(decreased!.metrics, observation(5, 5, 12))?.change).toEqual({
      views: 1,
      favorites: 1,
      observedAt: '2026-10-01T12:00:00Z',
    });
  });
});
