import { expect, it } from 'vitest';
import { listingCurrentContentFixture } from '../../../../../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import {
  applyVintedListingEdit,
  vintedListingEditOptions,
  vintedListingEditSelection,
  vintedListingPriceCents,
  vintedListingPriceText,
} from './vinted-listing-edit-form';

const current = listingCurrentContentFixture();
const text = { title: ' Neue Schuhe ', description: 'Kaum getragen.', price: '18' };

it('zeigt die aktuelle Vinted-Auswahl und lässt gesperrte Werte weg', () => {
  expect(vintedListingEditSelection(current)).toEqual({
    brand: '254956',
    size: '607',
    condition: '2',
    package: '2',
    color: ['1', '2'],
    material: ['149'],
  });
  expect(vintedListingEditOptions(current.schema, 'brand')).toEqual([
    { value: '254956', label: 'Jako' },
  ]);
  expect(vintedListingEditOptions(current.schema, 'color').map((option) => option.label)).toEqual([
    'Blau',
    'Gelb',
    'Rot',
  ]);
});

it('übernimmt Kennung und Namen gemeinsam aus der Auswahl und lässt Kategorie und Zusatzfelder unberührt', () => {
  const selection = { ...vintedListingEditSelection(current), color: ['3', '1'], brand: '' };
  expect(applyVintedListingEdit(current, text, selection)).toEqual({
    ...current.content,
    title: 'Neue Schuhe',
    description: 'Kaum getragen.',
    priceCents: 1800,
    brandId: null,
    brandLabel: '',
    colorIds: [1, 3],
    colorLabels: ['Blau', 'Rot'],
  });
});

it('weist gesperrte, unbekannte und zu viele Werte sowie ungültige Texte ab', () => {
  const selection = vintedListingEditSelection(current);
  for (const changed of [
    { ...selection, brand: '1' },
    { ...selection, size: '999' },
    { ...selection, color: ['1', '2', '3'] },
    { ...selection, color: ['1', '1'] },
  ])
    expect(() => applyVintedListingEdit(current, text, changed)).toThrow('nicht mehr gültig');
  for (const changed of [
    { ...text, price: '0' },
    { ...text, price: '12,345' },
    { ...text, title: ' ' },
    { ...text, description: '' },
  ])
    expect(() => applyVintedListingEdit(current, changed, selection)).toThrow('Prüfe');
});

it('rechnet Preise ohne Rundungsfehler um', () => {
  expect(vintedListingPriceCents('24,5')).toBe(2450);
  expect(vintedListingPriceCents('19.99')).toBe(1999);
  expect(vintedListingPriceCents('abc')).toBeNull();
  expect(vintedListingPriceText(2050)).toBe('20,50');
  expect(vintedListingPriceText(1800)).toBe('18,00');
});
