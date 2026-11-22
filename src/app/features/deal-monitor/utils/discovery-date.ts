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

export function discoveryAge(value: string, now: Date): string {
  const elapsedMs = now.getTime() - Date.parse(value);
  if (!Number.isFinite(elapsedMs)) return 'Datum unbekannt';
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (seconds < 60) return `vor ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}
