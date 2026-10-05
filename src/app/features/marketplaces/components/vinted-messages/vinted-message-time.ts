const relativeTime = new Intl.RelativeTimeFormat('de', { numeric: 'always' });

function calendarDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

export function formatConversationTime(timestamp: string | null, now: number): string {
  const time = Date.parse(timestamp ?? '');
  if (!Number.isFinite(time)) return 'Datum nicht verfügbar';
  const days = calendarDay(now) - calendarDay(time);
  if (days === 1) return 'gestern';
  if (days > 1) return relativeTime.format(-days, 'day');
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) return 'gerade eben';
  return seconds < 3600
    ? relativeTime.format(-Math.floor(seconds / 60), 'minute')
    : relativeTime.format(-Math.floor(seconds / 3600), 'hour');
}

export function formatMessageDay(timestamp: string | null, now: number): string {
  const time = Date.parse(timestamp ?? '');
  if (!Number.isFinite(time)) return 'Datum nicht verfügbar';
  const days = calendarDay(now) - calendarDay(time);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  return new Date(time).toLocaleDateString('de', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
