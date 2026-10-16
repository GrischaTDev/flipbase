import { describe, it, expect } from 'vitest';
import {
  validateKleinanzeigenPublication,
  parseKleinanzeigenProviderSchema,
} from './kleinanzeigen-provider-schema';
const schema = {
  categoryPath: '153/160/shirts',
  categoryLabel: 'Mode & Beauty > Herrenbekleidung > Shirts',
  titleMax: 65,
  descriptionMax: 4000,
  photoCountMax: 20,
  photoBytesMax: 12582912,
  priceStepCents: 100,
  fields: [
    {
      key: 'kleidung_herren.condition',
      label: 'Zustand',
      kind: 'select',
      selection: 'value',
      required: false,
      choices: [{ value: 'like_new', label: 'Sehr Gut', description: '' }],
    },
  ],
  shipping: {
    defaultGroup: 'SMALL',
    defaultMethods: ['DHL_001'],
    groups: [
      {
        value: 'SMALL',
        label: 'Klein',
        choices: [
          { value: 'DHL_001', label: 'DHL Paket 2 kg', description: 'Käufer zahlt Versand' },
        ],
      },
    ],
  },
};
const content = {
  title: 'Jacke',
  description: 'Ganz',
  priceCents: 1200,
  currency: 'EUR' as const,
  priceType: 'FIXED' as const,
  shippingType: 'pickup' as const,
  shippingPriceCents: null,
  postalCode: '12345',
  categoryId: schema.categoryPath,
  categoryFields: { 'kleidung_herren.condition': 'like_new' },
  schemaRevision: 'a'.repeat(64),
};
describe('Kleinanzeigen-Formularvertrag', () => {
  it('akzeptiert nur den gemessenen Aufbau und echte Auswahlwerte', () => {
    expect(parseKleinanzeigenProviderSchema(schema)?.fields[0].choices[0].value).toBe('like_new');
    expect(parseKleinanzeigenProviderSchema({ ...schema, priceStepCents: 1 })).toBeNull();
    expect(validateKleinanzeigenPublication(content, schema, 2)).toEqual([]);
  });
  it('verhindert versehentlich vervielfachte Preise und unvollständige Zielangaben', () => {
    expect(
      validateKleinanzeigenPublication({ ...content, priceCents: 1234 }, schema, 2).some(
        (issue) => issue.field === 'priceCents',
      ),
    ).toBe(true);
    expect(
      validateKleinanzeigenPublication(
        { ...content, postalCode: null, categoryFields: {} },
        schema,
        0,
      ).map((issue) => issue.field),
    ).toEqual(expect.arrayContaining(['postalCode', 'images', 'kleidung_herren.condition']));
  });
  it('verlangt nur tatsächlich angebotene Versandmethoden und Kosten ohne automatische Schätzung', () => {
    const shipping = {
      ...content,
      shippingType: 'both' as const,
      categoryFields: {
        ...content.categoryFields,
        'ad-shipping-package-size': 'SMALL',
        'ad-shipping-options': JSON.stringify(['DHL_001']),
      },
    };
    expect(validateKleinanzeigenPublication(shipping, schema, 2)).toEqual([]);
    expect(
      validateKleinanzeigenPublication(
        {
          ...shipping,
          categoryFields: {
            ...shipping.categoryFields,
            'ad-shipping-options': JSON.stringify(['FAKE']),
          },
        },
        schema,
        2,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateKleinanzeigenPublication({ ...shipping, shippingPriceCents: 500 }, schema, 2).some(
        (issue) => issue.field === 'shippingPriceCents',
      ),
    ).toBe(true);
  });
});
