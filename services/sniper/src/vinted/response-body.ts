import { VintedParserError } from './errors.js';

export const MAX_VINTED_PAGE_BYTES = 8 * 1024 * 1024;

export function assertPageSize(text: string): void {
  if (
    text.length > MAX_VINTED_PAGE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_VINTED_PAGE_BYTES
  ) {
    throw new VintedParserError('Vinted page exceeds the response size limit');
  }
}

export function parseBoundedPageJson(text: string): unknown {
  assertPageSize(text);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === '[' || character === '{') {
      depth += 1;
      if (depth > 64) throw new VintedParserError('Vinted JSON exceeds the nesting limit');
    } else if (character === ']' || character === '}') depth -= 1;
  }
  return JSON.parse(text) as unknown;
}

/** Die tatsächlichen, bereits dekomprimierten Bytes zählen, auch ohne Content-Length. */
export async function readVintedPage(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VINTED_PAGE_BYTES) {
    await response.body?.cancel();
    throw new VintedParserError('Vinted page exceeds the response size limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_VINTED_PAGE_BYTES) {
        throw new VintedParserError('Vinted page exceeds the response size limit');
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
