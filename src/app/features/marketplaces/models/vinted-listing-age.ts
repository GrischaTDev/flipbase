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
  readonly dateOnly?: boolean;
  readonly created?: boolean;
}

export function validListingTimestamp(
  value: string | null | undefined,
  now: number,
): number | null {
  const timestamp = value ? Date.parse(value) : NaN;
  const calendar = value?.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  const validDay =
    calendar &&
    Number(calendar[3]) <=
      new Date(Date.UTC(Number(calendar[1]), Number(calendar[2]), 0)).getUTCDate();
  return validDay &&
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    Number.isFinite(now) &&
    timestamp <= now
    ? timestamp
    : null;
}

export function vintedListingAge(
  publishedAt: string | null | undefined,
  now: number,
  approximate?: VintedPublicationAge | null,
  publishedOn?: string | null,
  createdAt?: string | null,
): VintedListingAge {
  const timestamp = validListingTimestamp(publishedAt, now);
  if (timestamp === null) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(publishedOn ?? '') && Number.isFinite(now)) {
      const date = Date.parse(publishedOn! + 'T00:00:00Z');
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((value) => value.type === type)?.value;
      const today = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
      if (
        Number.isFinite(date) &&
        new Date(date).toISOString().slice(0, 10) === publishedOn &&
        date <= today
      ) {
        return { ...listingAgeInDays(today - date), dateOnly: true };
      }
    }
    const age = parseVintedPublicationAge(approximate);
    if (age && Number.isFinite(now) && Date.parse(age.observedAt) <= now) {
      const unitDuration = {
        minute: 60_000,
        hour,
        day: 24 * hour,
        week: 7 * 24 * hour,
        month: 30 * 24 * hour,
        year: 365 * 24 * hour,
      };
      return listingAgeInDays(
        age.value * unitDuration[age.unit] + now - Date.parse(age.observedAt),
        true,
      );
    }
    const created = validListingTimestamp(createdAt, now);
    if (created !== null) {
      const days = Math.floor((now - created) / (24 * hour));
      return {
        tone: 'neutral',
        compact: days === 0 ? '< 1 Tag · erstellt' : `${days} T · erstellt`,
        text:
          days === 0
            ? 'Vor weniger als 1 Tag erstellt'
            : `Vor ${days} ${days === 1 ? 'Tag' : 'Tagen'} erstellt`,
        overdue: false,
        created: true,
      };
    }
    return {
      tone: 'neutral',
      compact: 'Alter unbekannt',
      text: 'Inseratsalter unbekannt',
      overdue: false,
    };
  }
  return listingAgeInDays(now - timestamp);
}

function listingAgeInDays(elapsed: number, approximate = false): VintedListingAge {
  const days = Math.floor(elapsed / (24 * hour));
  return {
    tone: elapsed < 72 * hour ? 'success' : elapsed < 120 * hour ? 'caution' : 'critical',
    compact: days === 0 ? '< 1 Tag' : `${days} T`,
    text: days === 0 ? 'Unter 1 Tag online' : `${days} ${days === 1 ? 'Tag' : 'Tage'} online`,
    overdue: elapsed >= 168 * hour,
    ...(approximate ? { approximate: true } : {}),
  };
}
