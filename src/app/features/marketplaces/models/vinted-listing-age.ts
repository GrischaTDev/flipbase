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
