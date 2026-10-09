import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseVintedListingChoices,
  isVintedListingResult,
  validateVintedListingSubmission,
} from '../src/vinted-listing-contracts.ts';
import type {
  VintedListingContent,
  VintedListingCategoryFields,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

function option(id: string, label: string, selected = false, disabled = false) {
  return { id, label, selected, disabled };
}

test('reads category-dependent sizes with the group and unique numeric ID', () => {
  assert.deepEqual(
    parseVintedListingChoices('size', [option('size-group-14-grid-option-208', 'M', true)]),
    {
      field: 'size',
      sizeGroupId: 14,
      choices: [{ id: 208, label: 'M', selected: true, disabled: false, sizeGroupId: 14 }],
    },
  );
  assert.equal(
    parseVintedListingChoices('size', [option('size-group-31-grid-option-607', '38')]).sizeGroupId,
    31,
  );
});

test('deduplicates suggestions by ID and preserves disabled brand changes', () => {
  const result = parseVintedListingChoices('brand', [
    option('suggested-brand-53', 'Nike'),
    option('brand-53', 'Nike'),
    option('brand-14', 'Adidas', false, true),
    option('empty-brand', 'Keine Marke'),
  ]);
  assert.equal(result.choices.length, 3);
  assert.equal(result.choices[1]?.disabled, true);
  assert.equal(result.choices[2]?.id, null);
});

test('does not merge two different IDs because their labels match', () => {
  assert.equal(
    parseVintedListingChoices('brand', [option('brand-53', 'A'), option('brand-14', 'A')]).choices
      .length,
    2,
  );
});

test('refuses inconsistent selections, group changes and malformed IDs', () => {
  for (const values of [
    [option('brand-53', 'Nike', true), option('brand-14', 'Adidas', true)],
    [option('brand-53', 'Nike'), option('suggested-brand-53', 'Other')],
    [option('brand-9007199254740993', 'Unsafe')],
    [option('color-1', 'Wrong field')],
  ])
    assert.throws(() => parseVintedListingChoices('brand', values));
  assert.throws(() =>
    parseVintedListingChoices('size', [
      option('size-group-14-grid-option-208', 'M'),
      option('size-group-31-grid-option-607', '38'),
    ]),
  );
});

test('enforces observed multi-selection limits without evicting earlier selections', () => {
  assert.equal(
    parseVintedListingChoices('color', [
      option('color-1', 'Schwarz', true),
      option('color-3', 'Grau', true),
    ]).choices.length,
    2,
  );
  assert.throws(() =>
    parseVintedListingChoices(
      'color',
      [1, 3, 12].map((id) => option(`color-${id}`, 'Farbe', true)),
    ),
  );
  assert.throws(() =>
    parseVintedListingChoices(
      'material',
      [44, 43, 45, 46].map((id) => option(`material-${id}`, 'Material', true)),
    ),
  );
});

test('requires action, ID, account, actual provider state and a valid verification time', () => {
  const result = {
    outcome: 'confirmed',
    action: 'publish',
    externalId: '123',
    externalAccountId: '789',
    providerState: 'active',
    verifiedAt: '2026-10-09T12:00:00.000Z',
  };
  assert.equal(isVintedListingResult(result, 'publish', '789'), true);
  assert.equal(
    isVintedListingResult({ ...result, providerState: 'processing' }, 'publish', '789'),
    true,
  );
  for (const invalid of [
    { ...result, externalId: undefined },
    { ...result, externalId: 123 },
    { ...result, externalAccountId: '790' },
    { ...result, action: 'update' },
    { ...result, providerState: 'draft' },
    { ...result, verifiedAt: '2026-02-30T12:00:00.000Z' },
    { ...result, extra: 'secret' },
  ])
    assert.equal(isVintedListingResult(invalid, 'publish', '789'), false);
  assert.equal(
    isVintedListingResult(
      { outcome: 'failed', errorCode: 'category_unavailable' },
      'publish',
      '789',
    ),
    true,
  );
  assert.equal(
    isVintedListingResult(
      { outcome: 'outcome_unknown', errorCode: 'confirmation_missing' },
      'publish',
      '789',
    ),
    true,
  );
});

const content: VintedListingContent = {
  title: 'Jacke',
  description: 'Gebraucht',
  priceCents: 1234,
  currency: 'EUR',
  categoryId: 1223,
  categoryLabel: 'Bomberjacken',
  brandId: 53,
  brandLabel: 'Nike',
  sizeId: 208,
  sizeLabel: 'M',
  conditionId: 2,
  conditionLabel: 'Sehr gut',
  colorIds: [1],
  colorLabels: ['Schwarz'],
  materialIds: [44],
  materialLabels: ['Baumwolle'],
  packageSizeId: 2,
  attributes: {},
};
const schema: VintedListingCategoryFields = {
  categoryId: 1223,
  unknownFields: [],
  acceptedPhotoMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  titleMaxLength: null,
  descriptionMaxLength: null,
  aiPhoto: null,
  bump: null,
  fields: [
    parseVintedListingChoices('brand', [
      option('brand-53', 'Nike'),
      option('empty-brand', 'Keine Marke'),
    ]),
    parseVintedListingChoices('size', [option('size-group-14-grid-option-208', 'M')]),
    parseVintedListingChoices('condition', [option('condition-2', 'Sehr gut')]),
    parseVintedListingChoices('color', [option('color-1', 'Schwarz')]),
    parseVintedListingChoices('material', [option('material-44', 'Baumwolle')]),
    parseVintedListingChoices('package', [option('package_type_selector_2', 'Mittel')]),
  ],
};
const photo = { mimeType: 'image/jpeg', byteSize: 123 };

test('validates category-dependent IDs and the explicit sale price before submission', () => {
  assert.deepEqual(validateVintedListingSubmission(content, [photo], schema), []);
  assert.ok(
    validateVintedListingSubmission({ ...content, sizeId: 607 }, [photo], schema).some(
      (issue) => issue.field === 'size' && issue.code === 'unavailable',
    ),
  );
  assert.ok(
    validateVintedListingSubmission({ ...content, priceCents: null }, [photo], schema).some(
      (issue) => issue.field === 'price' && issue.code === 'missing',
    ),
  );
  assert.ok(
    validateVintedListingSubmission({ ...content, priceCents: 12.5 }, [photo], schema).some(
      (issue) => issue.field === 'price' && issue.code === 'invalid',
    ),
  );
  assert.ok(
    validateVintedListingSubmission({ ...content, categoryId: 2738 }, [photo], schema).some(
      (issue) => issue.field === 'category',
    ),
  );
});

test('checks official photo count and actual accepted formats without inventing byte limits', () => {
  assert.ok(
    validateVintedListingSubmission(content, [], schema).some(
      (issue) => issue.field === 'photos' && issue.code === 'missing',
    ),
  );
  assert.deepEqual(
    validateVintedListingSubmission(
      content,
      Array.from({ length: 20 }, () => photo),
      schema,
    ),
    [],
  );
  assert.ok(
    validateVintedListingSubmission(
      content,
      Array.from({ length: 21 }, () => photo),
      schema,
    ).some((issue) => issue.code === 'limit'),
  );
  assert.ok(
    validateVintedListingSubmission(
      content,
      [{ ...photo, mimeType: 'application/pdf' }],
      schema,
    ).some((issue) => issue.code === 'invalid'),
  );
  assert.ok(
    validateVintedListingSubmission(content, [{ ...photo, byteSize: 0 }], schema).some(
      (issue) => issue.code === 'invalid',
    ),
  );
});

test('does not bypass disabled choices, drop unknown fields or submit unresolved placeholders', () => {
  const disabled = {
    ...schema,
    fields: schema.fields.map((field) =>
      field.field === 'brand'
        ? { ...field, choices: field.choices.map((choice) => ({ ...choice, disabled: true })) }
        : field,
    ),
  };
  assert.ok(
    validateVintedListingSubmission(content, [photo], disabled).some(
      (issue) => issue.field === 'brand' && issue.code === 'disabled',
    ),
  );
  assert.ok(
    validateVintedListingSubmission(
      { ...content, attributes: { isbn: '123' } },
      [photo],
      schema,
    ).some((issue) => issue.field === 'attributes' && issue.code === 'unsupported'),
  );
  assert.ok(
    validateVintedListingSubmission(content, [photo], { ...schema, unknownFields: ['isbn'] }).some(
      (issue) => issue.field === 'isbn' && issue.code === 'unsupported',
    ),
  );
  assert.ok(
    validateVintedListingSubmission({ ...content, title: 'Jacke {size}' }, [photo], schema).some(
      (issue) => issue.field === 'title' && issue.code === 'invalid',
    ),
  );
});

test('distinguishes an explicit no-brand choice from an empty draft field', () => {
  assert.deepEqual(
    validateVintedListingSubmission(
      { ...content, brandId: null, brandLabel: 'Keine Marke' },
      [photo],
      schema,
    ),
    [],
  );
  assert.ok(
    validateVintedListingSubmission(
      { ...content, brandId: null, brandLabel: '' },
      [photo],
      schema,
    ).some((issue) => issue.field === 'brand' && issue.code === 'missing'),
  );
});

test('uses actual field limits and refuses stale category fields instead of a clothing default', () => {
  assert.ok(
    validateVintedListingSubmission(content, [photo], { ...schema, titleMaxLength: 2 }).some(
      (issue) => issue.field === 'title' && issue.code === 'limit',
    ),
  );
  const withoutSize = {
    ...schema,
    fields: schema.fields.filter((field) => field.field !== 'size'),
  };
  assert.ok(
    validateVintedListingSubmission(content, [photo], withoutSize).some(
      (issue) => issue.field === 'size' && issue.code === 'unsupported',
    ),
  );
  assert.deepEqual(
    validateVintedListingSubmission(
      { ...content, sizeId: null, sizeLabel: '' },
      [photo],
      withoutSize,
    ),
    [],
  );
});

test('does not submit a changed form without condition or package selection', () => {
  for (const field of ['condition', 'package'] as const) {
    const changedSchema = {
      ...schema,
      fields: schema.fields.filter((choice) => choice.field !== field),
    };
    const changedContent = {
      ...content,
      conditionId: null,
      conditionLabel: '',
      packageSizeId: null,
    };
    assert.ok(
      validateVintedListingSubmission(changedContent, [photo], changedSchema).some(
        (issue) => issue.field === field && issue.code === 'unsupported',
      ),
    );
  }
});

test('refuses labels that contradict the actual provider IDs and paid options', () => {
  for (const changedContent of [
    { ...content, brandLabel: 'adidas' },
    { ...content, colorLabels: ['Weiß'] },
  ]) {
    assert.ok(
      validateVintedListingSubmission(changedContent, [photo], schema).some(
        (issue) => issue.code === 'unavailable',
      ),
    );
  }
  assert.ok(
    validateVintedListingSubmission(content, [photo], { ...schema, bump: true }).some(
      (issue) => issue.field === 'bump' && issue.code === 'unsupported',
    ),
  );
});
