import { describe, expect, it } from 'vitest';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { parseMarketplacePage } from './marketplace-response';
import {
  applyStoredVintedListingEdit,
  storedVintedListingEdit,
} from './vinted-stored-listing-edit';
import { vintedListingEditSelection, withVintedListingBrand } from './vinted-listing-edit-form';

function fixture() {
  const current = listingCurrentContentFixture();
  const account = createMarketplaceFixtures().connections[0];
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...account,
          id: 'a',
          title: current.content.title,
          text: current.content.description,
          price: 20.5,
          listingContent: current.content,
          imageUrls: ['https://originals.example.test/a', 'https://originals.example.test/b'],
        },
      ],
      total: 1,
      nextCursor: null,
    },
    account,
  ).items[0];
  const stored = storedVintedListingEdit(
    { ...entry, listingContent: current.content },
    current.content.description,
  );
  if (!stored) throw new Error('Expected stored content');
  const selection = vintedListingEditSelection(stored);
  const fields = {
    ...selection,
    color: 'Blau · Gelb',
    material: 'Acryl',
    title: current.content.title,
    description: current.content.description,
    price: '20,50',
  };
  return { current, stored, fields };
}

describe('Stored Vinted listing editing', () => {
  it('prefills stored selections and keeps the saved photo order', () => {
    const { stored } = fixture();
    expect(stored.content.sizeLabel).toBe('38');
    expect(
      stored.schema.fields
        .find((field) => field.field === 'size')
        ?.choices.filter((choice) => choice.selected)
        .map((choice) => choice.label),
    ).toEqual(['38']);
    expect(stored.photoUrls).toEqual([
      'https://originals.example.test/a',
      'https://originals.example.test/b',
    ]);
  });
  it('maps local choices to real Vinted identifiers only when saving', () => {
    const { current, stored, fields } = fixture();
    const content = applyStoredVintedListingEdit(stored, current, {
      ...fields,
      title: 'Neu',
      color: 'Blau · Rot',
    });
    expect(content).toMatchObject({
      title: 'Neu',
      colorIds: [1, 3],
      colorLabels: ['Blau', 'Rot'],
      sizeId: 607,
    });
  });
  it('preserves provider changes to untouched fields', () => {
    const { current, stored, fields } = fixture();
    const content = applyStoredVintedListingEdit(
      stored,
      {
        ...current,
        content: {
          ...current.content,
          description: 'Zwischenzeitlich aktualisiert',
          priceCents: 3000,
        },
      },
      { ...fields, title: 'Neu' },
    );
    expect(content).toMatchObject({
      title: 'Neu',
      description: 'Zwischenzeitlich aktualisiert',
      priceCents: 3000,
    });
  });
  it('rejects a concurrent change to an edited field', () => {
    const { current, stored, fields } = fixture();
    expect(() =>
      applyStoredVintedListingEdit(
        stored,
        { ...current, content: { ...current.content, title: 'Bei Vinted geändert' } },
        { ...fields, title: 'Neu' },
      ),
    ).toThrow('inzwischen');
  });
  it('rejects an unavailable selection instead of clearing it', () => {
    const { current, stored, fields } = fixture();
    expect(() =>
      applyStoredVintedListingEdit(stored, current, { ...fields, color: 'Khaki' }),
    ).toThrow();
  });
  it('maps a local size to a combined provider label and rejects ambiguous matches', () => {
    const { current, stored, fields } = fixture();
    const size = stored.schema.fields
      .find((field) => field.field === 'size')
      ?.choices.find((choice) => choice.label === '39');
    if (!size) throw new Error('Expected local size');
    const fresh = {
      ...current,
      schema: {
        ...current.schema,
        fields: current.schema.fields.map((field) =>
          field.field === 'size'
            ? {
                ...field,
                choices: [
                  ...field.choices,
                  { id: 999, label: '39 / 6', selected: false, disabled: false, sizeGroupId: 31 },
                ],
              }
            : field,
        ),
      },
    };
    expect(
      applyStoredVintedListingEdit(stored, fresh, { ...fields, size: String(size.id) }),
    ).toMatchObject({ sizeId: 999, sizeLabel: '39 / 6' });
    const ambiguous = {
      ...fresh,
      schema: {
        ...fresh.schema,
        fields: fresh.schema.fields.map((field) =>
          field.field === 'size'
            ? {
                ...field,
                choices: [
                  ...field.choices,
                  { id: 1000, label: '39 / 7', selected: false, disabled: false, sizeGroupId: 31 },
                ],
              }
            : field,
        ),
      },
    };
    expect(() =>
      applyStoredVintedListingEdit(stored, ambiguous, { ...fields, size: String(size.id) }),
    ).toThrow();
  });
  it('übernimmt eine gesuchte Marke, die Vinted im Formular nicht vorschlägt', () => {
    const { current, stored, fields } = fixture();
    const searched = withVintedListingBrand(stored, { brandId: 4242, brandLabel: 'Levi’s' });
    expect(
      searched.schema.fields
        .find((field) => field.field === 'brand')
        ?.choices.map((choice) => choice.label),
    ).toContain('Levi’s');
    const content = applyStoredVintedListingEdit(searched, current, { ...fields, brand: '4242' });
    expect(content).toMatchObject({ brandId: 4242, brandLabel: 'Levi’s', sizeId: 607 });
  });
  it('lehnt eine Marke ab, die nicht über die Suche gewählt wurde', () => {
    const { current, stored, fields } = fixture();
    expect(() =>
      applyStoredVintedListingEdit(stored, current, { ...fields, brand: '4242' }),
    ).toThrow();
  });
});

describe('Kombinierte Größen älterer Inserate', () => {
  // Wie bei einer Silver-Jeans am 08.11.2026: gespeichert nur „M / 38 / 10“ ohne Kennung,
  // das Vinted-Formular zeigt die Größe als „M“ einer Größengruppe.
  const choice = (id: number, label: string, selected: boolean) => ({
    id,
    label,
    selected,
    disabled: false,
    sizeGroupId: 4,
  });
  function combined() {
    const live = listingCurrentContentFixture();
    const account = createMarketplaceFixtures().connections[0];
    const sizes = [choice(207, 'M', false), choice(208, 'L', false), choice(1640, 'M', false)];
    const catalog = {
      ...live.schema,
      fields: [
        { field: 'size' as const, sizeGroupId: 4, choices: sizes },
        ...live.schema.fields.filter((field) => field.field !== 'size'),
      ],
    };
    const savedContent = { ...live.content, sizeId: null, sizeLabel: '' };
    const entry = parseMarketplacePage(
      {
        items: [
          {
            ...account,
            id: 'a',
            title: live.content.title,
            text: live.content.description,
            size: 'M / 38 / 10',
            price: 20.5,
            listingContent: savedContent,
          },
        ],
        total: 1,
        nextCursor: null,
      },
      account,
    ).items[0];
    const stored = storedVintedListingEdit(entry, live.content.description, catalog)!;
    const fresh = {
      ...live,
      content: { ...live.content, sizeId: 207, sizeLabel: 'M' },
      schema: {
        ...live.schema,
        fields: live.schema.fields.map((field) =>
          field.field === 'size'
            ? { ...field, choices: sizes.map((size) => ({ ...size, selected: size.id === 207 })) }
            : field,
        ),
      },
    };
    const selection = vintedListingEditSelection(stored);
    const fields = {
      ...selection,
      color: 'Blau · Gelb',
      material: 'Acryl',
      title: live.content.title,
      description: live.content.description,
      price: '20,50',
    };
    return { stored, fresh, fields };
  }

  it('meldet keinen Konflikt, wenn Vinted dieselbe Größe ohne Zusatzangaben führt', () => {
    const { stored, fresh, fields } = combined();
    expect(vintedListingEditSelection(stored).size).not.toBe('207');
    expect(applyStoredVintedListingEdit(stored, fresh, { ...fields, size: '207' })).toMatchObject({
      sizeId: 207,
      sizeLabel: 'M',
    });
    expect(applyStoredVintedListingEdit(stored, fresh, { ...fields, size: '208' })).toMatchObject({
      sizeId: 208,
      sizeLabel: 'L',
    });
  });

  it('erkennt weiterhin eine echte Größenänderung bei Vinted', () => {
    const { stored, fresh, fields } = combined();
    const changed = {
      ...fresh,
      schema: {
        ...fresh.schema,
        fields: fresh.schema.fields.map((field) =>
          field.field === 'size'
            ? {
                ...field,
                choices: field.choices.map((size) => ({ ...size, selected: size.id === 208 })),
              }
            : field,
        ),
      },
    };
    expect(() => applyStoredVintedListingEdit(stored, changed, { ...fields, size: '207' })).toThrow(
      'inzwischen bei Vinted geändert',
    );
  });
});
