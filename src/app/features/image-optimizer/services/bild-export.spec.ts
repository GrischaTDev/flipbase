import { describe, it, expect } from 'vitest';
import { dateiName } from './bild-export.service';
import { profil } from '../models/plattform-profile';

/**
 * Das erste Bild ist bei eBay das Bild im Suchergebnis und bei Vinted das im
 * Raster. Es muss beim Hochladen zuerst kommen - deshalb sortiert der Name.
 */
describe('Dateinamen fuer den Export', () => {
  it('nennt das erste Bild als Hauptbild', () => {
    expect(dateiName(0, profil('ebay'))).toBe('01-main.jpg');
  });

  it('zaehlt die uebrigen zweistellig durch, damit sie sortieren', () => {
    expect(dateiName(1, profil('ebay'))).toBe('02.jpg');
    expect(dateiName(9, profil('ebay'))).toBe('10.jpg');
  });

  it('bleibt auch jenseits von zehn sortierbar', () => {
    expect(dateiName(23, profil('vinted'))).toBe('24.jpg');
  });
});
