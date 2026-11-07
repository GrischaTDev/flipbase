export const MODEL_PRICES = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6-astra': { input: 10, cached: 1, output: 50 },
} as const;
export type SearchModel = keyof typeof MODEL_PRICES;
export const PRICING_DATE = '2026-11-06';
export const PROMPT_VERSION = 'vinted-product-research-7';
export interface ComparisonDate {
  status: 'within_window' | 'outside_window' | 'unknown';
  earliest: string | null;
  latest: string | null;
  label: string | null;
  checkedAt: string | null;
  source: 'vinted_listing' | 'unverified';
}
export interface Comparison {
  title: string;
  url: string;
  kind: 'manufacturer' | 'retail' | 'sold' | 'asking';
  price: number;
  evidence: string;
  sameVariant: boolean;
  match: 'model' | 'category' | 'different';
  listingDate?: ComparisonDate;
}
export interface ResearchSection {
  summary: string;
  limitations: string[];
  completed: boolean;
  sources: { title: string; url: string }[];
}
export interface Analysis {
  modelName: string;
  confidence: 'exact' | 'likely' | 'unknown';
  evidence: string;
  comparisons: Comparison[];
  comparisonBasis: 'model' | 'category';
  marketWindow: {
    days: 30;
    checkedAt: string;
    verifiedCount: number;
    undatedCount: number;
    excludedCount: number;
  };
  currentMarket: {
    low: number;
    high: number;
    count: number;
    basis: 'sold' | 'asking';
    match: 'model' | 'category';
  } | null;
  soldAverage: number | null;
  askingAverage: number | null;
  newPriceRange: { low: number; high: number; count: number } | null;
  research: {
    identification: ResearchSection;
    retail: ResearchSection;
    used: ResearchSection;
  } | null;
  resale: { low: number; high: number; basis: 'sold' | 'asking'; count: number } | null;
}
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function finiteCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function parseUsage(result: Record<string, unknown>, model: SearchModel) {
  const raw = record(result['usage']);
  const inputTokens = finiteCount(raw?.['input_tokens']);
  const outputTokens = finiteCount(raw?.['output_tokens']);
  const cachedInputTokens =
    finiteCount(record(raw?.['input_tokens_details'])?.['cached_tokens']) ?? 0;
  const output = Array.isArray(result['output']) ? result['output'] : [];
  const webSearchCalls = output.filter(
    (item) => record(item)?.['type'] === 'web_search_call',
  ).length;
  const pricing = { ...MODEL_PRICES[model], webSearch: 0.01, date: PRICING_DATE, currency: 'USD' };
  const knownCostUsd =
    inputTokens === null || outputTokens === null || cachedInputTokens > inputTokens
      ? null
      : Math.round(
          (((inputTokens - cachedInputTokens) * pricing.input) / 1e6 +
            (cachedInputTokens * pricing.cached) / 1e6 +
            (outputTokens * pricing.output) / 1e6 +
            webSearchCalls * pricing.webSearch) *
            1e8,
        ) / 1e8;
  const incomplete = result['usage_incomplete'] === true || knownCostUsd === null;
  const estimatedCostUsd = incomplete ? null : knownCostUsd;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    webSearchCalls,
    estimatedCostUsd,
    knownCostUsd,
    incomplete,
    pricing,
  };
}
function safeSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !/^[a-z0-9.-]+\.[a-z]{2,63}$/i.test(url.hostname) ||
      (url.port !== '' && url.port !== '443')
    )
      return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
function humanText(value: string): string {
  return value
    .replace(/[^]*/g, '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .trim();
}
// Feste Marktplatzhosts aus den Vinted-Länderlinks; beliebige Subdomains sind keine Artikelquellen.
const vintedDomains = new Set(
  [
    'at',
    'be',
    'co.uk',
    'com',
    'com.au',
    'cz',
    'de',
    'dk',
    'ee',
    'es',
    'fi',
    'fr',
    'gr',
    'hr',
    'hu',
    'ie',
    'it',
    'lt',
    'lu',
    'lv',
    'nl',
    'pl',
    'pt',
    'ro',
    'se',
    'si',
    'sk',
  ].flatMap((suffix) => [`vinted.${suffix}`, `www.vinted.${suffix}`]),
);

export function vintedSourceItemId(value: unknown): string | null {
  const source = safeSource(value);
  if (!source) return null;
  const url = new URL(source);
  if (!vintedDomains.has(url.hostname)) return null;
  return /^\/items\/(\d{1,20})(?:-[^/]*)?$/.exec(url.pathname)?.[1] ?? null;
}

export function sourceIdentity(value: string): string {
  const url = new URL(value);
  const itemId = vintedSourceItemId(value);
  if (itemId) return `vinted:${itemId}`;
  for (const key of [...url.searchParams.keys()])
    if (/^(?:utm_.+|srsltid|gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.origin + url.pathname.replace(/\/$/, '') + url.search;
}
function researchSection(value: unknown): ResearchSection {
  const section = record(value);
  const data = record(section?.['data']);
  const raw = record(section?.['raw']);
  const sources = new Map<string, { title: string; url: string }>();
  const add = (value: unknown) => {
    const source = record(value);
    const url = safeSource(source?.['url']);
    if (url)
      sources.set(sourceIdentity(url), {
        url,
        title:
          typeof source?.['title'] === 'string' && source['title'].trim()
            ? humanText(source['title']).slice(0, 200) || new URL(url).hostname
            : new URL(url).hostname,
      });
  };
  for (const value of Array.isArray(raw?.['output']) ? raw['output'] : []) {
    const item = record(value);
    const action = record(item?.['action']);
    if (item?.['type'] === 'web_search_call') {
      for (const source of Array.isArray(action?.['sources']) ? action['sources'] : []) add(source);
      if (action?.['url']) add({ url: action['url'] });
    }
    for (const part of Array.isArray(item?.['content']) ? item['content'] : []) {
      const content = record(part);
      for (const annotation of Array.isArray(content?.['annotations'])
        ? content['annotations']
        : [])
        if (record(annotation)?.['type'] === 'url_citation') add(annotation);
    }
  }
  const selectedSources = Array.isArray(data?.['sources'])
    ? data['sources'].flatMap((value) => {
        const source = record(value);
        const url = safeSource(source?.['url']);
        const found = url ? sources.get(sourceIdentity(url)) : undefined;
        return found
          ? [
              {
                url: found.url,
                title:
                  typeof source?.['title'] === 'string'
                    ? humanText(source['title']).slice(0, 200) || found.title
                    : found.title,
              },
            ]
          : [];
      })
    : [];
  const summary = data?.['summary'] ?? section?.['summary'];
  const limitations = data?.['limitations'] ?? section?.['limitations'];
  return {
    summary: typeof summary === 'string' ? humanText(summary).slice(0, 2500) : '',
    limitations: Array.isArray(limitations)
      ? limitations
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 6)
          .map((item) => humanText(item).slice(0, 600))
      : [],
    completed: section?.['completed'] === true,
    sources: selectedSources.length
      ? [
          ...new Map(
            selectedSources.map((source) => [sourceIdentity(source.url), source]),
          ).values(),
        ].slice(0, 6)
      : [...sources.values()].slice(0, 6),
  };
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function comparisonDate(value: unknown, researchedAt: number | null): ComparisonDate {
  const entry = record(value);
  const unknown: ComparisonDate = {
    status: 'unknown',
    earliest: null,
    latest: null,
    label: null,
    checkedAt: null,
    source: 'unverified',
  };
  if (entry?.['source'] !== 'vinted_listing' || researchedAt === null) return unknown;
  const checkedAt = timestamp(entry['checkedAt']);
  if (checkedAt === null || checkedAt > researchedAt || researchedAt - checkedAt > 180_000)
    return unknown;
  const earliest = timestamp(entry['earliest']);
  const latest = timestamp(entry['latest']);
  const result: ComparisonDate = {
    ...unknown,
    source: 'vinted_listing',
    label: typeof entry['label'] === 'string' ? humanText(entry['label']).slice(0, 120) : null,
    checkedAt: new Date(checkedAt).toISOString(),
  };
  if (earliest === null || latest === null || earliest > latest || latest > checkedAt)
    return result;
  const cutoff = researchedAt - 30 * 24 * 60 * 60 * 1000;
  return {
    ...result,
    // Nur das vollständige mögliche Zeitintervall darf im Auswertungsfenster liegen.
    status: earliest >= cutoff ? 'within_window' : latest < cutoff ? 'outside_window' : 'unknown',
    earliest: new Date(earliest).toISOString(),
    latest: new Date(latest).toISOString(),
  };
}

export function parseAnalysis(result: Record<string, unknown>, listingUrl?: string): Analysis {
  if (result['status'] !== 'completed' || !Array.isArray(result['output']))
    throw new Error('incomplete_response');
  const sources = new Map<string, string>();
  const texts: string[] = [];
  let searches = 0;
  const addSource = (value: unknown) => {
    const url = safeSource(value);
    if (url) sources.set(sourceIdentity(url), url);
  };
  for (const item of result['output']) {
    const entry = record(item);
    if (entry?.['type'] === 'web_search_call') {
      searches++;
      const action = record(entry['action']);
      if (Array.isArray(action?.['sources']))
        for (const source of action['sources']) addSource(record(source)?.['url']);
      addSource(action?.['url']);
    }
    if (entry?.['type'] === 'message' && Array.isArray(entry['content'])) {
      for (const part of entry['content']) {
        const content = record(part);
        if (content?.['type'] === 'output_text' && typeof content['text'] === 'string')
          texts.push(content['text']);
        if (Array.isArray(content?.['annotations']))
          for (const annotation of content['annotations']) addSource(record(annotation)?.['url']);
      }
    }
  }
  const rawResearch = record(result['research']);
  const research = rawResearch
    ? {
        identification: researchSection(rawResearch['identification']),
        retail: researchSection(rawResearch['retail']),
        used: researchSection(rawResearch['used']),
      }
    : null;
  if (research)
    for (const section of Object.values(research))
      for (const source of section.sources) addSource(source.url);
  // Direkte Belege behalten die kanonische Quelle auch bei Webtreffern anderer Vinted-Länder.
  for (const source of Array.isArray(result['comparisonSources'])
    ? result['comparisonSources']
    : [])
    addSource(record(source)?.['url']);
  if (!searches) throw new Error('missing_web_search');
  const parsed = record(JSON.parse(texts.join('')));
  if (
    !parsed ||
    typeof parsed['modelName'] !== 'string' ||
    typeof parsed['evidence'] !== 'string' ||
    !['exact', 'likely', 'unknown'].includes(String(parsed['confidence'])) ||
    !Array.isArray(parsed['comparisons'])
  )
    throw new Error('invalid_analysis');
  const modelName = humanText(parsed['modelName']).slice(0, 200);
  const confidence: Analysis['confidence'] =
    !modelName || !parsed['evidence'].trim()
      ? 'unknown'
      : (parsed['confidence'] as Analysis['confidence']);
  const researchedAt = timestamp(result['researchedAt']);
  const dates = new Map<string, ComparisonDate>();
  for (const value of Array.isArray(result['comparisonDates']) ? result['comparisonDates'] : []) {
    const date = record(value);
    const url = safeSource(date?.['url']);
    // Vertrauensdaten stammen ausschließlich aus unserem Detailseitenabruf, nie aus Modelltext.
    if (
      url &&
      new URL(url).origin === 'https://www.vinted.de' &&
      /^\/items\/\d+(?:-|$)/.test(new URL(url).pathname)
    )
      dates.set(sourceIdentity(url), comparisonDate(date?.['listingDate'], researchedAt));
  }
  const comparisons: Comparison[] = [];
  const seen = new Set<string>();
  for (const raw of parsed['comparisons'].slice(0, 24)) {
    const entry = record(raw);
    const url = safeSource(entry?.['url']);
    const identity = url ? sourceIdentity(url) : '';
    const duplicateIdentity =
      identity.startsWith('vinted:') || !url
        ? identity
        : new URL(url).origin + new URL(url).pathname.replace(/\/$/, '');
    if (
      !entry ||
      !url ||
      !sources.has(identity) ||
      (listingUrl && identity === sourceIdentity(listingUrl)) ||
      seen.has(duplicateIdentity) ||
      entry['currency'] !== 'EUR' ||
      typeof entry['sameVariant'] !== 'boolean' ||
      typeof entry['price'] !== 'number' ||
      !Number.isFinite(entry['price']) ||
      entry['price'] <= 0 ||
      entry['price'] > 100000 ||
      typeof entry['title'] !== 'string' ||
      typeof entry['evidence'] !== 'string' ||
      !entry['evidence'].trim() ||
      !['manufacturer', 'retail', 'sold', 'asking'].includes(String(entry['kind']))
    )
      continue;
    seen.add(duplicateIdentity);
    const proposedMatch = entry['match'] ?? (entry['sameVariant'] ? 'model' : 'different');
    const match: Comparison['match'] =
      proposedMatch === 'model' && entry['sameVariant'] && confidence !== 'unknown'
        ? 'model'
        : proposedMatch === 'category'
          ? 'category'
          : 'different';
    const kind = entry['kind'] as Comparison['kind'];
    comparisons.push({
      title: entry['title'].slice(0, 200),
      url: sources.get(identity)!,
      kind,
      price: entry['price'],
      evidence: humanText(entry['evidence']).slice(0, 600),
      sameVariant: match === 'model',
      match,
      ...(['sold', 'asking'].includes(kind)
        ? { listingDate: dates.get(identity) ?? comparisonDate(null, researchedAt) }
        : {}),
    });
  }
  const used = comparisons.filter((entry) => ['sold', 'asking'].includes(entry.kind));
  const inScope = used.filter((entry) => entry.listingDate?.status !== 'outside_window');
  const comparisonBasis =
    inScope.some((entry) => entry.match === 'model') ||
    (!inScope.some((entry) => entry.match === 'category') && confidence !== 'unknown')
      ? 'model'
      : 'category';
  const matching = inScope.filter((entry) => entry.match === comparisonBasis);
  const prices = (entries: Comparison[], kind: Comparison['kind']) =>
    entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.price)
      .sort((a, b) => a - b);
  const verified = matching.filter((entry) => entry.listingDate?.status === 'within_window');
  const sold = prices(verified, 'sold');
  const asking = prices(verified, 'asking');
  const newPrices = comparisons
    .filter((entry) => ['manufacturer', 'retail'].includes(entry.kind) && entry.match === 'model')
    .map((entry) => entry.price);
  const round = (value: number) => Math.round(value * 100) / 100;
  const average = (values: number[]) =>
    values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const base = sold.length >= 3 ? sold : asking.length >= 3 ? asking : [];
  const basis = sold.length >= 3 ? 'sold' : 'asking';
  const range = (values: number[]) => ({
    low: round(values[Math.floor((values.length - 1) * 0.25)]),
    high: round(values[Math.ceil((values.length - 1) * 0.75)]),
    count: values.length,
  });
  // Angebotsspannen bleiben Angebotsspannen; ein pauschaler Rabatt wäre kein Marktbeleg.
  const resale = base.length >= 3 ? { ...range(base), basis: basis as 'sold' | 'asking' } : null;
  const currentSold = prices(matching, 'sold');
  const currentAsking = prices(matching, 'asking');
  const currentBasis = currentSold.length >= 3 || !currentAsking.length ? 'sold' : 'asking';
  const currentPrices = currentBasis === 'sold' ? currentSold : currentAsking;
  const currentMarket: Analysis['currentMarket'] = currentPrices.length
    ? { ...range(currentPrices), basis: currentBasis as 'sold' | 'asking', match: comparisonBasis }
    : null;
  return {
    modelName,
    confidence,
    evidence: humanText(parsed['evidence']).slice(0, 2500),
    comparisons,
    comparisonBasis,
    marketWindow: {
      days: 30,
      checkedAt: researchedAt === null ? '' : new Date(researchedAt).toISOString(),
      verifiedCount: verified.length,
      undatedCount: matching.filter((entry) => entry.listingDate?.status === 'unknown').length,
      excludedCount: used.filter((entry) => entry.listingDate?.status === 'outside_window').length,
    },
    currentMarket,
    soldAverage: average(sold),
    askingAverage: average(asking),
    newPriceRange: newPrices.length
      ? {
          low: Math.min(...newPrices),
          high: Math.max(...newPrices),
          count: newPrices.length,
        }
      : null,
    research,
    resale,
  };
}
export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['modelName', 'confidence', 'evidence', 'comparisons'],
  properties: {
    modelName: { type: 'string' },
    confidence: { type: 'string', enum: ['exact', 'likely', 'unknown'] },
    evidence: { type: 'string' },
    comparisons: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url', 'kind', 'price', 'currency', 'sameVariant', 'match', 'evidence'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          kind: { type: 'string', enum: ['manufacturer', 'retail', 'sold', 'asking'] },
          price: { type: 'number' },
          currency: { type: 'string' },
          sameVariant: { type: 'boolean' },
          match: { type: 'string', enum: ['model', 'category', 'different'] },
          evidence: { type: 'string' },
        },
      },
    },
  },
};
