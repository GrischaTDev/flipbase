import { describe, expect, it } from 'vitest';
import { parseVintedListingStatistics } from './vinted-listing-statistics';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const item = {
  entryId: 'item-a',
  observedAt: '2026-10-02T12:30:00Z',
  baselineAt: '2026-10-02T12:25:00Z',
  views: 2,
  favorites: 1,
};
const response = { ...scope, periodMinutes: 5, items: [item] };
describe('Inseratstatistik-Vertrag', () => {
  it('unterscheidet unbekannte Werte von bekannten Nullen', () => {
    expect(
      parseVintedListingStatistics(
        { ...response, items: [{ ...item, views: null, favorites: 0 }] },
        scope,
        5,
      ).items[0],
    ).toMatchObject({ views: null, favorites: 0 });
  });
  it.each([
    { workspaceId: 'foreign' },
    { connectionId: 'foreign' },
    { periodMinutes: 60 },
    { items: [item, item] },
    { items: [{ ...item, views: -1 }] },
    { items: [{ ...item, favorites: 1.5 }] },
    { items: [{ ...item, views: Number.MAX_SAFE_INTEGER + 1 }] },
    { items: [{ ...item, baselineAt: item.observedAt }] },
    { items: [{ ...item, baselineAt: null }] },
  ])('verwirft eine fremde oder unplausible Antwort %j', (change) => {
    expect(() => parseVintedListingStatistics({ ...response, ...change }, scope, 5)).toThrow();
  });
});
