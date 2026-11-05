import { resolveFlipbaseVintedListingContent } from '../../../../../services/marketplace-worker/src/vinted-listing-form-mapping';
import { describe, expect, it } from 'vitest';
import { listingCategoryFixture } from '../../../../../e2e/support/vinted-listing-category-fixture';
import { emptyVintedListingContent } from './vinted-listing-content';
import {
  applyVintedListingFieldSelection,
  buildVintedListingFieldSelection,
} from './vinted-listing-field-selection';
import { validateVintedListingEditor } from './vinted-listing-editor-validation';
import {
  flipbaseVintedListingFields,
  prepareFlipbaseVintedListingContent,
} from './flipbase-vinted-listing-form';

describe('Eigenes Inseratformular', () => {
  it.each([
    [1, 'Klein'],
    [2, 'Mittel'],
    [3, 'Groß'],
  ] as const)(
    'übernimmt Paketgröße %s trotz noch unbestätigtem Markentext',
    (packageSizeId, label) => {
      const content = prepareFlipbaseVintedListingContent({
        ...emptyVintedListingContent(),
        title: 'Nike Sneaker',
        description: 'Gut erhalten.',
        priceCents: 7990,
        categoryId: 2632,
        categoryLabel: 'Damen > Schuhe > Sneaker',
        brandId: null,
        brandLabel: 'Nike',
        sizeLabel: '44,5',
        conditionLabel: 'Sehr gut',
      });
      const schema = flipbaseVintedListingFields(2632, content.categoryLabel, content);
      const selection = buildVintedListingFieldSelection(schema, { ...content, packageSizeId });
      const selected = applyVintedListingFieldSelection(content, {
        ...selection,
        fields: ['package'],
      });
      expect(selection.packageLabel).toBe(label);
      expect(selected).toMatchObject({ packageSizeId, brandId: null, brandLabel: 'Nike' });
      const errors = validateVintedListingEditor(
        selected,
        [{ mimeType: 'image/jpeg', byteSize: 123 }],
        schema,
      );
      expect(errors['package']).toBeUndefined();
      expect(errors['brand']).toBeDefined();
    },
  );
  it('übernimmt kombinierte Altgrößen und EU-Schreibweisen eindeutig und erhält gespeicherte Sondergrößen', () => {
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
    ).toMatchObject({ sizeId: expect.any(Number), sizeLabel: 'Alte Sondergröße' });
    expect(prepareFlipbaseVintedListingContent({ ...base, sizeLabel: 'M / L' }).sizeId).toBeNull();
    expect(
      prepareFlipbaseVintedListingContent({
        ...base,
        categoryLabel: 'Kinder > Kleidung',
        sizeLabel: '176/182',
      }),
    ).toMatchObject({ sizeId: null, sizeLabel: '176/182' });
  });
  it('lässt gespeicherte Jeansgrößen wie W32 beim Relisten nicht als fehlend gelten', () => {
    const content = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      title: 'Levi’s 501',
      description: 'Gut erhalten.',
      priceCents: 2500,
      categoryId: 257,
      categoryLabel: 'Herren > Kleidung > Jeans',
      brandId: 10,
      brandLabel: 'Levi’s',
      sizeId: 1641,
      sizeLabel: 'W32',
      conditionLabel: 'Sehr gut',
      colorLabels: ['Blau'],
      materialLabels: ['Cord'],
    });
    expect(content).toMatchObject({ sizeLabel: 'W32', materialLabels: ['Cord'] });
    expect(content.sizeId).not.toBeNull();
    expect(content.materialIds).toHaveLength(1);
    const errors = validateVintedListingEditor(
      content,
      [{ mimeType: 'image/jpeg', byteSize: 123 }],
      flipbaseVintedListingFields(257, content.categoryLabel, content),
    );
    expect(errors['size']).toBeUndefined();
    expect(errors['material']).toBeUndefined();
  });
  it('bietet bei Jeans mit nur dem Blattnamen die volle Größenauswahl samt Bundweiten an', () => {
    const sizes =
      flipbaseVintedListingFields(1839, 'Skinny Jeans', {
        brandId: null,
        brandLabel: '',
        sizeLabel: 'W32',
      })
        .fields.find((field) => field.field === 'size')
        ?.choices.map((choice) => choice.label) ?? [];
    expect(sizes).toEqual(expect.arrayContaining(['XS', 'M', 'XXL', '38', 'W24', 'W32', 'W40']));
    expect(sizes.filter((label) => label === 'W32')).toHaveLength(1);
    expect(sizes.length).toBeGreaterThan(30);
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
  it('verschiebt nur ausdrücklich die vor dem Fotoupload fehlende Paketzuordnung', () => {
    const local = prepareFlipbaseVintedListingContent({
      ...emptyVintedListingContent(),
      categoryId: 1223,
      sizeLabel: 'M',
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    });
    const schema = listingCategoryFixture();
    const initial = {
      ...schema,
      fields: schema.fields.filter((field) => field.field !== 'package'),
    };
    expect(() => resolveFlipbaseVintedListingContent(local, initial)).toThrow(/Paketgröße/);
    expect(
      resolveFlipbaseVintedListingContent(local, initial, { deferPackage: true }),
    ).toMatchObject({
      packageSizeId: 2,
      sizeId: 208,
      conditionId: 2,
    });
    expect(resolveFlipbaseVintedListingContent(local, schema)).toMatchObject({ packageSizeId: 2 });
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

it.each([
  ['S', 2435, 207],
  ['EU 36', 605, 2232],
  ['EU 38', 607, 2236],
] as const)(
  'maps the audited stale size %s to the current provider ID',
  (label, oldId, currentId) => {
    const content = {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      categoryLabel: 'Herren > Kleidung',
      sizeId: oldId,
      sizeLabel: label,
      attributes: {
        flipbaseListingForm: '1',
        accessory_department: '575',
        accessory_department_label: 'Herren',
      },
    };
    const schema = listingCategoryFixture();
    const resolved = resolveFlipbaseVintedListingContent(content, {
      ...schema,
      fields: schema.fields.map((field) =>
        field.field === 'size'
          ? {
              ...field,
              choices: [
                { id: currentId, label, selected: false, disabled: false, sizeGroupId: 14 },
              ],
            }
          : field,
      ),
    });
    expect(resolved.sizeId).toBe(currentId);
    expect(resolved.attributes).toEqual({
      accessory_department: '575',
      accessory_department_label: 'Herren',
    });
  },
);

it('keeps the old account-specific scarf categories distinct from modern target-group fields', () => {
  const legacy = flipbaseVintedListingFields(89, 'Damen > Accessoires > Tücher & Schals');
  const modern = flipbaseVintedListingFields(5555, 'Modeaccessoires > Tücher & Schals');
  expect(legacy.fields.some((field) => field.field === 'accessory_department')).toBe(false);
  expect(modern.fields.some((field) => field.field === 'accessory_department')).toBe(true);
});

describe('Gespeicherte echte Vinted-Auswahlwerte', () => {
  const real = {
    categoryId: 257,
    fields: [
      {
        field: 'size' as const,
        sizeGroupId: null,
        choices: [
          { id: 1641, label: 'W32', selected: true, disabled: false, sizeGroupId: 1074 },
          { id: 207, label: 'S', selected: false, disabled: false, sizeGroupId: 4 },
          { id: 2236, label: 'EU 38', selected: false, disabled: false, sizeGroupId: 30 },
        ],
      },
      {
        field: 'condition' as const,
        sizeGroupId: null,
        choices: [
          { id: 2, label: 'Sehr gut', selected: false, disabled: false, sizeGroupId: null },
        ],
      },
      {
        field: 'color' as const,
        sizeGroupId: null,
        choices: [{ id: 9, label: 'Blau', selected: false, disabled: false, sizeGroupId: null }],
      },
    ],
    unknownFields: [],
    acceptedPhotoMimeTypes: ['image/jpeg'],
    titleMaxLength: 100,
    descriptionMaxLength: 2000,
    aiPhoto: false,
    bump: false,
  };
  const content = {
    ...emptyVintedListingContent(),
    title: 'Levi’s 501',
    description: 'Gut erhalten.',
    priceCents: 2500,
    categoryId: 257,
    categoryLabel: 'Herren > Kleidung > Jeans',
    brandId: 10,
    brandLabel: 'Levi’s',
    sizeLabel: 'W32',
    conditionLabel: 'Sehr gut',
    colorLabels: ['Blau'],
  };

  it('zeigt alle Größengruppen von Vinted und lässt nicht angebotene Felder weg', () => {
    const schema = flipbaseVintedListingFields(257, content.categoryLabel, content, real);
    const sizes = schema.fields.find((field) => field.field === 'size')!.choices;
    expect(sizes.map((choice) => [choice.id, choice.label, choice.selected])).toEqual([
      [1641, 'W32', false],
      [207, 'S', false],
      [2236, 'EU 38', false],
    ]);
    expect(schema.fields.some((field) => field.field === 'material')).toBe(false);
    expect(schema.fields.some((field) => field.field === 'package')).toBe(true);
  });

  it('übernimmt echte Kennungen und meldet bei Vinted nicht mehr vorhandene Größen', () => {
    const prepared = prepareFlipbaseVintedListingContent(content, real);
    expect(prepared).toMatchObject({ sizeId: 1641, conditionId: 2, colorIds: [9] });
    const photos = [{ mimeType: 'image/jpeg', byteSize: 123 }];
    expect(
      validateVintedListingEditor(
        prepared,
        photos,
        flipbaseVintedListingFields(257, content.categoryLabel, prepared, real),
      )['size'],
    ).toBeUndefined();
    const outdated = prepareFlipbaseVintedListingContent({ ...content, sizeLabel: 'W31' }, real);
    expect(outdated.sizeId).toBeNull();
    expect(
      validateVintedListingEditor(
        outdated,
        photos,
        flipbaseVintedListingFields(257, content.categoryLabel, outdated, real),
      )['size'],
    ).toBeDefined();
  });

  it('ignoriert gespeicherte Werte einer anderen Kategorie', () => {
    const schema = flipbaseVintedListingFields(1223, 'Damen > Kleidung > Jacken', content, real);
    expect(schema.fields.find((field) => field.field === 'size')!.choices[0]!.label).toBe('XXXS');
  });
});
