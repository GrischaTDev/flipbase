export interface VintedBrand {
  id: number;
  name: string;
}

export type VintedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export async function searchVintedBrands(
  keyword: string,
  fetchFn: VintedFetch = fetch,
): Promise<VintedBrand[]> {
  const baseUrl = 'https://www.vinted.de/';
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
  const homepage = await fetchFn(baseUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(10_000),
  });
  if (!homepage.ok) throw new Error(`Vinted homepage HTTP ${homepage.status}`);

  // Vinted setzt denselben Cookie-Namen mehrfach. Der letzte gueltige Wert
  // gewinnt; abgelaufene Cookies werden nicht an die Suche weitergegeben.
  const cookies = new Map<string, string>();
  for (const raw of homepage.headers.getSetCookie()) {
    const [pair, ...attributes] = raw.split(';');
    if (!pair) continue;
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const maxAge = attributes.find((attribute) => /^\s*max-age=/iu.test(attribute));
    if (!value || (maxAge && Number(maxAge.split('=')[1]) <= 0)) cookies.delete(name);
    else cookies.set(name, value);
  }

  const url = new URL('/api/v2/brands', baseUrl);
  if (keyword) url.searchParams.set('keyword', keyword);
  const response = await fetchFn(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
      Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Vinted brands HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload['brands'])) {
    throw new Error('Vinted brands response is invalid');
  }

  const brands: VintedBrand[] = [];
  const seen = new Set<number>();
  for (const value of payload['brands']) {
    if (!isRecord(value)) continue;
    const id = value['id'];
    const title = value['title'];
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof title !== 'string' ||
      !title.trim() ||
      seen.has(id)
    )
      continue;
    brands.push({ id, name: title.trim() });
    seen.add(id);
    if (brands.length >= 20) break;
  }
  return brands;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
