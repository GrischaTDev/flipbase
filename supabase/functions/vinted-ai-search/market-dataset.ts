export interface MarketPriceDistribution {
  count: number;
  median: number;
  lowerQuartile: number;
  upperQuartile: number;
  minimum: number;
  maximum: number;
}

export interface MarketDataset {
  windowDays: 30;
  initialImportDays: 7;
  asOf: string;
  observedSince: string | null;
  initialImportStatus: 'pending' | 'running' | 'complete' | 'partial' | 'unavailable';
  match: 'model' | 'category';
  active: MarketPriceDistribution | null;
  soldMarked: MarketPriceDistribution | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isoTimestamp(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function distribution(value: unknown): MarketPriceDistribution | null {
  const source = object(value);
  if (!source || !Number.isSafeInteger(source['count']) || (source['count'] as number) < 1)
    return null;
  const fields = ['minimum', 'lowerQuartile', 'median', 'upperQuartile', 'maximum'] as const;
  let previous = 0;
  for (const field of fields) {
    const price = source[field];
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price < previous)
      return null;
    previous = price;
  }
  return {
    count: source['count'] as number,
    median: source['median'] as number,
    lowerQuartile: source['lowerQuartile'] as number,
    upperQuartile: source['upperQuartile'] as number,
    minimum: source['minimum'] as number,
    maximum: source['maximum'] as number,
  };
}

/** Nur serverseitige Vergleichsstatistik übernehmen; Modelltext ist keine Datenquelle. */
export function parseMarketDataset(value: unknown): MarketDataset | null {
  const source = object(value);
  const asOf = isoTimestamp(source?.['asOf']);
  const observedSince = isoTimestamp(source?.['observedSince']);
  if (
    !source ||
    source['windowDays'] !== 30 ||
    source['initialImportDays'] !== 7 ||
    !asOf ||
    (source['observedSince'] !== null && !observedSince) ||
    (observedSince !== null && observedSince > asOf) ||
    !['pending', 'running', 'complete', 'partial', 'unavailable'].includes(
      String(source['initialImportStatus']),
    ) ||
    !['model', 'category'].includes(String(source['match']))
  )
    return null;
  const active = distribution(source['active']);
  const soldMarked = distribution(source['soldMarked']);
  if ((source['active'] !== null && !active) || (source['soldMarked'] !== null && !soldMarked))
    return null;
  return {
    windowDays: 30,
    initialImportDays: 7,
    asOf,
    observedSince,
    initialImportStatus: source['initialImportStatus'] as MarketDataset['initialImportStatus'],
    match: source['match'] as MarketDataset['match'],
    active,
    soldMarked,
  };
}

export function unavailableMarketDataset(match: MarketDataset['match']): MarketDataset {
  return {
    windowDays: 30,
    initialImportDays: 7,
    asOf: new Date().toISOString(),
    observedSince: null,
    initialImportStatus: 'unavailable',
    match,
    active: null,
    soldMarked: null,
  };
}

export async function loadMarketDataset(
  load: () => Promise<unknown>,
  match: MarketDataset['match'],
): Promise<MarketDataset> {
  try {
    return parseMarketDataset(await load()) ?? unavailableMarketDataset(match);
  } catch {
    return unavailableMarketDataset(match);
  }
}

export function marketDatasetSection(dataset: MarketDataset) {
  const available = dataset.initialImportStatus !== 'unavailable';
  return {
    summary: '',
    limitations: available
      ? []
      : ['Die gespeicherten Vergleichsdaten konnten nicht geladen werden.'],
    completed: available,
    sources: [] as { title: string; url: string }[],
  };
}
