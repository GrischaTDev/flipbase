import countryData from 'intl-tel-input/data';
import type { CountryOption } from '../models/country-option';

const germanRegionNames = new Intl.DisplayNames(['de'], { type: 'region' });
const germanCollator = new Intl.Collator('de');

export function buildGermanCountryOptions(): readonly CountryOption[] {
  return countryData
    .map((country) => {
      const code = country.iso2.toUpperCase();

      return {
        code,
        name: germanRegionNames.of(code) ?? code,
        dialCode: `+${country.dialCode}`,
      } satisfies CountryOption;
    })
    .sort((first, second) => germanCollator.compare(first.name, second.name));
}
