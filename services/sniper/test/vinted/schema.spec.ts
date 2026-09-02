import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import { VintedCatalogSchema } from '../../src/vinted/schema.js';

describe('VintedCatalogSchema', () => {
  it('accepts the recorded catalog response', () => {
    expect(() => VintedCatalogSchema.parse(fixture)).not.toThrow();
  });

  it('keeps every field the normalizer depends on', () => {
    const parsed = VintedCatalogSchema.parse(fixture);
    const item = parsed.items[0];

    expect(item).toBeDefined();
    expect(item?.id).toBeDefined();
    expect(item?.title).toBeTypeOf('string');
    expect(item?.url).toMatch(/^https:\/\//);
    expect(item?.total_item_price?.amount).toBeDefined();
    expect(item?.total_item_price?.currency_code).toBeTypeOf('string');
  });

  it('rejects a response whose items lost the total price', () => {
    const broken = {
      ...fixture,
      items: fixture.items.map((item) => ({ ...item, total_item_price: undefined })),
    };

    expect(() => VintedCatalogSchema.parse(broken)).toThrow();
  });

  it('ignores unknown fields so a new Vinted field does not break the service', () => {
    const extended = {
      ...fixture,
      items: fixture.items.map((item) => ({ ...item, brand_new_field: 'whatever' })),
    };

    expect(() => VintedCatalogSchema.parse(extended)).not.toThrow();
  });
});
