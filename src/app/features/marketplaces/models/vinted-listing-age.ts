import type { BadgeTone } from '../../../shared/components/badge/badge.component';

const hour = 3_600_000;
export interface VintedListingAge {
  readonly tone: BadgeTone;
  readonly compact: string;
  readonly text: string;
  readonly overdue: boolean;
}

export function vintedListingAge(
  publishedAt: string | null | undefined,
  now: number,
): VintedListingAge {
  const timestamp = publishedAt ? Date.parse(publishedAt) : NaN;
  const calendar = publishedAt?.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  const validDay =
    calendar &&
    Number(calendar[3]) <=
      new Date(Date.UTC(Number(calendar[1]), Number(calendar[2]), 0)).getUTCDate();
  if (!validDay || !Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now) {
    return {
      tone: 'neutral',
      compact: 'Alter unbekannt',
      text: 'Inseratsalter unbekannt',
      overdue: false,
    };
  }
  const elapsed = now - timestamp;
  const hours = Math.floor(elapsed / hour);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const dayText = `${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  const hourText = `${remainingHours} ${remainingHours === 1 ? 'Stunde' : 'Stunden'}`;
  const text =
    hours === 0
      ? 'Unter 1 Stunde'
      : days === 0
        ? hourText
        : remainingHours === 0
          ? dayText
          : `${dayText} und ${hourText}`;
  return {
    tone: elapsed < 72 * hour ? 'success' : elapsed < 120 * hour ? 'caution' : 'critical',
    compact:
      hours === 0
        ? '< 1 Std.'
        : days === 0
          ? `${hours} Std.`
          : remainingHours === 0
            ? `${days} T`
            : `${days} T ${remainingHours} Std.`,
    text: `${text} online`,
    overdue: elapsed >= 168 * hour,
  };
}
