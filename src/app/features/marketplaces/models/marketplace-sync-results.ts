export const MARKETPLACE_SYNC_SOURCE_LABELS = {
  profile: 'Profil',
  publications: 'Inserate',
  conversations: 'Gespräche',
  messages: 'Nachrichten',
  sales: 'Verkäufe',
  feedback: 'Bewertungen',
} as const;

export type MarketplaceSyncSource = keyof typeof MARKETPLACE_SYNC_SOURCE_LABELS;

const failures = [
  'unauthorized',
  'forbidden',
  'rate_limited',
  'provider_unavailable',
  'invalid_response',
  'timeout',
  'network',
  'browser_context',
] as const;

export interface MarketplaceSyncSourceResult {
  readonly status: 'complete' | 'partial' | 'failed';
  readonly failure?: (typeof failures)[number];
}

export type MarketplaceSyncSourceResults = Readonly<
  Record<MarketplaceSyncSource, MarketplaceSyncSourceResult>
>;

const sources = Object.keys(MARKETPLACE_SYNC_SOURCE_LABELS) as MarketplaceSyncSource[];

export function parseMarketplaceSyncSourceResults(value: unknown): MarketplaceSyncSourceResults {
  const invalid = () => new Error('Bereichsergebnisse der Aktualisierung ungültig');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const entries = value as Record<string, unknown>;
  if (
    Object.keys(entries).length !== sources.length ||
    Object.keys(entries).some((source) => !sources.includes(source as MarketplaceSyncSource))
  )
    throw invalid();
  const result = {} as Record<MarketplaceSyncSource, MarketplaceSyncSourceResult>;
  for (const source of sources) {
    const entry = entries[source];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid();
    const fields = entry as Record<string, unknown>;
    const status = fields['status'];
    const failure = fields['failure'];
    if (
      (status !== 'complete' && status !== 'partial' && status !== 'failed') ||
      Object.keys(fields).some((key) => key !== 'status' && key !== 'failure') ||
      ('failure' in fields &&
        (typeof failure !== 'string' || !failures.includes(failure as (typeof failures)[number])))
    )
      throw invalid();
    result[source] = {
      status,
      ...(failure === undefined ? {} : { failure: failure as (typeof failures)[number] }),
    };
  }
  return result;
}

export function marketplaceSyncWarningSources(
  results: MarketplaceSyncSourceResults | undefined,
): readonly MarketplaceSyncSource[] {
  return results
    ? sources.filter((source) => results[source].status === 'failed' || !!results[source].failure)
    : [];
}
