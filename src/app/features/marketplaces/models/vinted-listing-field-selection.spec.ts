import { describe, expect, it } from 'vitest';
import { emptyVintedListingContent } from './vinted-listing-content';
import type { VintedListingCategoryFields } from './vinted-listing-category-fields';
import {
  applyVintedListingFieldSelection,
  buildVintedListingFieldSelection,
} from './vinted-listing-field-selection';

const schema: VintedListingCategoryFields = {
  categoryId: 1223,
  fields: [
    {
      field: 'size',
      sizeGroupId: 4,
      choices: [
        { id: 208, label: 'M', sizeGroupId: 4, selected: false, disabled: false },
        { id: 209, label: 'L', sizeGroupId: 4, selected: false, disabled: true },
      ],
    },
    {
      field: 'condition',
      sizeGroupId: null,
      choices: [{ id: 2, label: 'Sehr gut', sizeGroupId: null, selected: false, disabled: false }],
    },
    {
      field: 'color',
      sizeGroupId: null,
      choices: [1, 2, 3].map((id) => ({
        id,
        label: `Farbe ${id}`,
        sizeGroupId: null,
        selected: false,
        disabled: false,
      })),
    },
    {
      field: 'material',
      sizeGroupId: null,
      choices: [
        { id: 44, label: 'Baumwolle', sizeGroupId: null, selected: false, disabled: false },
      ],
    },
    {
      field: 'package',
      sizeGroupId: null,
      choices: [{ id: 2, label: 'Mittel', sizeGroupId: null, selected: false, disabled: false }],
    },
  ],
  unknownFields: [],
  acceptedPhotoMimeTypes: ['image/jpeg'],
  titleMaxLength: 100,
  descriptionMaxLength: 2000,
  aiPhoto: false,
  bump: false,
};
const values = {
  sizeId: 208,
  conditionId: 2,
  colorIds: [2, 1],
  materialIds: [44],
  packageSizeId: 2,
};
describe('Vinted listing field selection', () => {
  it('pairs enabled provider IDs with canonical labels and preserves unrelated pending fields', () => {
    const selection = buildVintedListingFieldSelection(schema, values);
    const current = {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      title: 'Meine Jacke',
      description: 'Tragespuren',
      priceCents: 2050,
      brandId: 53,
      brandLabel: 'Nike',
      attributes: { width: '42' },
    };
    expect(applyVintedListingFieldSelection(current, selection)).toEqual({
      ...current,
      sizeId: 208,
      sizeLabel: 'M',
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      colorIds: [2, 1],
      colorLabels: ['Farbe 2', 'Farbe 1'],
      materialIds: [44],
      materialLabels: ['Baumwolle'],
      packageSizeId: 2,
    });
    expect(selection.packageLabel).toBe('Mittel');
    expect(current.sizeId).toBeNull();
  });
  it('allows incomplete drafts without replacing fields absent from this category response', () => {
    const selection = buildVintedListingFieldSelection(
      { ...schema, fields: schema.fields.filter((field) => field.field === 'size') },
      { ...values, sizeId: null },
    );
    const current = {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      conditionId: 2,
      conditionLabel: 'Sehr gut',
      packageSizeId: 2,
    };
    expect(applyVintedListingFieldSelection(current, selection)).toEqual(current);
    expect(selection.fields).toEqual(['size']);
  });
  it('rejects unavailable, disabled, repeated or excessive choices', () => {
    for (const patch of [
      { sizeId: 209 },
      { conditionId: 999 },
      { colorIds: [1, 1] },
      { colorIds: [1, 2, 3] },
      { materialIds: [44, 99] },
      { packageSizeId: 99 },
    ])
      expect(() => buildVintedListingFieldSelection(schema, { ...values, ...patch })).toThrow();
  });
  it('rejects a different category and cannot replace title or invent a selection field', () => {
    const selection = buildVintedListingFieldSelection(schema, values);
    expect(() =>
      applyVintedListingFieldSelection(emptyVintedListingContent(), selection),
    ).toThrow();
    const current = { ...emptyVintedListingContent(), categoryId: 1223, title: 'Behalten' };
    expect(() =>
      applyVintedListingFieldSelection(current, {
        ...selection,
        fields: ['title'],
      } as unknown as typeof selection),
    ).toThrow();
    expect(() =>
      applyVintedListingFieldSelection(current, {
        ...selection,
        values: { ...selection.values, title: 'Ersetzt' },
      } as typeof selection),
    ).toThrow();
  });
});
