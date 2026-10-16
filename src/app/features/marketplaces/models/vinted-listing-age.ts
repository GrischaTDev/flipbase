import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export interface VintedPublicationAge {
  readonly value: number;
  readonly unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
  readonly observedAt: string;
}

export function parseVintedPublicationAge(value: unknown): VintedPublicationAge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const age = value as Record<string, unknown>;
  if (
    typeof age['value'] !== 'number' ||
    !Number.isSafeInteger(age['value']) ||
    age['value'] < 0 ||
    age['value'] > 10000 ||
    !['minute', 'hour', 'day', 'week', 'month', 'year'].includes(String(age['unit'])) ||
    typeof age['observedAt'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(age['observedAt']) ||
    !Number.isFinite(Date.parse(age['observedAt']))
  )
    return null;
  return {
    value: age['value'],
    unit: age['unit'] as VintedPublicationAge['unit'],
    observedAt: age['observedAt'],
  };
}

const hour = 3_600_000;
export interface VintedListingAge {
  readonly tone: BadgeTone;
  readonly compact: string;
  readonly text: string;
  readonly overdue: boolean;
  readonly approximate?: boolean;
}

export function vintedListingAge(
  publishedAt: string | null | undefined,
  now: number,
  approximate?: VintedPublicationAge | null,
): VintedListingAge {
  const timestamp = publishedAt ? Date.parse(publishedAt) : NaN;
  const calendar = publishedAt?.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  const validDay =
    calendar &&
    Number(calendar[3]) <=
      new Date(Date.UTC(Number(calendar[1]), Number(calendar[2]), 0)).getUTCDate();
  if (!validDay || !Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now) {
    const age = parseVintedPublicationAge(approximate);
    if (age && Number.isFinite(now) && Date.parse(age.observedAt) <= now) {
      const units = {
        minute: { duration: 60_000, singular: 'Minute', plural: 'Minuten', compact: 'Min.' },
        hour: { duration: hour, singular: 'Stunde', plural: 'Stunden', compact: 'Std.' },
        day: { duration: 24 * hour, singular: 'Tag', plural: 'Tage', compact: 'T' },
        week: { duration: 7 * 24 * hour, singular: 'Woche', plural: 'Wochen', compact: 'Wo.' },
        month: { duration: 30 * 24 * hour, singular: 'Monat', plural: 'Monate', compact: 'Mon.' },
        year: { duration: 365 * 24 * hour, singular: 'Jahr', plural: 'Jahre', compact: 'J.' },
      };
      const unit = units[age.unit];
      const elapsed = age.value * unit.duration + now - Date.parse(age.observedAt);
      const value = Math.floor(elapsed / unit.duration);
      return {
        tone: elapsed < 72 * hour ? 'success' : elapsed < 120 * hour ? 'caution' : 'critical',
        approximate: true,
        compact: `ca. ${value} ${unit.compact}`,
        text: `ca. ${value} ${value === 1 ? unit.singular : unit.plural} online`,
        overdue: elapsed >= 168 * hour,
      };
    }
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
