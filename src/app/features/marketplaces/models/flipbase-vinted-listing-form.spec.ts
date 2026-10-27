import { resolveFlipbaseVintedListingContent } from '../../../../../services/marketplace-worker/src/vinted-listing-form-mapping';
import { describe, expect, it } from 'vitest';
import { listingCategoryFixture } from '../../../../../e2e/support/vinted-listing-category-fixture';
import { emptyVintedListingContent } from './vinted-listing-content';
import {
  flipbaseVintedListingFields,
  prepareFlipbaseVintedListingContent,
} from './flipbase-vinted-listing-form';

describe('Eigenes Inseratformular', () => {
  it('übernimmt kombinierte Altgrößen und EU-Schreibweisen eindeutig und erhält unbekannte Größen als Hinweis', () => {
    const base = {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      categoryLabel: 'Damen > Kleidung > Jacken',
    };
    expect(
      prepareFlipbaseVintedListingContent({ ...base, sizeId: 208, sizeLabel: 'M / 38 / 10' }),
    ).toMatchObject({ sizeId: 5, sizeLabel: 'M' });
    expect(
      prepareFlipbaseVintedListingContent({
        ...base,
        categoryLabel: 'Damen > Schuhe',
        sizeLabel: 'EU 38.5',
      }).sizeLabel,
    ).toBe('38,5');
    expect(
      prepareFlipbaseVintedListingContent({ ...base, sizeLabel: 'Alte Sondergröße' }),
    ).toMatchObject({ sizeId: null, sizeLabel: 'Alte Sondergröße' });
    expect(prepareFlipbaseVintedListingContent({ ...base, sizeLabel: 'M / L' }).sizeId).toBeNull();
    expect(
      prepareFlipbaseVintedListingContent({
        ...base,
        categoryLabel: 'Kinder > Kleidung',
        sizeLabel: '176/182',
      }),
    ).toMatchObject({ sizeId: null, sizeLabel: '176/182' });
  });
  it('verwendet bei Mützen, Handschuhen, Gürteln und BHs vor allgemeinen Kleidungsgrößen das eigene Größenprofil', () => {
    for (const [path, expected] of [
      ['Kinder > Jungen > Kleidung > Mützen', '52'],
      ['Kinder > Jungen > Kleidung > Mützen', 'Einheitsgröße'],
      ['Damen > Kleidung > Unterwäsche > BHs', '75B'],
      ['Damen > Kleidung > Accessoires > Handschuhe', '6,5'],
      ['Herren > Kleidung > Gürtel', '85'],
    ]) {
      const sizes = flipbaseVintedListingFields(1223, path)
        .fields.find((field) => field.field === 'size')!
        .choices.map((choice) => choice.label);
      expect(sizes).toContain(expected);
    }
  });
  it('bietet für Damen- und Kinderschuhe Schuhgrößen statt Kleidergrößen an', () => {
    const shoes = flipbaseVintedListingFields(16, 'Damen > Schuhe > Sneaker');
    const sizes = shoes.fields
      .find((field) => field.field === 'size')!
      .choices.map((choice) => choice.label);
    expect(sizes).toContain('38');
    expect(sizes).toContain('38,5');
    expect(sizes).not.toContain('M');
    expect(
      flipbaseVintedListingFields(17, 'Kinder > Mädchen > Schuhe').fields[0].choices.map(
        (choice) => choice.label,
      ),
    ).toContain('22');
    expect(shoes.fields.map((field) => field.field)).toEqual([
      'size',
      'condition',
      'color',
      'material',
      'package',
      'brand',
    ]);
  });
  it('ordnet eigene Kennungen ausschließlich über eindeutige aktuelle Anbieterwerte zu', () => {
    const local = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      categoryLabel: 'Damen > Kleidung > Jacken',
      sizeLabel: 'M',
      conditionLabel: 'Sehr gut',
      colorLabels: ['Schwarz'],
      materialLabels: ['Baumwolle'],
      packageSizeId: 2,
    });
    const resolved = resolveFlipbaseVintedListingContent(local, listingCategoryFixture());
    expect(resolved).toMatchObject({
      sizeId: 208,
      conditionId: 2,
      colorIds: [1],
      materialIds: [44],
      packageSizeId: 2,
      attributes: {},
    });
    expect(local.attributes['flipbaseListingForm']).toBe('1');
    expect(local.materialIds).not.toEqual([44]);
    expect(local.attributes).not.toEqual(resolved.attributes);
  });
  it('weist fehlende, gesperrte, doppeldeutige oder kategoriefremde Zuordnungen zurück', () => {
    const local = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      sizeLabel: 'M',
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
    const schema = listingCategoryFixture();
    for (const choices of [
      [],
      [{ ...schema.fields[0].choices[0], disabled: true }],
      [schema.fields[0].choices[0], { ...schema.fields[0].choices[0], id: 999 }],
    ]) {
      expect(() =>
        resolveFlipbaseVintedListingContent(local, {
          ...schema,
          fields: [{ ...schema.fields[0], choices }, ...schema.fields.slice(1)],
        }),
      ).toThrow(/Größe/);
    }
    expect(() =>
      resolveFlipbaseVintedListingContent(local, { ...schema, categoryId: 99 }),
    ).toThrow();
    expect(resolveFlipbaseVintedListingContent({ ...local, attributes: {} }, schema)).toEqual({
      ...local,
      attributes: {},
    });
  });
  it('erkennt EU-Schuhgrößen und kombinierte Größenbeschriftungen ohne Umrechnung', () => {
    const content = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      categoryLabel: 'Damen > Schuhe',
      sizeLabel: '38,5',
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
    const schema = listingCategoryFixture();
    const decorated = {
      ...schema,
      fields: schema.fields.map((field) =>
        field.field === 'size'
          ? { ...field, choices: [{ ...field.choices[0], id: 903, label: 'EU 38.5' }] }
          : field,
      ),
    };
    expect(resolveFlipbaseVintedListingContent(content, decorated).sizeId).toBe(903);
    const clothing = { ...content, sizeLabel: 'M' };
    expect(
      resolveFlipbaseVintedListingContent(clothing, {
        ...decorated,
        fields: decorated.fields.map((field) =>
          field.field === 'size'
            ? { ...field, choices: [{ ...field.choices[0], label: 'M / 38 / 10' }] }
            : field,
        ),
      }).sizeLabel,
    ).toBe('M / 38 / 10');
  });
  it('überträgt eine ausdrücklich doppelte Kindergröße vollständig', () => {
    const content = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      categoryLabel: 'Kinder > Kleidung',
      sizeLabel: '50/56',
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
    const fixture = listingCategoryFixture();
    const schema = {
      ...fixture,
      fields: fixture.fields.map((field) =>
        field.field === 'size'
          ? { ...field, choices: [{ ...field.choices[0], id: 923, label: '50/56' }] }
          : field,
      ),
    };
    expect(resolveFlipbaseVintedListingContent(content, schema)).toMatchObject({
      sizeId: 923,
      sizeLabel: '50/56',
    });
  });
});
