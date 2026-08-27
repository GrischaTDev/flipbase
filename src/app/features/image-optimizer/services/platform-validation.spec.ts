import { describe, expect, it } from 'vitest';
import { platformById } from '../models/platform-profile';
import * as validierung from './platform-validation';
import { checkOutput } from './platform-validation';

describe('Plattform-Ausgabepruefung', () => {
  it('erkennt ein zu kleines eBay-Vollbild', () => {
    expect(checkOutput(null, { width: 499, height: 499 }, platformById('ebay'))).toEqual({
      width: 499,
      height: 499,
      isValid: false,
    });
  });

  it('prueft den tatsaechlichen Zuschnitt statt der groesseren Originaldatei', () => {
    expect(
      checkOutput(
        { x: 500, y: 500, width: 480, height: 480 },
        { width: 2400, height: 1800 },
        platformById('ebay'),
      ),
    ).toEqual({ width: 480, height: 480, isValid: false });
  });

  it('laesst die eBay-Grenze und Plattformen ohne Mindestgroesse zu', () => {
    expect(checkOutput(null, { width: 500, height: 500 }, platformById('ebay'))?.isValid).toBe(
      true,
    );
    expect(
      checkOutput(null, { width: 120, height: 90 }, platformById('kleinanzeigen'))?.isValid,
    ).toBe(true);
  });

  it('blockiert nicht solange die Bildgroesse noch unbekannt ist', () => {
    expect(checkOutput(null, null, platformById('ebay'))).toBeNull();
  });

  it('liefert das erste zu kleine Bild als Exporthindernis', () => {
    const findResolutionIssue = (
      validierung as unknown as {
        findResolutionIssue: (
          bilder: readonly {
            name: string;
            naturGroesse: { width: number; height: number } | null;
            ausschnitte: Record<string, never>;
          }[],
          profile: readonly ReturnType<typeof platformById>[],
        ) => { imageName: string; platformName: string; width: number; height: number } | null;
      }
    ).findResolutionIssue;

    expect(
      findResolutionIssue(
        [
          { name: 'gross.jpg', naturGroesse: { width: 1200, height: 1200 }, ausschnitte: {} },
          { name: 'klein.jpg', naturGroesse: { width: 420, height: 420 }, ausschnitte: {} },
        ],
        [platformById('ebay')],
      ),
    ).toEqual({ imageName: 'klein.jpg', platformName: 'eBay', width: 420, height: 420 });
  });
});
