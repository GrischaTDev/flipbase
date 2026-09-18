const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /loading chunk .+ failed/i,
  /chunkloaderror/i,
] as const;

const NESTED_ERROR_KEYS = ['cause', 'rejection', 'error', 'reason', 'ngOriginalError'] as const;

export function isStaleChunkLoadError(error: unknown): boolean {
  const visited = new Set<unknown>();

  function matches(value: unknown): boolean {
    if (value === null || value === undefined || visited.has(value)) return false;

    if (typeof value === 'string') {
      return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(value));
    }

    if (typeof value !== 'object') return false;
    visited.add(value);

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate['message'] === 'string' &&
      STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(candidate['message'] as string))
    ) {
      return true;
    }

    if (
      typeof candidate['name'] === 'string' &&
      STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(candidate['name'] as string))
    ) {
      return true;
    }

    return NESTED_ERROR_KEYS.some((key) => matches(candidate[key]));
  }

  return matches(error);
}
