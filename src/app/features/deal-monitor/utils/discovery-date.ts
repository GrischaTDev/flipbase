/** Kalendertage statt 24-Stunden-Abständen; dadurch stimmen Mitternacht und Zeitumstellung. */
export function discoveryDate(value: string, now: Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Datum unbekannt';
  const day = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const prefix =
    day(date) === day(now)
      ? 'Heute'
      : day(date) === day(yesterday)
        ? 'Gestern'
        : new Intl.DateTimeFormat('de-DE', {
            day: '2-digit',
            month: '2-digit',
            ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
          }).format(date);
  return `${prefix} · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
}
