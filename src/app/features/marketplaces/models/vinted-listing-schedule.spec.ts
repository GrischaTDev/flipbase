import { describe, expect, it } from 'vitest';
import {
  resolveVintedListingSchedule,
  selectVintedListingSchedule,
  vintedListingScheduleTiming,
} from './vinted-listing-schedule';

describe('Veröffentlichungstermin für Vinted-Inserate', () => {
  it('verlangt für eine doppelte Uhrzeit eine ausdrückliche Auswahl', () => {
    const input = { date: '2026-10-25', time: '02:30', timeZone: 'Europe/Berlin' };
    const now = Date.parse('2026-10-09T12:00:00Z');
    expect(() => selectVintedListingSchedule(input, now)).toThrow('zweimal');
    expect(selectVintedListingSchedule(input, now, 'earlier')).toEqual({
      scheduledAt: '2026-10-25T00:30:00.000Z',
      timeZone: 'Europe/Berlin',
    });
    expect(selectVintedListingSchedule(input, now, 'later')).toEqual({
      scheduledAt: '2026-10-25T01:30:00.000Z',
      timeZone: 'Europe/Berlin',
    });
  });

  it('plant ausschließlich zukünftige Termine', () => {
    const input = { date: '2026-10-09', time: '18:30', timeZone: 'Europe/Berlin' };
    expect(() => selectVintedListingSchedule(input, Date.parse('2026-10-09T16:30:00Z'))).toThrow(
      'Zukunft',
    );
    expect(() => selectVintedListingSchedule(input, Date.parse('2026-10-09T17:00:00Z'))).toThrow(
      'Zukunft',
    );
    expect(selectVintedListingSchedule(input, Date.parse('2026-10-09T16:29:59Z'))).toEqual({
      scheduledAt: '2026-10-09T16:30:00.000Z',
      timeZone: 'Europe/Berlin',
    });
  });

  it('plant keine ungültigen oder übersprungenen Uhrzeiten', () => {
    expect(() =>
      selectVintedListingSchedule(
        { date: '2027-03-28', time: '02:30', timeZone: 'Europe/Berlin' },
        0,
      ),
    ).toThrow('existiert');
    expect(() =>
      selectVintedListingSchedule(
        { date: '2026-02-29', time: '18:30', timeZone: 'Europe/Berlin' },
        0,
      ),
    ).toThrow();
    expect(() =>
      selectVintedListingSchedule(
        { date: '2026-10-09', time: '18:30', timeZone: 'Unknown/Zone' },
        0,
      ),
    ).toThrow();
    expect(() =>
      selectVintedListingSchedule(
        { date: '2026-10-09', time: '18:30', timeZone: 'Europe/Berlin' },
        Number.NaN,
      ),
    ).toThrow();
  });
  it.each([
    ['2026-07-09', '18:30', '2026-07-09T16:30:00.000Z', 120],
    ['2026-12-09', '18:30', '2026-12-09T17:30:00.000Z', 60],
  ])('berechnet %s %s in Berlin unabhängig von der Gerätezeitzone', (date, time, utc, offset) => {
    expect(resolveVintedListingSchedule({ date, time, timeZone: 'Europe/Berlin' })).toEqual({
      kind: 'unique',
      timeZone: 'Europe/Berlin',
      choices: [{ scheduledAt: utc, offsetMinutes: offset }],
    });
  });

  it('weist eine Uhrzeit in der übersprungenen Sommerzeitstunde zurück', () => {
    expect(
      resolveVintedListingSchedule({
        date: '2027-03-28',
        time: '02:30',
        timeZone: 'Europe/Berlin',
      }),
    ).toMatchObject({ kind: 'nonexistent' });
  });

  it('bietet beide Vorkommen einer Winterzeit-Uhrzeit zur bewussten Auswahl an', () => {
    expect(
      resolveVintedListingSchedule({
        date: '2026-10-25',
        time: '02:30',
        timeZone: 'Europe/Berlin',
      }),
    ).toEqual({
      kind: 'ambiguous',
      timeZone: 'Europe/Berlin',
      choices: [
        { scheduledAt: '2026-10-25T00:30:00.000Z', offsetMinutes: 120 },
        { scheduledAt: '2026-10-25T01:30:00.000Z', offsetMinutes: 60 },
      ],
    });
  });

  it.each([
    ['UTC', '2026-10-09T18:30:00.000Z', 0],
    ['Asia/Kathmandu', '2026-10-09T12:45:00.000Z', 345],
  ])('erhält auch Viertelstunden-Zeitzonen korrekt: %s', (timeZone, scheduledAt, offsetMinutes) => {
    expect(
      resolveVintedListingSchedule({ date: '2026-10-09', time: '18:30', timeZone }),
    ).toMatchObject({ kind: 'unique', choices: [{ scheduledAt, offsetMinutes }] });
  });

  it('erkennt die halbstündige doppelte Uhrzeit auf Lord Howe', () => {
    expect(
      resolveVintedListingSchedule({
        date: '2027-04-04',
        time: '01:45',
        timeZone: 'Australia/Lord_Howe',
      }),
    ).toMatchObject({
      kind: 'ambiguous',
      choices: [
        { scheduledAt: '2027-04-03T14:45:00.000Z', offsetMinutes: 660 },
        { scheduledAt: '2027-04-03T15:15:00.000Z', offsetMinutes: 630 },
      ],
    });
  });

  it.each([
    ['2026-02-29', '18:30', 'Europe/Berlin'],
    ['2026-04-31', '18:30', 'Europe/Berlin'],
    ['2026-10-09', '24:00', 'Europe/Berlin'],
    ['2026-10-09', '18:60', 'Europe/Berlin'],
    ['09.10.2026', '18:30', 'Europe/Berlin'],
    ['2026-10-09', '18:30:01', 'Europe/Berlin'],
    ['2026-10-09', '18:30', 'Unknown/Zone'],
  ])('weist ungültige Eingaben zurück: %s %s %s', (date, time, timeZone) => {
    expect(resolveVintedListingSchedule({ date, time, timeZone })).toMatchObject({
      kind: 'invalid',
    });
  });

  it('hält einen zukünftigen Termin auch nach einem Neustart zurück', () => {
    expect(
      vintedListingScheduleTiming(
        '2026-10-09T18:30:00.000Z',
        'pause_after_30_minutes',
        Date.parse('2026-10-09T18:29:59Z'),
      ),
    ).toBe('not_due');
  });

  it.each([
    ['2026-10-09T18:30:00Z', 'due'],
    ['2026-10-09T19:00:00Z', 'due'],
    ['2026-10-09T19:00:00.001Z', 'paused'],
  ])('beachtet die Grenze von 30 Minuten exakt: %s', (now, expected) => {
    expect(
      vintedListingScheduleTiming(
        '2026-10-09T18:30:00.000Z',
        'pause_after_30_minutes',
        Date.parse(now),
      ),
    ).toBe(expected);
  });

  it('lässt das bewusste Nachholen auch am nächsten Tag zu', () => {
    expect(
      vintedListingScheduleTiming(
        '2026-10-09T18:30:00.000Z',
        'publish_when_available',
        Date.parse('2026-10-10T08:00:00Z'),
      ),
    ).toBe('due');
  });

  it('weist unklare gespeicherte Uhrzeiten und ungültige Uhren zurück', () => {
    expect(() =>
      vintedListingScheduleTiming('2026-10-09T18:30:00', 'pause_after_30_minutes', 0),
    ).toThrow();
    expect(() =>
      vintedListingScheduleTiming('2026-02-30T18:30:00.000Z', 'pause_after_30_minutes', 0),
    ).toThrow();
    expect(() =>
      vintedListingScheduleTiming('2026-10-09T18:30:00.000Z', 'pause_after_30_minutes', Number.NaN),
    ).toThrow();
  });
});
