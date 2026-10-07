export class RequestBodyTooLargeError extends Error {}

/** Vor dem JSON-Parser tatsächlich gelesene UTF-8-Bytes begrenzen. */
export async function readLimitedJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body?.cancel();
    throw new RequestBodyTooLargeError('Request body too large');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestBodyTooLargeError('Request body too large');
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join('')) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
