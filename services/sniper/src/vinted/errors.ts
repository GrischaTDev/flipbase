export type ErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'server_error'
  | 'network_error'
  | 'parser_error'
  | 'http_error';

export type ErrorPhase = 'request' | 'body' | 'parse';

export interface VintedErrorContext {
  phase?: ErrorPhase;
  status?: number;
  queryId?: string;
  runId?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  responseSample?: string;
}

export class VintedCollectorError extends Error {
  readonly kind: ErrorKind;
  readonly phase: ErrorPhase;
  readonly status?: number;
  readonly queryId?: string;
  readonly runId?: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly responseSample?: string;

  constructor(message: string, kind: ErrorKind, context: VintedErrorContext = {}) {
    super(message);
    this.name = 'VintedCollectorError';
    this.kind = kind;
    this.phase = context.phase ?? 'request';
    this.status = context.status;
    this.queryId = context.queryId;
    this.runId = context.runId;
    this.requestId = context.requestId;
    this.retryAfterSeconds = context.retryAfterSeconds;
    this.responseSample = context.responseSample
      ? sanitizeSample(context.responseSample)
      : undefined;
  }
}

export class RateLimitedError extends VintedCollectorError {
  constructor(message = 'Vinted rate limit reached', context: VintedErrorContext = {}) {
    super(message, 'rate_limited', { ...context, status: context.status ?? 429 });
    this.name = 'RateLimitedError';
  }
}

export class ForbiddenError extends VintedCollectorError {
  constructor(message = 'Vinted refused the request', context: VintedErrorContext = {}) {
    super(message, 'forbidden', { ...context, status: context.status ?? 403 });
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends VintedCollectorError {
  constructor(message = 'Vinted session is no longer accepted', context: VintedErrorContext = {}) {
    super(message, 'unauthorized', { ...context, status: context.status ?? 401 });
    this.name = 'UnauthorizedError';
  }
}

export class VintedTimeoutError extends VintedCollectorError {
  constructor(message = 'Vinted request timed out', context: VintedErrorContext = {}) {
    super(message, 'timeout', context);
    this.name = 'VintedTimeoutError';
  }
}

export class VintedServerError extends VintedCollectorError {
  constructor(status: number, message?: string, context: VintedErrorContext = {}) {
    super(message ?? `Vinted server error HTTP ${status}`, 'server_error', { ...context, status });
    this.name = 'VintedServerError';
  }
}

export class VintedNetworkError extends VintedCollectorError {
  constructor(message: string, context: VintedErrorContext = {}) {
    super(message, 'network_error', context);
    this.name = 'VintedNetworkError';
  }
}

export class VintedParserError extends VintedCollectorError {
  constructor(message: string, context: VintedErrorContext = {}) {
    super(message, 'parser_error', { ...context, phase: 'parse' });
    this.name = 'VintedParserError';
  }
}

export class VintedHttpError extends VintedCollectorError {
  constructor(status: number, message?: string, context: VintedErrorContext = {}) {
    super(message ?? `Vinted request failed with status ${status}`, 'http_error', {
      ...context,
      status,
    });
    this.name = 'VintedHttpError';
  }
}

export function parseRetryAfter(
  header: string | null | undefined,
  now: Date = new Date(),
): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;

  // Reject negative numbers or negative signed strings
  if (trimmed.startsWith('-')) return undefined;

  // RFC 9110: integer seconds
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }

  // Reject decimal numbers
  if (/^\d+\.\d+$/.test(trimmed)) return undefined;

  // RFC 9110: HTTP-date (e.g. Wed, 21 Oct 2026 07:28:00 GMT)
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    const diffSeconds = Math.ceil((timestamp - now.getTime()) / 1000);
    return diffSeconds >= 0 ? diffSeconds : 0;
  }

  return undefined;
}

export function sanitizeSample(text: string, maxLength = 200): string {
  let cleaned = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/(cookie|authorization|token|session|bearer|key)=[^;,\s&]+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '...';
  }
  return cleaned;
}
