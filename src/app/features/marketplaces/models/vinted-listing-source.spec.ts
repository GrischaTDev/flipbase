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
