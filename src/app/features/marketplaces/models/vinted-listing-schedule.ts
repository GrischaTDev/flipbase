export interface VintedListingScheduleInput {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
}

export type VintedListingLatePolicy = 'pause_after_30_minutes' | 'publish_when_available';

export interface VintedListingScheduleChoice {
  readonly scheduledAt: string;
  readonly offsetMinutes: number;
}

export type VintedListingScheduleResolution =
  | { readonly kind: 'invalid'; readonly reason: 'date_time' | 'time_zone' }
  | { readonly kind: 'nonexistent'; readonly timeZone: string; readonly choices: readonly [] }
  | {
      readonly kind: 'unique' | 'ambiguous';
      readonly timeZone: string;
      readonly choices: readonly VintedListingScheduleChoice[];
    };

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

export function selectVintedListingSchedule(
  input: VintedListingScheduleInput,
  now: number,
  occurrence?: 'earlier' | 'later',
): { readonly scheduledAt: string; readonly timeZone: string } {
  if (!Number.isFinite(now)) throw new Error('Die aktuelle Uhrzeit ist ungültig.');
  const resolution = resolveVintedListingSchedule(input);
  if (resolution.kind === 'invalid') throw new Error('Bitte prüfe Datum, Uhrzeit und Zeitzone.');
  if (resolution.kind === 'nonexistent')
    throw new Error('Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Wähle eine andere.');
  if (resolution.kind === 'ambiguous' && occurrence !== 'earlier' && occurrence !== 'later')
    throw new Error('Diese Uhrzeit kommt zweimal vor. Wähle das frühere oder spätere Vorkommen.');
  const choice =
    resolution.kind === 'ambiguous' && occurrence === 'later'
      ? resolution.choices[resolution.choices.length - 1]
      : resolution.choices[0];
  if (Date.parse(choice.scheduledAt) <= now) throw new Error('Wähle einen Termin in der Zukunft.');
  return { scheduledAt: choice.scheduledAt, timeZone: resolution.timeZone };
}

export function resolveVintedListingSchedule(
  input: VintedListingScheduleInput,
): VintedListingScheduleResolution {
  const wallTime = parseWallTime(input.date, input.time);
  if (wallTime === null) return { kind: 'invalid', reason: 'date_time' };
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: input.timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    // Ein fester UTC-Offset enthält keine Sommerzeitregeln und ist keine IANA-Zone.
    if (!input.timeZone || /^[+-]/.test(input.timeZone)) throw new RangeError();
  } catch {
    return { kind: 'invalid', reason: 'time_zone' };
  }
  const timeZone = formatter.resolvedOptions().timeZone;
  const offsets = new Set<number>();
  // Beide Seiten eines Zeitwechsels prüfen, auch bei halben Stunden und Datumswechseln.
  for (let hours = -36; hours <= 36; hours++) {
    const instant = wallTime + hours * hourMs;
    offsets.add(formattedWallTime(formatter, instant) - instant);
  }
  const choices = [...offsets]
    .map((offset) => ({ instant: wallTime - offset, offset }))
    .filter(({ instant }) => formattedWallTime(formatter, instant) === wallTime)
    .sort((a, b) => a.instant - b.instant)
    .map(({ instant, offset }) => ({
      scheduledAt: new Date(instant).toISOString(),
      offsetMinutes: offset / minuteMs,
    }));
  if (choices.length === 0) return { kind: 'nonexistent', timeZone, choices: [] };
  return { kind: choices.length === 1 ? 'unique' : 'ambiguous', timeZone, choices };
}

function parseWallTime(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (year < 1000 || hour > 23 || minute > 59) return null;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const parsed = new Date(timestamp);
  if (parsed.toISOString().slice(0, 16) !== `${date}T${time}`) return null;
  return timestamp;
}

function formattedWallTime(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  return Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
}

/** Prüft nur Fälligkeit. Rechte, Kontosperre und Ergebnisbelege bleiben Aufgabe des Servers. */
export function vintedListingScheduleTiming(
  scheduledAt: string,
  latePolicy: VintedListingLatePolicy,
  now: number,
): 'not_due' | 'due' | 'paused' {
  const timestamp = Date.parse(scheduledAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduledAt) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== scheduledAt ||
    !Number.isFinite(now) ||
    (latePolicy !== 'pause_after_30_minutes' && latePolicy !== 'publish_when_available')
  )
    throw new Error('Ungültiger Veröffentlichungstermin oder ungültige Zeitprüfung.');
  if (now < timestamp) return 'not_due';
  if (latePolicy === 'pause_after_30_minutes' && now - timestamp > 30 * minuteMs) return 'paused';
  return 'due';
}
