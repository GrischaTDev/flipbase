import { describe, expect, it } from 'vitest';
import { vintedListingAge } from './vinted-listing-age';

const publishedAt = '2026-10-01T10:30:00Z';
const hour = 3_600_000;
const start = Date.parse(publishedAt);

describe('Alter eines Vinted-Inserats', () => {
  it.each([
    [0, 'success'],
    [71.999, 'success'],
    [72, 'caution'],
    [119.999, 'caution'],
    [120, 'critical'],
    [167.999, 'critical'],
    [168, 'critical'],
    [240, 'critical'],
  ] as const)('zeigt nach %s Stunden die passende Stufe', (hours, tone) => {
    const age = vintedListingAge(publishedAt, start + hours * hour);
    expect(age.tone).toBe(tone);
    expect(age.overdue).toBe(hours >= 168);
  });
  it('zeigt volle Tage und Stunden ohne Minuten', () => {
    expect(vintedListingAge(publishedAt, start + 36.9 * hour)).toMatchObject({
      compact: '1 T 12 Std.',
      text: '1 Tag und 12 Stunden online',
    });
    expect(vintedListingAge(publishedAt, start + hour)).toMatchObject({ text: '1 Stunde online' });
    expect(vintedListingAge(publishedAt, start + 48 * hour)).toMatchObject({
      text: '2 Tage online',
    });
    expect(vintedListingAge(publishedAt, start + 0.9 * hour)).toMatchObject({
      text: 'Unter 1 Stunde online',
    });
  });
  it.each([null, undefined, '', 'kein Datum', '2026-02-30T10:00:00Z', '2026-10-02T00:00:00Z'])(
    'zeigt fehlende, ungültige und zukünftige Zeitpunkte neutral: %s',
    (value) => {
      expect(vintedListingAge(value, start)).toMatchObject({
        tone: 'neutral',
        overdue: false,
        text: 'Inseratsalter unbekannt',
      });
    },
  );
  it('berechnet 24-Stunden-Tage auch über die Zeitumstellung', () => {
    const age = vintedListingAge(
      '2026-10-24T12:00:00+02:00',
      Date.parse('2026-10-25T11:00:00+01:00'),
    );
    expect(age.text).toBe('1 Tag online');
  });
});

describe('Gerundetes Vinted-Alter', () => {
  const approximate = { value: 2, unit: 'day', observedAt: publishedAt } as const;
  it('kennzeichnet das Anbieter-Alter und zählt ab der Beobachtung weiter', () => {
    expect(vintedListingAge(null, start, approximate)).toMatchObject({
      compact: 'ca. 2 T',
      text: 'ca. 2 Tage online',
      tone: 'success',
    });
    expect(vintedListingAge(null, start + 24 * hour, approximate)).toMatchObject({
      text: 'ca. 3 Tage online',
      tone: 'caution',
    });
  });
  it('bevorzugt ein genaues Veröffentlichungsdatum', () => {
    expect(vintedListingAge(publishedAt, start + hour, approximate).text).toBe('1 Stunde online');
  });
  it('erfindet bei ungültigen oder zukünftigen Beobachtungen kein Alter', () => {
    expect(vintedListingAge(null, start - hour, approximate).tone).toBe('neutral');
    expect(vintedListingAge(null, start, { ...approximate, value: -1 }).tone).toBe('neutral');
  });
});
