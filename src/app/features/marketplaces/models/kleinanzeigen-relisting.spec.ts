import { describe, expect, it } from 'vitest';
import {
  kleinanzeigenRelistingPaths,
  parseKleinanzeigenRelistingResult,
} from './kleinanzeigen-relisting';
import { validateKleinanzeigenHandoff } from './kleinanzeigen-listing-handoff';

describe('Kleinanzeigen-Formularweg und neue Anzeigenkennung', () => {
  const content = {
    title: 'Jacke',
    description: 'Original',
    priceCents: 1200,
    currency: 'EUR' as const,
    priceType: 'NEGOTIABLE' as const,
    shippingType: 'both' as const,
    shippingPriceCents: null,
    postalCode: null,
    categoryId: null,
    categoryFields: {},
    schemaRevision: null,
  };
  it('erlaubt die Formularübergabe ohne Kategorie, Eigenschaften und Postleitzahl', () => {
    expect(validateKleinanzeigenHandoff(content, 1)).toEqual([]);
  });
  it('weist Centbeträge vor der Erweiterungsübergabe zurück statt sie still zu runden', () => {
    expect(validateKleinanzeigenHandoff({ ...content, priceCents: 1234 }, 1)[0].field).toBe(
      'priceCents',
    );
  });
  it('verwendet dieselben vollständigen Kategoriepfade wie der lokale Picker', () => {
    expect(kleinanzeigenRelistingPaths['Mode & Beauty > Herrenbekleidung > Hemden']).toBe(
      '153/160/hemden',
    );
    expect(kleinanzeigenRelistingPaths['Immobilien > Häuser zum Kauf']).toBe('195/208');
  });
  const result = {
    externalId: '11',
    newExternalId: '99',
    outcome: 'confirmed',
    url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/99-1-2',
  };
  it('bestätigt nur eine neue passende Zielkennung', () => {
    expect(parseKleinanzeigenRelistingResult(result, '11')).toEqual(result);
  });
  it.each([
    { ...result, newExternalId: '11' },
    { ...result, externalId: '12' },
    { ...result, url: 'https://evil.test/s-anzeige/jacke/99-1-2' },
    { ...result, url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/98-1-2' },
    { ...result, url: result.url + '?unrelated=1' },
  ])('meldet fremde oder widersprüchliche Ergebnisse nicht als Erfolg', (value) => {
    expect(parseKleinanzeigenRelistingResult(value, '11')).toBeNull();
  });
});
