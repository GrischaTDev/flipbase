import { describe, expect, it } from 'vitest';
import catalog from '../../../../../services/marketplace-worker/test/fixtures/vinted-catalog-attributes.json';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { emptyVintedListingContent } from './vinted-listing-content';
import {
  vintedListingCatalogCategoryFields,
  type VintedListingCatalogRows,
} from './vinted-listing-catalog-fields';
import { parseVintedListingCategoryFields } from './vinted-listing-category-fields';
import { parseVintedListingChoices } from '../../../../../services/marketplace-worker/src/vinted-listing-contracts';
import {
  flipbaseVintedListingFields,
  prepareFlipbaseVintedListingContent,
} from './flipbase-vinted-listing-form';
import { storedVintedListingEdit } from './vinted-stored-listing-edit';
import { vintedListingEditSelection } from './vinted-listing-edit-form';

interface CatalogFixture {
  categories: Record<
    string,
    { fields: { code: string; sizeGroupIds?: number[]; options?: unknown }[] }
  >;
  sizeGroups: Record<string, { title: string; options: { id: number; title: string }[] }>;
  options: Record<string, { id: number; title: string }[]>;
}
const fixture = catalog as unknown as CatalogFixture;

/** Zeilen, wie sie die Katalogtabellen für eine gemessene Kategorie liefern. */
function rows(categoryId: number): VintedListingCatalogRows {
  const category = fixture.categories[String(categoryId)]!;
  const groups = category.fields.find((field) => field.code === 'size')?.sizeGroupIds ?? [];
  return {
    fields: category.fields.map((field, position) => ({
      field_code: field.code,
      position,
      option_ids: null,
    })),
    sizeGroups: groups.map((id, position) => ({ size_group_id: id, position })),
    sizes: groups.flatMap((group) =>
      fixture.sizeGroups[String(group)]!.options.map((size, position) => ({
        id: size.id,
        size_group_id: group,
        title: size.title,
        position,
      })),
    ),
    options: [
      ...fixture.options['condition']!.map((option, position) => ({
        field_code: 'condition',
        ...option,
        position,
      })),
      ...fixture.options['material']!.map((option, position) => ({
        field_code: 'material',
        ...option,
        position,
      })),
      ...(fixture.options['colors'] as { id: number; title: string }[]).map(
        ({ id, title }, position) => ({ field_code: 'color', id, title, position }),
      ),
    ],
  };
}

describe('Lokaler Vinted-Katalog in den Inseratmasken', () => {
  it('zeigt bei Damenjeans alle sechs Größengruppen und doppelte Bezeichnungen nur einmal', () => {
    const fields = vintedListingCatalogCategoryFields(1845, rows(1845))!;
    const size = fields.fields.find((field) => field.field === 'size')!;
    expect(new Set(size.choices.map((choice) => choice.sizeGroupId))).toEqual(
      new Set([80, 82, 81, 83, 84, 85]),
    );
    expect(size.choices.filter((choice) => choice.label === 'Sonstige')).toHaveLength(1);
    expect(size.choices.find((choice) => choice.label === 'EU 38')?.id).toBe(1944);
    expect(
      fields.fields.find((field) => field.field === 'condition')?.choices.map((c) => c.label),
    ).toContain('Neu, mit Etikett');
  });

  it('bietet Herrenjeans die Größen Männer und die Bundweiten mit Vinteds Bezeichnung', () => {
    const size = vintedListingCatalogCategoryFields(1819, rows(1819))!.fields.find(
      (field) => field.field === 'size',
    )!;
    expect(size.choices.find((choice) => choice.id === 1640)).toMatchObject({
      label: 'W32 | DE 48',
      sizeGroupId: 77,
    });
    expect(size.choices.find((choice) => choice.label === 'M')?.sizeGroupId).toBe(14);
  });

  it('lässt bei Schals die Größe weg und liefert nichts für ungelesene Kategorien', () => {
    const fields = vintedListingCatalogCategoryFields(5555, rows(5555))!;
    expect(fields.fields.some((field) => field.field === 'size')).toBe(false);
    expect(
      vintedListingCatalogCategoryFields(1, { fields: [], sizeGroups: [], sizes: [], options: [] }),
    ).toBeNull();
  });

  it('nimmt für gespeicherte Werte mehrere Größengruppen an, beim Formular nur eine', () => {
    const fields = vintedListingCatalogCategoryFields(1819, rows(1819))!;
    expect(parseVintedListingCategoryFields(fields, 1819)).toEqual(fields);
    const size = fields.fields.find((field) => field.field === 'size')!;
    expect(() =>
      parseVintedListingCategoryFields(
        { ...fields, fields: [{ ...size, sizeGroupId: 999 }] },
        1819,
      ),
    ).toThrow();
    expect(
      parseVintedListingChoices('size', [
        { id: 'size-group-14-grid-option-208', label: 'M', selected: false, disabled: false },
      ]).sizeGroupId,
    ).toBe(14);
    expect(() =>
      parseVintedListingChoices('size', [
        { id: 'size-group-14-grid-option-208', label: 'M', selected: false, disabled: false },
        {
          id: 'size-group-77-grid-option-1640',
          label: 'W32 | DE 48',
          selected: false,
          disabled: false,
        },
      ]),
    ).toThrow();
  });

  it('wählt bei Vinted gelesene Inserate über ihre Kennungen vor, nicht über Bezeichnungen', () => {
    const real = vintedListingCatalogCategoryFields(1819, rows(1819))!;
    const content = {
      ...emptyVintedListingContent(),
      title: 'Levi’s 501',
      description: 'Gut erhalten.',
      priceCents: 2500,
      categoryId: 1819,
      categoryLabel: 'Gerade geschnittene Jeans',
      brandLabel: 'Levi’s',
      sizeId: 1640,
      sizeLabel: 'W32',
      conditionId: 6,
      conditionLabel: 'Neu mit Etikett',
      colorIds: [9],
      colorLabels: ['Blau'],
      materialIds: [303],
      materialLabels: ['Denim'],
    };
    const prepared = prepareFlipbaseVintedListingContent(content, real);
    expect(prepared).toMatchObject({
      sizeId: 1640,
      sizeLabel: 'W32 | DE 48',
      conditionId: 6,
      conditionLabel: 'Neu, mit Etikett',
      colorIds: [9],
      materialIds: [303],
    });
    const entry = {
      ...listingCurrentContentFixture(),
      id: 'a',
      connectionId: 'account-a',
      title: content.title,
      text: content.description,
      price: 25,
      listingContent: content,
    } as unknown as Parameters<typeof storedVintedListingEdit>[0];
    const stored = storedVintedListingEdit(entry, content.description, real)!;
    const selection = vintedListingEditSelection(stored);
    expect(selection.size).toBe('1640');
    expect(selection.condition).toBe('6');
    expect(stored.schema.fields.find((field) => field.field === 'size')?.choices.length).toBe(
      real.fields.find((field) => field.field === 'size')?.choices.length,
    );
  });

  it('ordnet Entwürfe der eigenen Liste weiter über Bezeichnungen zu', () => {
    const real = vintedListingCatalogCategoryFields(1819, rows(1819))!;
    const draft = {
      ...emptyVintedListingContent(),
      categoryId: 1819,
      categoryLabel: 'Gerade geschnittene Jeans',
      sizeId: 4,
      sizeLabel: 'M',
      conditionId: 3,
      conditionLabel: 'Sehr gut',
      attributes: { flipbaseListingForm: '1' },
    };
    expect(prepareFlipbaseVintedListingContent(draft, real)).toMatchObject({
      sizeId: 208,
      conditionId: 2,
    });
    expect(flipbaseVintedListingFields(1819, 'Jeans', draft, real).fields[0]?.field).toBe('size');
  });
});
