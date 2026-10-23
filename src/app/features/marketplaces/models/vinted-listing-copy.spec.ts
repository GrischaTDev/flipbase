import { describe, expect, it } from 'vitest';
import { emptyVintedListingContent } from './vinted-listing-content';
import { copyVintedListingFields } from './vinted-listing-copy';

describe('Daten in einen bestehenden Entwurf übernehmen', () => {
  const target = {
    ...emptyVintedListingContent(),
    title: 'Mein Entwurf',
    categoryId: 1,
    categoryLabel: 'Schuhe',
    sizeId: 3,
    sizeLabel: '34',
    attributes: { model: 'Alt' },
  };
  const source = {
    ...emptyVintedListingContent(),
    title: 'Quelle',
    description: 'Beschreibung',
    priceCents: 1800,
    categoryId: 2,
    categoryLabel: 'Shirts',
    sizeId: 9,
    sizeLabel: 'M',
  };
  it('übernimmt nur die ausdrücklich gewählten Angaben ohne Quellenänderung', () => {
    const result = copyVintedListingFields(target, source, ['description', 'price']);
    expect(result).toMatchObject({
      title: 'Mein Entwurf',
      description: 'Beschreibung',
      priceCents: 1800,
      sizeId: 3,
    });
    expect(target.description).toBe('');
    expect(source.title).toBe('Quelle');
  });
  it('weist Merkmale einer anderen Kategorie ohne Kategorieübernahme zurück', () => {
    expect(() => copyVintedListingFields(target, source, ['size'])).toThrow(/Kategorie/);
  });
  it('setzt bei einer neuen Kategorie alte Merkmale zurück und übernimmt gewählte Paare gemeinsam', () => {
    expect(copyVintedListingFields(target, source, ['category', 'size'])).toMatchObject({
      categoryId: 2,
      categoryLabel: 'Shirts',
      sizeId: 9,
      sizeLabel: 'M',
      attributes: {},
    });
    expect(copyVintedListingFields(target, source, ['category']).sizeId).toBeNull();
  });
  it('erhält unveränderte Kategorieangaben und kopiert Listen ohne gemeinsame Referenz', () => {
    const result = copyVintedListingFields(
      target,
      { ...source, categoryId: 1, colorIds: [5], colorLabels: ['Blau'] },
      ['colors'],
    );
    expect(result.attributes).toEqual(target.attributes);
    expect(result.colorIds).toEqual([5]);
  });
});
