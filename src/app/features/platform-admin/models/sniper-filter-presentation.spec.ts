import { describe, expect, it } from 'vitest';
import type { SniperQuery } from './sniper-query.model';
import {
  filterNeedsAttention,
  filterCategoryLabel,
  filterBrandLabel,
  filterPriceLabel,
  filterIntervalLabel,
} from './sniper-filter-presentation';

const query = (values: Partial<SniperQuery>) =>
  ({ is_active: true, last_status: 'ok', coverage_status: 'caught_up', ...values }) as SniperQuery;

describe('Vinted filter presentation', () => {
  it('flags incomplete coverage and current errors without treating a paused historical failure as active', () => {
    expect(filterNeedsAttention(query({ coverage_status: 'limited' }))).toBe(true);
    expect(filterNeedsAttention(query({ last_status: 'failed' }))).toBe(true);
    expect(filterNeedsAttention(query({ run_state: 'invalid' }))).toBe(true);
    expect(filterNeedsAttention(query({ last_status: 'forbidden', is_active: false }))).toBe(false);
    expect(filterNeedsAttention(query({ coverage_status: 'initial' }))).toBe(false);
    expect(filterNeedsAttention(query({}))).toBe(false);
  });

  it('keeps the full category path and names unavailable saved categories honestly', () => {
    const paths = new Map([[79, 'Herren > Kleidung > Jacken']]);
    expect(filterCategoryLabel(query({ catalog_id: 79 }), paths)).toBe(
      'Herren › Kleidung › Jacken',
    );
    expect(filterCategoryLabel(query({ catalog_id: 80 }), paths)).toBe('Kategorie nicht verfügbar');
    expect(filterCategoryLabel(query({ catalog_id: null }), paths)).toBe('Alle Kategorien');
  });

  it('does not turn a legacy stored brand without a name into all brands', () => {
    expect(
      filterBrandLabel(query({ brand_ids: [53, 123], brand_names: ['Nike', 'Patagonia'] })),
    ).toBe('Nike · Patagonia');
    expect(filterBrandLabel(query({ brand_id: 53, brand_names: [] }))).toBe('Gespeicherte Marke');
    expect(filterBrandLabel(query({ brand_ids: [53, 123], brand_names: [] }))).toBe(
      '2 gespeicherte Marken',
    );
    expect(filterBrandLabel(query({ brand_id: null, brand_ids: [] }))).toBe('Alle Marken');
  });

  it('keeps zero and open price bounds distinct', () => {
    expect(filterPriceLabel(query({ price_from: null, price_to: 55 }))).toBe('bis 55 €');
    expect(filterPriceLabel(query({ price_from: 0, price_to: 55.5 }))).toBe('0–55,5 €');
    expect(filterPriceLabel(query({ price_from: 20, price_to: null }))).toBe('ab 20 €');
    expect(filterPriceLabel(query({ price_from: null, price_to: null }))).toBe('Ohne Preisgrenze');
  });

  it('labels desired intervals without rounding away seconds', () => {
    expect(filterIntervalLabel(5000)).toBe('5 Sek.');
    expect(filterIntervalLabel(60000)).toBe('1 Min.');
    expect(filterIntervalLabel(90000)).toBe('90 Sek.');
    expect(filterIntervalLabel(3600000)).toBe('1 Std.');
  });
});
