import { describe, it, expect } from 'vitest';
import { retainKleinanzeigenCategoryFields } from './kleinanzeigen-category-fields';
const schema = {
  categoryPath: '153/160/shirts',
  categoryLabel: 'Shirts',
  titleMax: 65,
  descriptionMax: 4000,
  photoCountMax: 20,
  photoBytesMax: 12582912,
  priceStepCents: 100,
  fields: [
    {
      key: 'kleidung_herren.groesse',
      label: 'Größe',
      kind: 'select' as const,
      selection: 'label' as const,
      required: false,
      choices: [{ value: 'M', label: 'M', description: '' }],
    },
  ],
  shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
};
describe('Eigenschaften bei Kategorieänderung', () => {
  it('behält gültige Angaben und entfernt nur nicht angebotene Werte', () => {
    const values = { 'kleidung_herren.groesse': 'M', old: 'alt' };
    expect(retainKleinanzeigenCategoryFields(values, schema)).toEqual({
      'kleidung_herren.groesse': 'M',
    });
    expect(values).toEqual({ 'kleidung_herren.groesse': 'M', old: 'alt' });
    expect(retainKleinanzeigenCategoryFields({ 'kleidung_herren.groesse': 'XXL' }, schema)).toEqual(
      {},
    );
  });
  it('ordnet gespeicherte Größe nur einem eindeutigen angebotenen Zielwert zu und erhält manuelle Angaben', () => {
    expect(retainKleinanzeigenCategoryFields({}, schema, { size: 'M' })).toEqual({
      'kleidung_herren.groesse': 'M',
    });
    expect(retainKleinanzeigenCategoryFields({}, schema, { size: 'XXL' })).toEqual({});
    const choices = {
      ...schema,
      fields: [
        {
          ...schema.fields[0],
          choices: [
            { value: 'M', label: 'M', description: '' },
            { value: 'L', label: 'L', description: '' },
          ],
        },
      ],
    };
    expect(
      retainKleinanzeigenCategoryFields({ 'kleidung_herren.groesse': 'L' }, choices, { size: 'M' }),
    ).toEqual({ 'kleidung_herren.groesse': 'L' });
  });
  it('übernimmt Versandwerte nur vollständig aus einer aktuellen angebotenen Gruppe', () => {
    const shipping = {
      ...schema,
      shipping: {
        defaultGroup: 'SMALL',
        defaultMethods: [],
        groups: [
          {
            value: 'SMALL',
            label: 'Klein',
            choices: [{ value: 'DHL_001', label: 'DHL', description: '' }],
          },
        ],
      },
    };
    const values = { 'ad-shipping-package-size': 'SMALL', 'ad-shipping-options': '["DHL_001"]' };
    expect(retainKleinanzeigenCategoryFields(values, shipping)).toEqual(values);
    expect(
      retainKleinanzeigenCategoryFields({ ...values, 'ad-shipping-options': '["FAKE"]' }, shipping),
    ).toEqual({});
  });
});
