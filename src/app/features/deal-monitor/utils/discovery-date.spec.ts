import { describe, expect, it } from 'vitest';
import { discoveryAge, discoveryDate } from './discovery-date';

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

describe('Alter seit Erstfund', () => {
  const discoveredAt = '2026-11-22T08:25:00Z';

  it.each([
    [-2_000, 'vor 0 s'],
    [59_999, 'vor 59 s'],
    [60_000, 'vor 1 min'],
    [3_600_000, 'vor 1 Std.'],
    [86_400_000, 'vor 1 Tag'],
    [172_800_000, 'vor 2 Tagen'],
  ])('zeigt nach %d Millisekunden %s', (elapsedMs, label) => {
    expect(discoveryAge(discoveredAt, new Date(Date.parse(discoveredAt) + elapsedMs))).toBe(label);
  });

  it('zeigt eine fehlende Fundzeit als unbekannt', () => {
    expect(discoveryAge('', new Date(discoveredAt))).toBe('Datum unbekannt');
  });
});
