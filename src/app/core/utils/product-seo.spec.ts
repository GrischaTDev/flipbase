import { describe, expect, it } from 'vitest';
import {
  normalizeProductHandle,
  productSeoDescription,
  productSeoTitle,
  productStorePath,
} from './product-seo';

describe('Produktadressen und Suchmaschineneintrag', () => {
  it('bildet lesbare, begrenzte URL-Teile ohne fremde Pfade oder Sonderzeichen', () => {
    expect(normalizeProductHandle('  Große Märklin-Lok / Édition 2  ')).toBe(
      'grosse-maerklin-lok-edition-2',
    );
    expect(normalizeProductHandle('../?foo=<script>')).toBe('foo-script');
    expect(normalizeProductHandle('a'.repeat(200))).toHaveLength(120);
    expect(normalizeProductHandle('---')).toBe('');
  });

  it('behält die stabile Artikel-ID und unterstützt alte Links ohne Bezeichnung', () => {
    expect(productStorePath('item-1')).toBe('/shop/item/item-1');
    expect(productStorePath('item-1', 'meine-kamera')).toBe('/shop/item/item-1/meine-kamera');
    expect(productStorePath('item/1', 'Kamera')).toBe('/shop/item/item%2F1/kamera');
  });

  it('verwendet sinnvolle Standardwerte und begrenzt die Vorschau', () => {
    expect(productSeoTitle(' Kamera ', ' ')).toBe('Kamera');
    expect(productSeoTitle('Kamera', ' Eigener Titel ')).toBe('Eigener Titel');
    expect(productSeoDescription('Gute\n Kamera', '')).toBe('Gute Kamera');
    expect(productSeoDescription(null, 'Andere Beschreibung')).toBe('Andere Beschreibung');
    expect(productSeoDescription('a'.repeat(400))).toHaveLength(320);
  });
});
