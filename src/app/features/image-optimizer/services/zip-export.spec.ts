import { describe, it, expect } from 'vitest';
import { ordnerName } from './zip-export.service';
import { PLATTFORM_PROFILE, profil } from '../models/plattform-profile';

/**
 * Der Ordnername landet im Dateisystem des Nutzers. Er soll ohne Nachdenken
 * erkennbar sein - beim Einstellen wird genau dieser Ordner geoeffnet.
 */
describe('Ordnernamen im ZIP', () => {
  it('benutzt den Anzeigenamen der Plattform', () => {
    expect(ordnerName(profil('ebay'))).toBe('eBay');
    expect(ordnerName(profil('kleinanzeigen'))).toBe('Kleinanzeigen');
    expect(ordnerName(profil('vinted'))).toBe('Vinted');
  });

  it('erzeugt fuer jede Plattform einen eigenen Namen', () => {
    const namen = PLATTFORM_PROFILE.map(ordnerName);
    expect(new Set(namen).size).toBe(namen.length);
  });
});
