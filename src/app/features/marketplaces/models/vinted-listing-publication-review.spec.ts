import { describe, expect, it } from 'vitest';
import { listingCategoryFixture } from '../../../../../e2e/support/vinted-listing-category-fixture';
import { emptyVintedListingContent } from './vinted-listing-content';
import type { VintedListingDraft } from './vinted-listing-draft';
import { reviewVintedListingPublication } from './vinted-listing-publication-review';

const workspaceId = '46600000-0000-4000-8000-000000000001',
  connectionId = '46600000-0000-4000-8000-000000000002';
const draft: VintedListingDraft = {
  id: '1',
  workspaceId,
  connectionId,
  revision: 1,
  content: {
    ...emptyVintedListingContent(),
    title: 'Meine Jacke',
    description: 'Tragespuren',
    categoryId: 1223,
    categoryLabel: 'Bomberjacken',
    priceCents: 2050,
    brandId: 254956,
    brandLabel: 'Jako',
    sizeId: 208,
    sizeLabel: 'M',
    conditionId: 2,
    conditionLabel: 'Sehr gut',
    packageSizeId: 2,
  },
  images: [
    {
      id: '2',
      storagePath: `${workspaceId}/1/2.jpg`,
      fileName: 'jacke.jpg',
      mimeType: 'image/jpeg',
      byteSize: 123,
    },
  ],
  inventoryItemId: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
};
const schema = () => ({
  ...listingCategoryFixture(),
  fields: [
    ...listingCategoryFixture().fields,
    {
      field: 'brand' as const,
      sizeGroupId: null,
      choices: [
        { id: null, label: 'Keine Marke', selected: false, disabled: false, sizeGroupId: null },
        { id: 53, label: 'Nike', selected: false, disabled: false, sizeGroupId: null },
      ],
    },
  ],
});
describe('Vinted publication review', () => {
  it('uses current category choices and a freshly confirmed brand outside suggestions', () => {
    const result = reviewVintedListingPublication(
      draft,
      schema(),
      [{ id: 254956, name: 'Jako' }],
      false,
    );
    expect(result.issues).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(result.ready).toBe(true);
    expect(draft.content.title).toBe('Meine Jacke');
  });
  it('rejects similar names, free brand text and changed category choices', () => {
    expect(
      reviewVintedListingPublication(draft, schema(), [{ id: 317425, name: 'Jako-o' }], false)
        .issues,
    ).toContainEqual({ field: 'brand', code: 'unavailable' });
    expect(
      reviewVintedListingPublication(
        { ...draft, content: { ...draft.content, brandId: null } },
        schema(),
        [],
        false,
      ).ready,
    ).toBe(false);
    const changed = {
      ...schema(),
      fields: schema().fields.map((field) =>
        field.field === 'size'
          ? { ...field, choices: field.choices.filter((choice) => choice.id !== 208) }
          : field,
      ),
    };
    expect(
      reviewVintedListingPublication(draft, changed, [{ id: 254956, name: 'Jako' }], false).issues,
    ).toContainEqual({ field: 'size', code: 'unavailable' });
  });
  it('shows missing text, unresolved placeholders, photo limits and unsupported extra fields', () => {
    const incomplete = {
      ...draft,
      content: { ...draft.content, title: '{brand} Jacke', description: '', priceCents: null },
      images: [],
    };
    const result = reviewVintedListingPublication(
      incomplete,
      { ...schema(), unknownFields: ['ISBN'] },
      [{ id: 254956, name: 'Jako' }],
      false,
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: 'title', code: 'invalid' },
        { field: 'description', code: 'missing' },
        { field: 'price', code: 'missing' },
        { field: 'photos', code: 'missing' },
        { field: 'ISBN', code: 'unsupported' },
      ]),
    );
    expect(result.messages.join(' ')).toMatch(/Titel|Beschreibung|Verkaufspreis|Fotos|ISBN/);
    const many = {
      ...draft,
      images: Array.from({ length: 21 }, (_, index) => ({
        ...draft.images[0],
        id: String(index + 2),
        storagePath: `${workspaceId}/1/${index + 2}.jpg`,
      })),
    };
    expect(
      reviewVintedListingPublication(
        many,
        schema(),
        [{ id: 254956, name: 'Jako' }],
        false,
      ).messages.join(' '),
    ).toContain('20 Fotos');
  });
  it('rejects an unrelated schema and a photo checkbox unavailable in the current form', () => {
    expect(() =>
      reviewVintedListingPublication(draft, { ...schema(), categoryId: 2738 }, [], false),
    ).toThrow();
    expect(
      reviewVintedListingPublication(
        draft,
        { ...schema(), aiPhoto: null },
        [{ id: 254956, name: 'Jako' }],
        true,
      ).ready,
    ).toBe(false);
  });
});
