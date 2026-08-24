import { describe, expect, it } from 'vitest';
import { profil } from '../models/plattform-profile';
import { planeAusgabe } from './bild-renderer';

describe('Bildausgabe planen', () => {
  it('vergrößert einen kleinen quadratischen Ausschnitt nicht', () => {
    expect(planeAusgabe({ x: 20, y: 30, breite: 800, hoehe: 800 }, profil('ebay'))).toEqual({
      quelle: { x: 20, y: 30, breite: 800, hoehe: 800 },
      breite: 800,
      hoehe: 800,
    });
  });

  it('verkleinert einen großen Ausschnitt auf die Plattformgrenze', () => {
    expect(
      planeAusgabe({ x: 100, y: 200, breite: 2400, hoehe: 1800 }, profil('kleinanzeigen')),
    ).toEqual({
      quelle: { x: 100, y: 200, breite: 2400, hoehe: 1800 },
      breite: 1600,
      hoehe: 1200,
    });
  });

  it('leitet zuerst das Plattformformat aus einem abweichenden Rechteck ab', () => {
    expect(planeAusgabe({ x: 0, y: 0, breite: 1200, hoehe: 800 }, profil('vinted'))).toEqual({
      quelle: { x: 333.33333333333337, y: 0, breite: 533.3333333333333, hoehe: 800 },
      breite: 533,
      hoehe: 800,
    });
  });
});
