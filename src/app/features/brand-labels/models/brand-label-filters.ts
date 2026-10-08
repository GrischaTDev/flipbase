import type { LabelInterval, LabelReadFilter } from './brand-label.models';
import { LABEL_LIMITS } from './brand-label-limits';

function ownString(params: Record<string, string | undefined>, key: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(params, key);
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : '';
}

function normalizeQuery(query: string): string {
  const characters: string[] = [];
  for (const character of query) {
    const point = character.codePointAt(0) ?? 0;
    if (point >= 0xd800 && point <= 0xdfff) continue;
    if (point === 9 || point === 10 || point === 13) characters.push(' ');
    else if (point >= 0x20 && !(point >= 0x7f && point <= 0x9f)) characters.push(character);
  }
  return [...characters.join('').normalize('NFC').trim()]
    .slice(0, LABEL_LIMITS.queryCharacters)
    .join('')
    .trimEnd();
}

function validYear(value: number | null): boolean {
  return (
    value === null ||
    (Number.isInteger(value) && value >= 1 && value <= LABEL_LIMITS.maxCalendarYear)
  );
}

function validDecade(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= LABEL_LIMITS.minFilterDecade &&
    value <= 9990 &&
    value % 10 === 0
  );
}

/** Reine URL-Normalisierung; das Bezugsjahr wird ausdrücklich übergeben. */
export function normalizeLabelFilters(
  params: Record<string, string | undefined>,
  currentYear: number,
): LabelReadFilter {
  if (
    !Number.isInteger(currentYear) ||
    currentYear < 1 ||
    currentYear > LABEL_LIMITS.maxCalendarYear
  ) {
    throw new RangeError('invalid-current-year');
  }
  const brand = ownString(params, 'brand');
  const decadeText = ownString(params, 'decade');
  const kind = ownString(params, 'kind');
  const parsedDecade = /^\d{3}0$/.test(decadeText) ? Number(decadeText) : NaN;
  const decade =
    decadeText === 'unknown'
      ? 'unknown'
      : validDecade(parsedDecade) && parsedDecade <= Math.floor(currentYear / 10) * 10
        ? parsedDecade
        : null;
  return {
    brandSlug:
      brand.length <= LABEL_LIMITS.slugCharacters && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand)
        ? brand
        : null,
    query: normalizeQuery(ownString(params, 'q')),
    decade,
    kind: kind === 'neck-label' || kind === 'care-size-label' ? kind : null,
  };
}

/** Werte an den Router/URLSearchParams geben; keine Abfragesprache daraus bauen. */
export function labelFiltersToQueryParams(filter: LabelReadFilter): Record<string, string> {
  const result: Record<string, string> = {};
  if (filter.brandSlug !== null) result['brand'] = filter.brandSlug;
  if (filter.query) result['q'] = filter.query;
  if (filter.decade !== null) result['decade'] = String(filter.decade);
  if (filter.kind !== null) result['kind'] = filter.kind;
  return result;
}

export function hasDatedLabelInterval(interval: LabelInterval): boolean {
  const { startYear, endYear } = interval;
  if (!validYear(startYear) || !validYear(endYear)) return false;
  if (startYear !== null && endYear !== null && startYear > endYear) return false;
  return startYear !== null || endYear !== null;
}

/** Eine offene Grenze wird nicht durch ein erfundenes Produktionsjahr ersetzt. */
export function intervalOverlapsDecade(interval: LabelInterval, decade: number): boolean {
  if (!validDecade(decade) || !hasDatedLabelInterval(interval)) return false;
  return (
    (interval.startYear === null || interval.startYear <= decade + 9) &&
    (interval.endYear === null || interval.endYear >= decade)
  );
}

/** Entspricht dem fachlichen Vertrag, ersetzt aber keine serverseitige SQL-Filterung. */
export function matchesLabelTimeFilter(
  intervals: readonly LabelInterval[],
  decade: LabelReadFilter['decade'],
): boolean {
  if (decade === null) return true;
  if (decade === 'unknown') return !intervals.some(hasDatedLabelInterval);
  return intervals.some((interval) => intervalOverlapsDecade(interval, decade));
}
