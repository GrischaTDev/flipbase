import { describe, expect, it } from 'vitest';
import { discoveryDate } from './discovery-date';

describe('Funddatum nach Kalendertagen', () => {
  it('nennt heute mit Uhrzeit', () =>
    expect(
      discoveryDate(new Date(2026, 9, 6, 14, 32).toISOString(), new Date(2026, 9, 6, 20)),
    ).toBe('Heute · 14:32'));
  it('nennt den vorherigen Kalendertag auch kurz nach Mitternacht gestern', () =>
    expect(
      discoveryDate(new Date(2026, 9, 5, 23, 55).toISOString(), new Date(2026, 9, 6, 0, 5)),
    ).toBe('Gestern · 23:55'));
  it('verwendet danach das normale Datum', () =>
    expect(
      discoveryDate(new Date(2026, 9, 4, 9, 17).toISOString(), new Date(2026, 9, 6, 0, 5)),
    ).toBe('04.10. · 09:17'));
  it('behält gestern am Jahreswechsel', () =>
    expect(discoveryDate(new Date(2025, 11, 31, 9, 17).toISOString(), new Date(2026, 0, 1))).toBe(
      'Gestern · 09:17',
    ));
  it('zeigt für ältere Favoriten das abweichende Jahr', () =>
    expect(discoveryDate(new Date(2025, 8, 4, 9, 17).toISOString(), new Date(2026, 9, 6))).toBe(
      '04.09.2025 · 09:17',
    ));
  it('behandelt ungültige Zeiten ohne falsches heute', () =>
    expect(discoveryDate('kaputt', new Date())).toBe('Datum unbekannt'));
});
