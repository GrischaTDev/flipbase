import { describe, expect, it } from 'vitest';
import {
  isNeutralVintedListingPhotoOptions,
  parseVintedListingPhotoOptions,
  remapVintedListingPhotoOptions,
} from './vinted-listing-photo-options';

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
  it('validiert, erkennt und überträgt backgroundCalm-Masken pro Foto', () => {
    const maskId = '11111111-1111-4111-8111-111111111111';
    const options = {
      resize: null,
      crops: {},
      backgroundCalm: { src1: { maskId, strength: 70 } },
    };
    expect(parseVintedListingPhotoOptions(options, ['src1'])).toEqual(options);
    expect(isNeutralVintedListingPhotoOptions(options, 'src1')).toBe(false);
    expect(isNeutralVintedListingPhotoOptions(options, 'src2')).toBe(true);
    expect(remapVintedListingPhotoOptions(options, ['src1', 'src2'], ['10', '20'])).toEqual({
      resize: null,
      crops: {},
      backgroundCalm: { '10': { maskId, strength: 70 } },
    });
    expect(() =>
      parseVintedListingPhotoOptions(
        {
          resize: null,
          crops: {},
          backgroundCalm: { src1: { maskId: 'ungueltig', strength: 70 } },
        },
        ['src1'],
      ),
    ).toThrow();
    expect(() =>
      parseVintedListingPhotoOptions(
        { resize: null, crops: {}, backgroundCalm: { src1: { maskId, strength: 101 } } },
        ['src1'],
      ),
    ).toThrow();
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
