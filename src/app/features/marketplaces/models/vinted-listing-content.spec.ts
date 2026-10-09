import { describe, expect, it } from 'vitest';
import {
  emptyVintedListingContent,
  parseVintedListingContent,
  parseVintedListingPrice,
  applyVintedListingTemplate,
  missingVintedListingVariables,
} from './vinted-listing-content';

describe('Vinted-Inseratentwürfe', () => {
  it('verwirft alte Kategoriekennungen beim Kategorienwechsel durch eine Vorlage', () => {
    const content = {
      ...emptyVintedListingContent(),
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
      attributes: { width: '42' },
    };
    const result = applyVintedListingTemplate(content, {
      categoryId: 2738,
      categoryLabel: 'Fußballschuhe',
    });
    expect(result.content).toMatchObject({
      categoryId: 2738,
      brandId: null,
      sizeId: null,
      conditionId: null,
      colorIds: [],
      materialIds: [],
      packageSizeId: null,
      attributes: {},
    });
    expect(result.content.sizeLabel).toBe('M');
    expect(result.changedFields).toContain('sizeId');
    expect(content.sizeId).toBe(208);
  });

  it('behält ausdrücklich mitgelieferte Kategorieangaben einer Vorlage', () => {
    const content = { ...emptyVintedListingContent(), categoryId: 1223, sizeId: 208 };
    expect(
      applyVintedListingTemplate(content, {
        categoryId: 2738,
        sizeId: 607,
        sizeLabel: '38',
        attributes: { width: '20' },
      }).content,
    ).toMatchObject({ categoryId: 2738, sizeId: 607, attributes: { width: '20' } });
  });
  it('bezeichnet geänderte Vorlagenangaben nicht mit alten Anbieterkennungen', () => {
    const content = {
      ...emptyVintedListingContent(),
      brandId: 53,
      brandLabel: 'Nike',
      sizeId: 208,
      sizeLabel: 'M',
      colorIds: [1],
      colorLabels: ['Schwarz'],
    };
    expect(
      applyVintedListingTemplate(content, {
        brandLabel: 'adidas',
        sizeLabel: '38',
        colorLabels: ['Grau'],
      }).content,
    ).toMatchObject({ brandId: null, sizeId: null, colorIds: [] });
    expect(applyVintedListingTemplate(content, { brandId: 14 }).content.brandLabel).toBe('');
    expect(
      applyVintedListingTemplate(content, { brandId: 14, brandLabel: 'adidas' }).content,
    ).toMatchObject({ brandId: 14, brandLabel: 'adidas' });
  });
  it('speichert einen unvollständigen Entwurf ohne Verkaufspreis', () => {
    expect(parseVintedListingContent({ title: 'Meine Jacke' })).toMatchObject({
      title: 'Meine Jacke',
      description: '',
      priceCents: null,
      categoryId: null,
    });
    expect(emptyVintedListingContent().priceCents).toBeNull();
  });

  it('lehnt untypisierte oder fremde Providerwerte ab', () => {
    expect(() => parseVintedListingContent({ title: 12 })).toThrow();
    expect(() => parseVintedListingContent({ priceCents: -1 })).toThrow();
    expect(() => parseVintedListingContent({ priceCents: 123.5 })).toThrow();
    expect(() => parseVintedListingContent({ categoryId: 'jackets' })).toThrow();
    expect(() => parseVintedListingContent({ colorIds: [1, 1] })).toThrow();
    expect(() => parseVintedListingContent({ unknownField: true })).toThrow();
  });

  it.each([
    ['', null],
    ['12,34', 1234],
    ['12.34', 1234],
    ['0,01', 1],
    ['12', 1200],
  ])('übernimmt den eingegebenen Verkaufspreis %s ohne Rundungsfehler', (value, expected) => {
    expect(parseVintedListingPrice(value)).toBe(expected);
  });

  it.each(['-1', '1e3', '1.234', 'NaN', '1,2,3'])('lehnt den ungültigen Preis %s ab', (value) => {
    expect(() => parseVintedListingPrice(value)).toThrow();
  });

  it('wendet ausschließlich ausgewählte Vorlagenfelder an und zeigt deren Änderungen', () => {
    const content = {
      ...emptyVintedListingContent(),
      title: 'Bisher',
      priceCents: 4200,
      brandLabel: 'Levi’s',
      sizeLabel: 'M',
    };
    const result = applyVintedListingTemplate(content, {
      title: '{brand} Jacke {size}',
      description: 'Gut erhalten',
    });
    expect(result.content.title).toBe('Levi’s Jacke M');
    expect(result.content.priceCents).toBe(4200);
    expect(result.changedFields).toEqual(['title', 'description']);
    expect(content.title).toBe('Bisher');
  });

  it('veröffentlicht keine unaufgelösten Platzhalter und löscht keine Wörter stillschweigend', () => {
    const content = {
      ...emptyVintedListingContent(),
      title: 'Jacke {size}',
      description: '{unknown} {brand}',
      brandLabel: 'JAKO',
    };
    expect(missingVintedListingVariables(content)).toEqual(['size', 'unknown']);
    expect(content.title).toBe('Jacke {size}');
  });

  it('übernimmt unbekannte kategorienspezifische Angaben nicht als Objekte', () => {
    expect(() =>
      parseVintedListingContent({ attributes: { width: { malicious: true } } }),
    ).toThrow();
    expect(parseVintedListingContent({ attributes: { width: '42' } }).attributes).toEqual({
      width: '42',
    });
  });
  it('lässt Platzhalter in nicht ausgewählten Feldern unverändert', () => {
    const content = {
      ...emptyVintedListingContent(),
      title: '{brand} Original',
      description: 'Größe {size}',
      brandLabel: 'Testmarke',
      sizeLabel: 'M',
    };
    const result = applyVintedListingTemplate(content, { priceCents: 1200 });
    expect(result.content.title).toBe(content.title);
    expect(result.content.description).toBe(content.description);
    expect(result.changedFields).toEqual(['priceCents']);
  });
});
