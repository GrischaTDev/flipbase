export const MAX_ARTICLE_PRICE_COMPARISONS = 2000;

/** Kompakter, bereits fachlich zugeordneter Angebotsbeleg ohne Bilder oder Verkäuferprofil. */
export interface ArticlePriceComparison {
  id: string;
  url: string;
  title: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  price: number;
  currency: string;
  match: 'model' | 'category' | 'different';
  observedAt: string;
  availability?: 'active' | 'unavailable' | 'unknown';
  /** Ausschließlich aus einer geprüften Quellangabe, nicht aus Modellvermutungen. */
  publishedEarliest?: string | null;
  publishedLatest?: string | null;
  publicationCheckedAt?: string | null;
}

export interface ArticlePriceDistribution {
  count: number;
  minimum: number;
  lowerQuartile: number;
  median: number;
  upperQuartile: number;
  maximum: number;
}

export interface ArticlePriceGroup {
  /** Beobachtete Forderungen; ohne bestätigte Verfügbarkeit keine Kaufgarantie. */
  observedOffers: ArticlePriceDistribution | null;
  publishedInWindow: ArticlePriceDistribution | null;
  publicationUnknown: ArticlePriceDistribution | null;
  publishedBeforeWindow: ArticlePriceDistribution | null;
  availabilityUnknownCount: number;
}

export interface ArticlePriceStatistics {
  basis: 'asking';
  currency: 'EUR';
  asOf: string;
  windowDays: 20 | 30;
  windowStart: string;
  quantileMethod: 'linear_interpolation';
  inputCount: number;
  uniqueItemCount: number;
  includedItemCount: number;
  modelItemCount: number;
  categoryOnlyItemCount: number;
  duplicateCount: number;
  excluded: {
    invalid: number;
    conflictingDuplicates: number;
    unavailable: number;
    different: number;
  };
  observations: { earliest: string; latest: string } | null;
  model: ArticlePriceGroup;
  /** Breite Grundgesamtheit einschließlich der Modell-Teilmenge. */
  category: ArticlePriceGroup;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts) return null;
  const day = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59
  )
    return null;
  return milliseconds;
}

function priceCents(comparison: ArticlePriceComparison): number | null {
  if (comparison.currency !== 'EUR' || !Number.isFinite(comparison.price) || comparison.price <= 0)
    return null;
  const cents = comparison.price * 100;
  const rounded = Math.round(cents);
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(cents - rounded) > 0.000001)
    return null;
  return rounded;
}

function publicationWindow(
  comparison: ArticlePriceComparison,
  observedAt: number,
  asOf: number,
  cutoff: number,
): 'inside' | 'outside' | 'unknown' {
  const checkedAt =
    comparison.publicationCheckedAt == null
      ? observedAt
      : timestamp(comparison.publicationCheckedAt);
  const earliest = timestamp(comparison.publishedEarliest);
  const latest = timestamp(comparison.publishedLatest);
  if (
    checkedAt === null ||
    checkedAt > asOf ||
    earliest === null ||
    latest === null ||
    earliest > latest ||
    latest > checkedAt ||
    earliest > observedAt
  )
    return 'unknown';
  if (earliest >= cutoff) return 'inside';
  return latest < cutoff ? 'outside' : 'unknown';
}

function duplicateFingerprint(comparison: ArticlePriceComparison): string {
  return JSON.stringify([
    comparison.price,
    comparison.currency,
    comparison.match,
    comparison.brand,
    comparison.size,
    comparison.condition,
    comparison.availability ?? 'unknown',
    comparison.publishedEarliest ?? null,
    comparison.publishedLatest ?? null,
    comparison.publicationCheckedAt ?? null,
  ]);
}

function distribution(cents: number[]): ArticlePriceDistribution | null {
  if (!cents.length) return null;
  const values = [...cents].sort((left, right) => left - right);
  const quantile = (fraction: number) => {
    const position = (values.length - 1) * fraction;
    const lower = values[Math.floor(position)]!;
    const upper = values[Math.ceil(position)]!;
    // Lineare Interpolation (Typ 7), anschließend auf einen Cent runden.
    return Math.round(lower + (upper - lower) * (position - Math.floor(position))) / 100;
  };
  return {
    count: values.length,
    minimum: values[0]! / 100,
    lowerQuartile: quantile(0.25),
    median: quantile(0.5),
    upperQuartile: quantile(0.75),
    maximum: values.at(-1)! / 100,
  };
}

/** Rechnet Angebotspreise; leitet weder bezahlte Verkäufe noch garantierte Erlöse daraus ab. */
export function summarizeArticlePrices(
  comparisons: readonly ArticlePriceComparison[],
  options: { asOf: string; windowDays?: 20 | 30 },
): ArticlePriceStatistics {
  if (comparisons.length > MAX_ARTICLE_PRICE_COMPARISONS)
    throw new RangeError('Too many article price comparisons');
  const asOf = timestamp(options.asOf);
  const windowDays = options.windowDays ?? 30;
  if (asOf === null || ![20, 30].includes(windowDays)) throw new Error('Invalid analysis window');
  const cutoff = asOf - windowDays * 86_400_000;
  const excluded = { invalid: 0, conflictingDuplicates: 0, unavailable: 0, different: 0 };
  const latest = new Map<
    string,
    { comparison: ArticlePriceComparison; observedAt: number; conflicting: boolean }
  >();
  let duplicateCount = 0;
  for (const comparison of comparisons) {
    const observedAt = timestamp(comparison.observedAt);
    if (
      typeof comparison.id !== 'string' ||
      !comparison.id.trim() ||
      comparison.id.length > 128 ||
      observedAt === null ||
      observedAt > asOf
    ) {
      excluded.invalid++;
      continue;
    }
    const id = comparison.id.trim();
    const previous = latest.get(id);
    if (previous) duplicateCount++;
    if (!previous || observedAt > previous.observedAt) {
      latest.set(id, { comparison, observedAt, conflicting: false });
    } else if (
      observedAt === previous.observedAt &&
      duplicateFingerprint(comparison) !== duplicateFingerprint(previous.comparison)
    ) {
      previous.conflicting = true;
    }
  }
  const createGroup = () => ({
    all: [] as number[],
    inside: [] as number[],
    outside: [] as number[],
    unknown: [] as number[],
    availabilityUnknownCount: 0,
  });
  const groups = { model: createGroup(), category: createGroup() };
  const observedTimes: number[] = [];
  for (const { comparison, observedAt, conflicting } of latest.values()) {
    if (conflicting) {
      excluded.conflictingDuplicates++;
      continue;
    }
    const cents = priceCents(comparison);
    if (
      cents === null ||
      !['model', 'category', 'different'].includes(comparison.match) ||
      !['active', 'unavailable', 'unknown'].includes(comparison.availability ?? 'unknown')
    ) {
      excluded.invalid++;
      continue;
    }
    if (comparison.availability === 'unavailable') {
      excluded.unavailable++;
      continue;
    }
    if (comparison.match === 'different') {
      excluded.different++;
      continue;
    }
    const publication = publicationWindow(comparison, observedAt, asOf, cutoff);
    const relevantGroups =
      comparison.match === 'model' ? [groups.model, groups.category] : [groups.category];
    for (const group of relevantGroups) {
      group.all.push(cents);
      group[publication].push(cents);
      if (comparison.availability !== 'active') group.availabilityUnknownCount++;
    }
    observedTimes.push(observedAt);
  }
  const finishGroup = (group: ReturnType<typeof createGroup>): ArticlePriceGroup => ({
    observedOffers: distribution(group.all),
    publishedInWindow: distribution(group.inside),
    publicationUnknown: distribution(group.unknown),
    publishedBeforeWindow: distribution(group.outside),
    availabilityUnknownCount: group.availabilityUnknownCount,
  });
  return {
    basis: 'asking',
    currency: 'EUR',
    asOf: new Date(asOf).toISOString(),
    windowDays,
    windowStart: new Date(cutoff).toISOString(),
    quantileMethod: 'linear_interpolation',
    inputCount: comparisons.length,
    uniqueItemCount: latest.size,
    duplicateCount,
    excluded,
    includedItemCount: groups.category.all.length,
    modelItemCount: groups.model.all.length,
    categoryOnlyItemCount: groups.category.all.length - groups.model.all.length,
    observations: observedTimes.length
      ? {
          earliest: new Date(Math.min(...observedTimes)).toISOString(),
          latest: new Date(Math.max(...observedTimes)).toISOString(),
        }
      : null,
    model: finishGroup(groups.model),
    category: finishGroup(groups.category),
  };
}
