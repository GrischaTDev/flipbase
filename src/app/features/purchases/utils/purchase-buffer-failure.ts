export function isPermanentPurchaseFailure(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const failure = reason as {
    status?: unknown;
    code?: unknown;
    cause?: unknown;
    syncFehler?: { code?: unknown };
  };
  const code = failure.code ?? failure.syncFehler?.code;
  if (typeof code === 'string' && (/^(08|53|57|58)/.test(code) || /^PGRST00[0-3]$/.test(code)))
    return false;
  if (failure.status === 408 || failure.status === 429) return false;
  if (typeof failure.status === 'number' && failure.status >= 400 && failure.status < 500)
    return true;
  if (
    typeof code === 'string' &&
    (/^(22|23|28|42)/.test(code) || code === 'P0001' || /^PGRST[123]/.test(code))
  )
    return true;
  return failure.cause !== reason && isPermanentPurchaseFailure(failure.cause);
}
