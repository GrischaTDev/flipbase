export const MODEL_PRICES = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
} as const;
export type SearchModel = keyof typeof MODEL_PRICES;
export const PRICING_DATE = '2026-11-06';
export const PROMPT_VERSION = 'vinted-resale-1';
export interface Comparison {
  title: string;
  url: string;
  kind: 'manufacturer' | 'retail' | 'sold' | 'asking';
  price: number;
  evidence: string;
}
export interface Analysis {
  modelName: string;
  confidence: 'exact' | 'likely' | 'unknown';
  evidence: string;
  comparisons: Comparison[];
  soldAverage: number | null;
  askingAverage: number | null;
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
  const estimatedCostUsd =
    inputTokens === null || outputTokens === null || cachedInputTokens > inputTokens
      ? null
      : Math.round(
          (((inputTokens - cachedInputTokens) * pricing.input) / 1e6 +
            (cachedInputTokens * pricing.cached) / 1e6 +
            (outputTokens * pricing.output) / 1e6 +
            webSearchCalls * pricing.webSearch) *
            1e8,
        ) / 1e8;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    webSearchCalls,
    estimatedCostUsd,
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
export function parseAnalysis(result: Record<string, unknown>): Analysis {
  if (result['status'] !== 'completed' || !Array.isArray(result['output']))
    throw new Error('incomplete_response');
  const sources = new Set<string>();
  const texts: string[] = [];
  let searches = 0;
  const addSource = (value: unknown) => {
    const url = safeSource(value);
    if (url) sources.add(url);
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
  const comparisons: Comparison[] = [];
  const seen = new Set<string>();
  for (const raw of parsed['comparisons'].slice(0, 12)) {
    const entry = record(raw);
    const url = safeSource(entry?.['url']);
    const sourceIdentity = url
      ? new URL(url).origin + new URL(url).pathname.replace(/\/$/, '')
      : '';
    if (
      !entry ||
      !url ||
      !sources.has(url) ||
      seen.has(sourceIdentity) ||
      entry['currency'] !== 'EUR' ||
      entry['sameVariant'] !== true ||
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
    seen.add(sourceIdentity);
    comparisons.push({
      title: entry['title'].slice(0, 200),
      url,
      kind: entry['kind'] as Comparison['kind'],
      price: entry['price'],
      evidence: entry['evidence'].slice(0, 600),
    });
  }
  const prices = (kind: Comparison['kind']) =>
    comparisons
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.price)
      .sort((a, b) => a - b);
  const sold = prices('sold');
  const asking = prices('asking');
  const round = (value: number) => Math.round(value * 100) / 100;
  const average = (values: number[]) =>
    values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const modelName = parsed['modelName'].trim().slice(0, 200);
  const confidence: Analysis['confidence'] =
    parsed['confidence'] === 'exact' && (!modelName || !parsed['evidence'].trim())
      ? 'unknown'
      : (parsed['confidence'] as Analysis['confidence']);
  const base = sold.length >= 3 ? sold : asking.length >= 3 ? asking : [];
  const basis = sold.length >= 3 ? 'sold' : 'asking';
  // Angebotswerte sind keine Verkäufe: vorsichtiger Abschlag, sichtbar getrennt.
  const resale =
    confidence === 'exact' && base.length >= 3
      ? {
          low: round(base[Math.floor((base.length - 1) * 0.25)] * (basis === 'asking' ? 0.7 : 1)),
          high: round(base[Math.ceil((base.length - 1) * 0.75)] * (basis === 'asking' ? 0.85 : 1)),
          basis: basis as 'sold' | 'asking',
          count: base.length,
        }
      : null;
  return {
    modelName,
    confidence,
    evidence: parsed['evidence'].slice(0, 1200),
    comparisons,
    soldAverage: average(sold),
    askingAverage: average(asking),
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
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url', 'kind', 'price', 'currency', 'sameVariant', 'evidence'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          kind: { type: 'string', enum: ['manufacturer', 'retail', 'sold', 'asking'] },
          price: { type: 'number' },
          currency: { type: 'string' },
          sameVariant: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
  },
};
