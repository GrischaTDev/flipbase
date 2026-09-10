import { describe, expect, it } from 'vitest';
import { buildGermanCountryOptions } from './country-options';

describe('buildGermanCountryOptions', () => {
  it('liefert deutsche Ländernamen alphabetisch und eindeutige ISO-Codes', () => {
    const options = buildGermanCountryOptions();

    expect(options.find((entry) => entry.code === 'DE')).toMatchObject({
      name: 'Deutschland',
      dialCode: '+49',
    });
    expect(new Set(options.map((entry) => entry.code)).size).toBe(options.length);
    expect(options.map((entry) => entry.name)).toEqual(
      [...options.map((entry) => entry.name)].sort(new Intl.Collator('de').compare),
    );
  });

  it('enthält eine vollständige übliche Länderauswahl mit Vorwahlen', () => {
    const options = buildGermanCountryOptions();

    expect(options.length).toBeGreaterThanOrEqual(240);
    expect(options.every((entry) => /^\+[0-9]+$/.test(entry.dialCode))).toBe(true);
  });
});
