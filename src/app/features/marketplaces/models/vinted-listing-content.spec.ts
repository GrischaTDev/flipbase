import { describe, expect, it } from 'vitest';
import {
  emptyVintedListingContent,
  parseVintedListingContent,
  parseVintedListingPrice,
  applyVintedListingTemplate,
  missingVintedListingVariables,
} from './vinted-listing-content';

describe('Vinted-Inseratentwürfe', () => {
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
