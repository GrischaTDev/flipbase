import { parseVintedListingPhotoOptions } from './vinted-listing-photo-options';
import { describe, expect, it } from 'vitest';
import { vintedListingPhotoDimensions } from './vinted-listing-source';

describe('Bildauflösungen beim Relisten', () => {
  it('erhält den vollständigen Hoch- und Querformatausschnitt beim Verkleinern und Vergrößern', () => {
    expect(vintedListingPhotoDimensions(900, 1200, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(vintedListingPhotoDimensions(2400, 1600, 1200)).toEqual({ width: 1200, height: 800 });
    expect(vintedListingPhotoDimensions(900, 675, null)).toEqual({ width: 900, height: 675 });
  });
  it('weist leere Bilder und nicht angebotene Auflösungen ab', () => {
    expect(() => vintedListingPhotoDimensions(0, 100, 1600)).toThrow();
    expect(() => vintedListingPhotoDimensions(900, 675, 99999)).toThrow();
  });
});

it('bindet den Ausgabeausschnitt an ein vorhandenes Original und bewahrt normalisierte Koordinaten', () => {
  const crop = { x: 0.25, y: 0, width: 0.5, height: 1, rotation: 90 };
  expect(parseVintedListingPhotoOptions({ resize: 1600, crops: { '7': crop } }, ['7'])).toEqual({
    resize: 1600,
    crops: { '7': crop },
  });
  for (const options of [
    { resize: 42, crops: {} },
    { resize: null, crops: { '8': crop } },
    { resize: null, crops: { '7': { ...crop, width: 2 } } },
  ])
    expect(() => parseVintedListingPhotoOptions(options, ['7'])).toThrow();
});
