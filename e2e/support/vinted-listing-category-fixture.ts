import type {
  VintedListingCategoryFields,
  VintedListingChoiceSnapshot,
} from '../../src/app/features/marketplaces/models/vinted-listing-category-fields';

/** Ausschließlich Browser-/Oberflächentests; keine vermeintlichen Vinted-Stammdaten. */
export function listingCategoryFixture(categoryId = 1223): VintedListingCategoryFields {
  const field = (
    name: VintedListingChoiceSnapshot['field'],
    choices: readonly (readonly [number, string, boolean?])[],
    sizeGroupId: number | null = null,
  ): VintedListingChoiceSnapshot => ({
    field: name,
    sizeGroupId,
    choices: choices.map(([id, label, disabled = false]) => ({
      id,
      label,
      disabled,
      selected: false,
      sizeGroupId,
    })),
  });
  return {
    categoryId,
    fields: [
      field(
        'size',
        [
          [208, 'M'],
          [209, 'L', true],
        ],
        4,
      ),
      field('condition', [
        [2, 'Sehr gut'],
        [3, 'Gut'],
      ]),
      field('color', [
        [1, 'Schwarz'],
        [2, 'Blau'],
        [3, 'Weiß'],
      ]),
      field('material', [
        [44, 'Baumwolle'],
        [45, 'Polyester'],
      ]),
      field('package', [
        [1, 'Klein'],
        [2, 'Mittel'],
      ]),
    ],
    unknownFields: [],
    acceptedPhotoMimeTypes: ['image/jpeg', 'image/png'],
    titleMaxLength: 100,
    descriptionMaxLength: 2000,
    aiPhoto: false,
    bump: false,
  };
}
