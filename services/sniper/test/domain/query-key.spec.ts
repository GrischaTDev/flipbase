import { describe, expect, it } from 'vitest';
import { buildQueryKey } from '../../src/domain/query.js';

describe('buildQueryKey', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(buildQueryKey({ searchText: '  Nike Air Max  ' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('collapses repeated whitespace', () => {
    expect(buildQueryKey({ searchText: 'nike   air\tmax' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('separates queries that differ in price ceiling', () => {
    expect(buildQueryKey({ searchText: 'nike', priceTo: 50 })).not.toBe(
      buildQueryKey({ searchText: 'nike', priceTo: 60 }),
    );
  });

  it('treats an absent option as different from a set one', () => {
    expect(buildQueryKey({ searchText: 'nike' })).not.toBe(
      buildQueryKey({ searchText: 'nike', catalogId: 2050 }),
    );
  });

  it('produces a stable, readable key', () => {
    expect(buildQueryKey({ searchText: 'Nike Air Max', priceTo: 50, catalogId: 2050 })).toBe(
      'vinted|search=nike air max|catalog=2050|brand=-|price_from=-|price_to=50',
    );
  });

  it('nimmt die Preisuntergrenze in den Schluessel auf', () => {
    const withFloor = buildQueryKey({ searchText: 'nike air max', priceFrom: 10, priceTo: 50 });
    const withoutFloor = buildQueryKey({ searchText: 'nike air max', priceTo: 50 });

    // Der Schluessel ist die Identitaet einer Abfrage. Fehlte die Untergrenze,
    // teilten sich zwei verschiedene Filter eine Abfrage - und einer bekaeme
    // Ergebnisse, die er nie angefordert hat.
    expect(withFloor).toBe(
      'vinted|search=nike air max|catalog=-|brand=-|price_from=10|price_to=50',
    );
    expect(withoutFloor).toBe(
      'vinted|search=nike air max|catalog=-|brand=-|price_from=-|price_to=50',
    );
  });
});
