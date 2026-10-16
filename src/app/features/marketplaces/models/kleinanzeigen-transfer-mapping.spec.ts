import { describe, expect, it } from 'vitest';
import {
  mapVintedToKleinanzeigen,
  type VintedTransferSource,
} from './kleinanzeigen-transfer-mapping';
const source: VintedTransferSource = {
  reference: {
    platform: 'vinted',
    workspaceId: 'workspace',
    connectionId: 'source',
    externalId: '123',
  },
  title: 'Ein Vinted-Inserat',
  description: 'Die vollständige Beschreibung',
  priceCents: 1299,
  currency: 'EUR',
  photoReferences: ['photo-1', 'photo-2'],
  attributeHints: { brand: 'Marke', size: 'M', condition: 'Sehr gut', category: 'Shirts' },
};
const defaults = {
  postalCode: '12345',
  shippingType: 'pickup' as const,
  priceType: 'FIXED' as const,
};
describe('mapVintedToKleinanzeigen', () => {
  it('preserves source text, price and ordered photos without mutating the source', () => {
    const before = structuredClone(source);
    const mapped = mapVintedToKleinanzeigen(source, defaults);
    expect(mapped.content.title).toBe(source.title);
    expect(mapped.content.description).toBe(source.description);
    expect(mapped.content.priceCents).toBe(1299);
    expect(mapped.originalPhotoReferences).toEqual(['photo-1', 'photo-2']);
    expect(source).toEqual(before);
  });
  it('retains an overlong title with a visible warning instead of truncating', () => {
    const mapped = mapVintedToKleinanzeigen({ ...source, title: 'T'.repeat(66) }, defaults);
    expect(mapped.content.title).toHaveLength(66);
    expect(mapped.warnings).toContainEqual(
      expect.objectContaining({ field: 'title', code: 'title_too_long' }),
    );
  });
  it('retains an overlong description for correction', () => {
    const mapped = mapVintedToKleinanzeigen({ ...source, description: 'D'.repeat(4001) }, defaults);
    expect(mapped.content.description).toHaveLength(4001);
    expect(mapped.warnings).toContainEqual(
      expect.objectContaining({ field: 'description', code: 'description_too_long' }),
    );
  });
  it('never copies a source category or condition identifier into target attributes', () => {
    const mapped = mapVintedToKleinanzeigen(source, defaults);
    expect(mapped.content.categoryId).toBeNull();
    expect(mapped.content.categoryFields).toEqual({});
    expect(mapped.attributeHints).toEqual(source.attributeHints);
  });
  it('leaves a non-EUR price empty instead of converting or reusing it', () => {
    const mapped = mapVintedToKleinanzeigen({ ...source, currency: 'GBP' }, defaults);
    expect(mapped.content.priceCents).toBeNull();
    expect(mapped.warnings).toContainEqual(
      expect.objectContaining({ field: 'priceCents', code: 'price_required' }),
    );
  });
  it('does not invent a missing price, condition, category or shipping cost', () => {
    const mapped = mapVintedToKleinanzeigen(
      { ...source, priceCents: null, attributeHints: {} },
      defaults,
    );
    expect(mapped.content.priceCents).toBeNull();
    expect(mapped.content.shippingPriceCents).toBeNull();
    expect(mapped.content.categoryId).toBeNull();
    expect(mapped.content.categoryFields).toEqual({});
  });
  it('does not share mutable attribute or photo arrays with its source', () => {
    const mapped = mapVintedToKleinanzeigen(source, defaults);
    expect(mapped.attributeHints).not.toBe(source.attributeHints);
    expect(mapped.originalPhotoReferences).not.toBe(source.photoReferences);
  });
});
