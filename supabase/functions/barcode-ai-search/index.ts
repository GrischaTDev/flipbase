import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const EAN_MODEL = 'gpt-6-luna';
const PHOTO_MODEL = 'gpt-6-sol';
const MAX_IMAGE_DATA_LENGTH = 7_000_000;
const MAX_IMAGES = 5;
const MAX_TOTAL_IMAGE_DATA_LENGTH = 21_000_000;
const ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get('BARCODE_AI_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200,http://127.0.0.1:4200,http://localhost'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

interface SearchRequest {
  ean?: unknown;
  imageDataUrl?: unknown;
  imageDataUrls?: unknown;
  additionalImageDataUrls?: unknown;
}

interface Candidate {
  title: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  category: string;
  sourceUrl: string;
  confidence: 'exact' | 'likely' | 'weak';
  evidence: string;
}

interface LabelSuggestion {
  title: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  category: string;
  articleNumber: string;
}

interface VisualSuggestion extends LabelSuggestion {
  evidence: string;
}

interface SearchResult {
  candidates: Candidate[];
  labelSuggestion: LabelSuggestion | null;
  visualSuggestion: VisualSuggestion | null;
  processedPhotoCount?: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    webSearchCalls: number;
    estimatedCostUsd: number;
  };
}

export interface BarcodeAiDependencies {
  authenticate(token: string): Promise<{ id: string } | null>;
  isOperator(userId: string): Promise<boolean>;
  isConfigured(): boolean;
  search(ean: string, imageDataUrls: readonly string[]): Promise<SearchResult>;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function respond(value: unknown, status: number, origin: string | null): Response {
  return Response.json(value, { status, headers: corsHeaders(origin) });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeDisplayText(value: string, brand = ''): string {
  const trimmed = value.trim();
  if (!/[\p{L}]/u.test(trimmed) || trimmed !== trimmed.toLocaleUpperCase('de-DE')) return trimmed;
  return trimmed.replace(/[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*/gu, (word) => {
    if (brand && word.toLocaleLowerCase('de-DE') === brand.toLocaleLowerCase('de-DE')) return brand;
    if (/\d/u.test(word) || /^(?:EAN|EU|US|UK|GTX|SKU)$/u.test(word)) return word;
    if (/^[A-Z]{1,3}(?:-[A-Z]{1,4})+$/u.test(word)) return word;
    return word
      .toLocaleLowerCase('de-DE')
      .replace(/(^|[-/])\p{L}/gu, (part) => part.toLocaleUpperCase('de-DE'));
  });
}

export function normalizeEuSize(value: string, category = ''): string {
  const size = value.trim();
  const shoe = /schuh|sneaker|stiefel|boot/iu.test(category);
  const explicitEu =
    size.match(/\b(?:EU|EUR)\s*[:.-]?\s*(\d{2}(?:[.,]5)?)\b/iu) ??
    size.match(/\b(\d{2}(?:[.,]5)?)\s*(?:EU|EUR)\b/iu);
  const bare =
    size.match(/^(\d{2}(?:[.,]5)?)$/u) ??
    size.match(/^(\d{2}(?:[.,]5)?)\s*\/\s*(?:UK\s*)?\d(?:[.,]5)?$/iu);
  const selected = explicitEu?.[1] ?? bare?.[1];
  if (selected) {
    const numeric = Number(selected.replace(',', '.'));
    if (numeric >= 20 && numeric <= 55) return selected.replace(',', '.');
  }
  return shoe || /\b(?:US|UK|EU|EUR)\s*\d/iu.test(size) || /^\d/u.test(size) ? '' : size;
}

function validSourceUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function sourceKey(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host.toLowerCase().replace(/^www\./u, '')}${parsed.pathname.replace(/\/$/u, '')}`;
}

function parseModelContent(response: Record<string, unknown>): Record<string, unknown> | null {
  const output = Array.isArray(response['output']) ? response['output'] : [];
  let resultText = '';
  for (const itemValue of output) {
    const item = record(itemValue);
    if (item?.['type'] !== 'message') continue;
    for (const contentValue of Array.isArray(item['content']) ? item['content'] : []) {
      const content = record(contentValue);
      if (content?.['type'] === 'output_text') resultText += text(content['text']);
    }
  }
  if (!resultText) return null;
  try {
    return record(JSON.parse(resultText));
  } catch {
    return null;
  }
}

export function parseCandidates(response: Record<string, unknown>): Candidate[] {
  const output = Array.isArray(response['output']) ? response['output'] : [];
  const sourceUrls = new Set<string>();
  for (const itemValue of output) {
    const item = record(itemValue);
    if (!item) continue;
    if (item['type'] === 'web_search_call') {
      const action = record(item['action']);
      for (const sourceValue of Array.isArray(action?.['sources']) ? action['sources'] : []) {
        const url = validSourceUrl(record(sourceValue)?.['url']);
        if (url) sourceUrls.add(sourceKey(url));
      }
      for (const resultValue of Array.isArray(item['results']) ? item['results'] : []) {
        const result = record(resultValue);
        if (result?.['type'] !== 'image_result') continue;
        const url = validSourceUrl(result['source_website_url']);
        if (url) sourceUrls.add(sourceKey(url));
      }
    }
    if (item['type'] === 'message') {
      for (const contentValue of Array.isArray(item['content']) ? item['content'] : []) {
        const content = record(contentValue);
        for (const annotationValue of Array.isArray(content?.['annotations'])
          ? content['annotations']
          : []) {
          const annotation = record(annotationValue);
          if (annotation?.['type'] !== 'url_citation') continue;
          const url = validSourceUrl(annotation['url']);
          if (url) sourceUrls.add(sourceKey(url));
        }
      }
    }
  }
  if (sourceUrls.size === 0) return [];
  const parsed = parseModelContent(response);
  const candidates = Array.isArray(parsed?.['candidates']) ? parsed['candidates'] : [];
  return candidates
    .flatMap((value): Candidate[] => {
      const candidate = record(value);
      const brand = text(candidate?.['brand']).slice(0, 100);
      const title = normalizeDisplayText(text(candidate?.['title']), brand);
      const sourceUrl = validSourceUrl(candidate?.['sourceUrl']);
      if (!title || !sourceUrl || !sourceUrls.has(sourceKey(sourceUrl))) return [];
      const confidence = candidate?.['confidence'];
      return [
        {
          title: title.slice(0, 200),
          brand,
          model: normalizeDisplayText(text(candidate?.['model'])).slice(0, 100),
          size: normalizeEuSize(text(candidate?.['size']), text(candidate?.['category'])),
          color: normalizeDisplayText(text(candidate?.['color'])).slice(0, 100),
          category: normalizeDisplayText(text(candidate?.['category'])).slice(0, 100),
          sourceUrl,
          confidence: confidence === 'exact' || confidence === 'likely' ? confidence : 'weak',
          evidence: text(candidate?.['evidence']).slice(0, 250),
        },
      ];
    })
    .slice(0, 5);
}

export function parseLabelSuggestion(response: Record<string, unknown>): LabelSuggestion | null {
  const suggestion = record(parseModelContent(response)?.['labelSuggestion']);
  if (!suggestion) return null;
  const brand = text(suggestion['brand']).slice(0, 100);
  const model = text(suggestion['model']).slice(0, 100);
  const title = normalizeDisplayText(
    text(suggestion['title']) || [brand, model].filter(Boolean).join(' '),
    brand,
  ).slice(0, 200);
  if (!title) return null;
  return {
    title,
    brand,
    model: normalizeDisplayText(model),
    size: normalizeEuSize(text(suggestion['size']), text(suggestion['category'])),
    color: normalizeDisplayText(text(suggestion['color'])).slice(0, 100),
    category: normalizeDisplayText(text(suggestion['category'])).slice(0, 100),
    articleNumber: text(suggestion['articleNumber']).slice(0, 100),
  };
}

export function parseVisualSuggestion(response: Record<string, unknown>): VisualSuggestion | null {
  const suggestion = record(parseModelContent(response)?.['visualSuggestion']);
  if (!suggestion) return null;
  const brand = text(suggestion['brand']).slice(0, 100);
  const model = text(suggestion['model']).slice(0, 100);
  const title = normalizeDisplayText(
    text(suggestion['title']) || [brand, model].filter(Boolean).join(' '),
    brand,
  ).slice(0, 200);
  if (!title || (!brand && !model)) return null;
  return {
    title,
    brand,
    model: normalizeDisplayText(model),
    size: normalizeEuSize(text(suggestion['size']), text(suggestion['category'])),
    color: normalizeDisplayText(text(suggestion['color'])).slice(0, 100),
    category: normalizeDisplayText(text(suggestion['category'])).slice(0, 100),
    articleNumber: text(suggestion['articleNumber']).slice(0, 100),
    evidence: text(suggestion['evidence']).slice(0, 250),
  };
}

export function estimateCostUsd(
  usage: Record<string, unknown>,
  webSearchCalls: number,
  model: string = EAN_MODEL,
): number {
  const inputTokens = Number(usage['input_tokens']) || 0;
  const outputTokens = Number(usage['output_tokens']) || 0;
  const cachedTokens = Number(record(usage['input_tokens_details'])?.['cached_tokens']) || 0;
  // Standardpreise vom 25.09.2026. Angezeigter Wert ist eine Schaetzung.
  const prices =
    model === PHOTO_MODEL
      ? { input: 2, cached: 0.2, output: 10 }
      : { input: 0.1, cached: 0.01, output: 0.5 };
  const amount =
    (Math.max(0, inputTokens - cachedTokens) * prices.input +
      cachedTokens * prices.cached +
      outputTokens * prices.output) /
      1_000_000 +
    webSearchCalls * 0.01;
  return Math.round(amount * 1_000_000) / 1_000_000;
}

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          brand: { type: 'string' },
          model: { type: 'string' },
          size: { type: 'string' },
          color: { type: 'string' },
          category: { type: 'string' },
          sourceUrl: { type: 'string' },
          confidence: { type: 'string', enum: ['exact', 'likely', 'weak'] },
          evidence: { type: 'string' },
        },
        required: [
          'title',
          'brand',
          'model',
          'size',
          'color',
          'category',
          'sourceUrl',
          'confidence',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
    labelSuggestion: {
      type: ['object', 'null'],
      properties: {
        title: { type: 'string' },
        brand: { type: 'string' },
        model: { type: 'string' },
        size: { type: 'string' },
        color: { type: 'string' },
        category: { type: 'string' },
        articleNumber: { type: 'string' },
      },
      required: ['title', 'brand', 'model', 'size', 'color', 'category', 'articleNumber'],
      additionalProperties: false,
    },
    visualSuggestion: {
      type: ['object', 'null'],
      properties: {
        title: { type: 'string' },
        brand: { type: 'string' },
        model: { type: 'string' },
        size: { type: 'string' },
        color: { type: 'string' },
        category: { type: 'string' },
        articleNumber: { type: 'string' },
        evidence: { type: 'string' },
      },
      required: [
        'title',
        'brand',
        'model',
        'size',
        'color',
        'category',
        'articleNumber',
        'evidence',
      ],
      additionalProperties: false,
    },
  },
  required: ['candidates', 'labelSuggestion', 'visualSuggestion'],
  additionalProperties: false,
};

export function createBarcodeAiHandler(dependencies: BarcodeAiDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (origin && !ALLOWED_ORIGINS.has(origin))
      return respond({ error: 'forbidden_origin' }, 403, origin);
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405, origin);
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return respond({ error: 'unauthorized' }, 401, origin);
    try {
      const user = await dependencies.authenticate(token);
      if (!user) return respond({ error: 'unauthorized' }, 401, origin);
      if (!(await dependencies.isOperator(user.id)))
        return respond({ error: 'forbidden' }, 403, origin);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503, origin);
    }

    let body: SearchRequest;
    try {
      body = (await request.json()) as SearchRequest;
    } catch {
      return respond({ error: 'invalid_body' }, 400, origin);
    }
    const ean = text(body?.ean);
    if (body?.additionalImageDataUrls !== undefined && !Array.isArray(body.additionalImageDataUrls))
      return respond({ error: 'invalid_input' }, 400, origin);
    const imageDataUrls = Array.isArray(body?.additionalImageDataUrls)
      ? [
          ...(body?.imageDataUrl == null ? [] : [body.imageDataUrl]),
          ...body.additionalImageDataUrls,
        ]
      : Array.isArray(body?.imageDataUrls)
        ? body.imageDataUrls
        : body?.imageDataUrl == null
          ? []
          : [body.imageDataUrl];
    if (
      (!ean && imageDataUrls.length === 0) ||
      (ean !== '' && !/^\d{8,14}$/u.test(ean)) ||
      imageDataUrls.length > MAX_IMAGES ||
      imageDataUrls.some(
        (image) =>
          typeof image !== 'string' ||
          image.length > MAX_IMAGE_DATA_LENGTH ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u.test(image),
      ) ||
      imageDataUrls.reduce<number>((total, image) => total + String(image).length, 0) >
        MAX_TOTAL_IMAGE_DATA_LENGTH
    ) {
      return respond({ error: 'invalid_input' }, 400, origin);
    }
    if (!dependencies.isConfigured()) return respond({ error: 'not_configured' }, 503, origin);
    try {
      const result = await dependencies.search(ean, imageDataUrls as string[]);
      return respond({ ...result, processedPhotoCount: imageDataUrls.length }, 200, origin);
    } catch (error) {
      console.error('barcode-ai-search: OpenAI-Abfrage fehlgeschlagen.', error);
      return respond({ error: 'search_failed' }, 502, origin);
    }
  };
}

function createProductionDependencies(): BarcodeAiDependencies {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Supabase-Konfiguration fehlt.');
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const userClient = (token: string) =>
    createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  return {
    isConfigured: () => Boolean(Deno.env.get('OPENAI_API_KEY')),
    async authenticate(token) {
      const { data, error } = await userClient(token).auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async isOperator(userId) {
      const { data, error } = await serviceClient
        .from('platform_operators')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async search(ean, imageDataUrls) {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OpenAI-Zugang fehlt.');
      const photoSearch = imageDataUrls.length > 0;
      const model = photoSearch ? PHOTO_MODEL : EAN_MODEL;
      const searchInstructions = photoSearch
        ? `${ean ? `Gescannte EAN/GTIN: ${ean}. ` : 'Es wurde keine EAN angegeben. '}Alle Fotos zeigen dasselbe Produkt aus verschiedenen Blickwinkeln. Lies zuerst Karton, Etikett und Produkt zusammen. ` +
          'Trage nur sichtbar lesbare Marke, Modell, Herstellerartikelnummer, Farbe und Größe in labelSuggestion ein; fehlende Angaben bleiben leer. Leite die Kategorie aus der erkennbaren Produktart ab. ' +
          'Wenn nichts lesbar ist, gib labelSuggestion als null zurück. ' +
          'Erkenne für die Websuche zusätzlich sichtbare Logos, Form, Farbkombinationen und markante Details. Suche mit mehreren Varianten nach Marke, Modell, Artikelnummer und Beschreibung der sichtbaren Merkmale; die EAN allein liefert oft keine Treffer. ' +
          'Wenn du das Produkt anhand der Fotos sinnvoll erkennen kannst, aber keine belegte Produktseite findest, gib eine getrennte visualSuggestion mit kurzer Begründung aus. Diese darf eine vorsichtige Modellvermutung enthalten, muss aber als unbelegt erkennbar bleiben. Ist selbst die Marke oder das Modell unklar, gib null zurück. ' +
          'Bei Schuhen gib als Größe ausschließlich eine auf dem Foto oder der Produktseite belegte EU-Größe aus; rechne US/UK nicht um. Erfinde keine Artikelnummer. '
        : `Gescannte EAN/GTIN: ${ean}. Suche nach genau diesem Produkt im Web. ` +
          'Gib labelSuggestion und visualSuggestion als null zurück. ';
      const content: Record<string, unknown>[] = [
        {
          type: 'input_text',
          text:
            searchInstructions +
            'Gib höchstens fünf konkrete Produktvarianten als candidates zurück, aber nur mit tatsächlich gefundenen Produktseiten als Quelle. ' +
            'Behaupte eine exakte EAN-Zuordnung nur, wenn die Quelle diese EAN sichtbar nennt. ' +
            'Bei unsicherer Variante markiere likely oder weak. Kandidaten brauchen eine konkrete gefundene Produktseite. Keine erfundenen Daten oder URLs.',
        },
      ];
      for (const imageDataUrl of imageDataUrls)
        content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'high' });
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: 'low' },
          input: [{ role: 'user', content }],
          tools: [
            photoSearch
              ? {
                  type: 'web_search',
                  search_context_size: 'high',
                  search_content_types: ['image', 'text'],
                  image_settings: { max_results: 4, caption: true },
                }
              : { type: 'web_search', search_context_size: 'medium' },
          ],
          tool_choice: 'required',
          max_tool_calls: photoSearch ? 4 : 2,
          max_output_tokens: photoSearch ? 5000 : 1800,
          include: photoSearch
            ? ['web_search_call.action.sources', 'web_search_call.results']
            : ['web_search_call.action.sources'],
          text: {
            format: {
              type: 'json_schema',
              name: 'barcode_product_candidates',
              strict: true,
              schema: SEARCH_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(photoSearch ? 90_000 : 45_000),
      });
      if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
      const result = record(await response.json());
      if (!result || result['status'] !== 'completed' || !parseModelContent(result)) {
        throw new Error('OpenAI-Antwort unvollständig.');
      }
      const output = Array.isArray(result['output']) ? result['output'] : [];
      const webSearchCalls = output.filter(
        (item) => record(item)?.['type'] === 'web_search_call',
      ).length;
      const usage = record(result['usage']) ?? {};
      const candidates = parseCandidates(result);
      const labelSuggestion = photoSearch ? parseLabelSuggestion(result) : null;
      const visualSuggestion = photoSearch ? parseVisualSuggestion(result) : null;
      const proposedCandidates = parseModelContent(result)?.['candidates'];
      console.info('barcode-ai-search: Suche abgeschlossen.', {
        photoCount: imageDataUrls.length,
        webSearchCalls,
        proposedCandidateCount: Array.isArray(proposedCandidates) ? proposedCandidates.length : 0,
        candidateCount: candidates.length,
        labelSuggestion: Boolean(labelSuggestion),
        visualSuggestion: Boolean(visualSuggestion),
      });
      return {
        candidates,
        labelSuggestion,
        visualSuggestion,
        usage: {
          inputTokens: Number(usage['input_tokens']) || 0,
          outputTokens: Number(usage['output_tokens']) || 0,
          webSearchCalls,
          estimatedCostUsd: estimateCostUsd(usage, webSearchCalls, model),
        },
      };
    },
  };
}

if (import.meta.main) Deno.serve(createBarcodeAiHandler(createProductionDependencies()));
