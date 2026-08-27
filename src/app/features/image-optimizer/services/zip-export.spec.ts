import { describe, it, expect } from 'vitest';
import { folderName } from './zip-export.service';
import { PLATFORM_PROFILES, platformById } from '../models/platform-profile';

/**
 * Der Ordnername landet im Dateisystem des Nutzers. Er soll ohne Nachdenken
 * erkennbar sein - beim Einstellen wird genau dieser Ordner geoeffnet.
 */
describe('Ordnernamen im ZIP', () => {
  it('benutzt den Anzeigenamen der Plattform', () => {
    expect(folderName(platformById('ebay'))).toBe('eBay');
    expect(folderName(platformById('kleinanzeigen'))).toBe('Kleinanzeigen');
    expect(folderName(platformById('vinted'))).toBe('Vinted');
  });

  it('erzeugt fuer jede Plattform einen eigenen Namen', () => {
    const namen = PLATFORM_PROFILES.map(folderName);
    expect(new Set(namen).size).toBe(namen.length);
  });
});
