import { describe, expect, it } from 'vitest';
import { formatConversationTime, formatMessageDay } from './vinted-message-time';

function localTime(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe('German inbox dates', () => {
  const now = Date.parse(localTime(2026, 10, 5, 20));

  it('shows recent conversations with minutes and hours and keeps calendar days readable', () => {
    expect(formatConversationTime(localTime(2026, 10, 5, 20), now)).toBe('gerade eben');
    expect(formatConversationTime(localTime(2026, 10, 5, 19, 58), now)).toBe('vor 2 Minuten');
    expect(formatConversationTime(localTime(2026, 10, 5, 6), now)).toBe('vor 14 Stunden');
    expect(formatConversationTime(localTime(2026, 10, 4, 23), now)).toBe('gestern');
    expect(formatConversationTime(localTime(2026, 10, 3, 23), now)).toBe('vor 2 Tagen');
  });

  it('uses Today and Yesterday in the transcript and German dates for older messages', () => {
    expect(formatMessageDay(localTime(2026, 10, 5), now)).toBe('Heute');
    expect(formatMessageDay(localTime(2026, 10, 4), now)).toBe('Gestern');
    expect(formatMessageDay(localTime(2026, 10, 3), now)).toBe('Samstag, 3. Oktober 2026');
  });

  it('uses calendar days across midnight, year changes and daylight saving boundaries', () => {
    for (const [before, after] of [
      [localTime(2026, 10, 4, 23, 59), localTime(2026, 10, 5, 0, 1)],
      [localTime(2025, 12, 31, 23, 59), localTime(2026, 1, 1, 0, 1)],
      [localTime(2026, 10, 24, 23, 59), localTime(2026, 10, 25, 23)],
    ]) {
      expect(formatConversationTime(before, Date.parse(after))).toBe('gestern');
      expect(formatMessageDay(before, Date.parse(after))).toBe('Gestern');
    }
  });

  it('does not invent a timestamp for undated or invalid messages', () => {
    for (const timestamp of [null, 'invalid']) {
      expect(formatConversationTime(timestamp, now)).toBe('Datum nicht verfügbar');
      expect(formatMessageDay(timestamp, now)).toBe('Datum nicht verfügbar');
    }
  });
});
