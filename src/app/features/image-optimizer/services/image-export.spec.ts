import { describe, it, expect } from 'vitest';
import { fileName } from './image-export.service';
import { platformById } from '../models/platform-profile';

/**
 * Das erste Bild ist bei eBay das Bild im Suchergebnis und bei Vinted das im
 * Raster. Es muss beim Hochladen zuerst kommen - deshalb sortiert der Name.
 */
describe('Dateinamen fuer den Export', () => {
  it('nennt das erste Bild als Hauptbild', () => {
    expect(fileName(0, platformById('ebay'))).toBe('01-main.jpg');
  });

  it('zaehlt die uebrigen zweistellig durch, damit sie sortieren', () => {
    expect(fileName(1, platformById('ebay'))).toBe('02.jpg');
    expect(fileName(9, platformById('ebay'))).toBe('10.jpg');
  });

  it('bleibt auch jenseits von zehn sortierbar', () => {
    expect(fileName(23, platformById('vinted'))).toBe('24.jpg');
  });
});
