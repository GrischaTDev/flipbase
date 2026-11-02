import { describe, expect, it } from 'vitest';
import { parseVintedListingPhotoOptions } from './vinted-listing-photo-options';

describe('Vinted-Bildausgabeparameter', () => {
  it('erhält alte Aufträge ohne Filter und Rahmen unverändert', () => {
    const legacy = { resize: 1600, crops: {} };
    expect(parseVintedListingPhotoOptions(legacy, ['1'])).toEqual(legacy);
    expect(parseVintedListingPhotoOptions(undefined, [])).toEqual({ resize: null, crops: {} });
  });
  it('ordnet Rahmen und Filter denselben Originalen und Ausschnitten zu', () => {
    const options = {
      resize: 1200,
      filter: 'lighter',
      border: 'medium',
      crops: { '1': { x: 0.2, y: 0, width: 0.8, height: 1, rotation: 0 } },
    };
    expect(parseVintedListingPhotoOptions(options, ['1'])).toEqual(options);
    expect(() => parseVintedListingPhotoOptions(options, ['2'])).toThrow();
  });
  it.each([
    { filter: 'unknown' },
    { filter: null },
    { border: 2 },
    { border: 'huge' },
    { extra: 'yes' },
    { resize: undefined },
  ])('weist ungültige Ausgabeoptionen zurück: %j', (invalid) => {
    expect(() =>
      parseVintedListingPhotoOptions({ resize: null, crops: {}, ...invalid }, []),
    ).toThrow();
  });
});
