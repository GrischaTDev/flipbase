import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  parseRetryAfter,
  RateLimitedError,
  sanitizeSample,
  UnauthorizedError,
  VintedHttpError,
  VintedNetworkError,
  VintedParserError,
  VintedServerError,
  VintedTimeoutError,
} from '../../src/vinted/errors.js';

describe('VintedCollectorError and subclasses', () => {
  it('instantiates RateLimitedError with defaults and context', () => {
    const error = new RateLimitedError('Too many requests', {
      phase: 'request',
      status: 429,
      queryId: 'q-1',
      retryAfterSeconds: 60,
    });
    expect(error.kind).toBe('rate_limited');
    expect(error.status).toBe(429);
    expect(error.phase).toBe('request');
    expect(error.queryId).toBe('q-1');
    expect(error.retryAfterSeconds).toBe(60);
    expect(error.name).toBe('RateLimitedError');
  });

  it('instantiates ForbiddenError with status 403', () => {
    const error = new ForbiddenError('Refused');
    expect(error.kind).toBe('forbidden');
    expect(error.status).toBe(403);
    expect(error.phase).toBe('request');
  });

  it('instantiates UnauthorizedError with status 401', () => {
    const error = new UnauthorizedError('Session expired');
    expect(error.kind).toBe('unauthorized');
    expect(error.status).toBe(401);
  });

  it('instantiates VintedTimeoutError', () => {
    const error = new VintedTimeoutError('Read timeout', { phase: 'body' });
    expect(error.kind).toBe('timeout');
    expect(error.phase).toBe('body');
  });

  it('instantiates VintedServerError for 502/503/504', () => {
    const error = new VintedServerError(503, 'Gateway unavailable');
    expect(error.kind).toBe('server_error');
    expect(error.status).toBe(503);
  });

  it('instantiates VintedNetworkError', () => {
    const error = new VintedNetworkError('ECONNRESET');
    expect(error.kind).toBe('network_error');
  });

  it('instantiates VintedParserError', () => {
    const error = new VintedParserError('Malformed JSON');
    expect(error.kind).toBe('parser_error');
    expect(error.phase).toBe('parse');
  });

  it('instantiates generic VintedHttpError', () => {
    const error = new VintedHttpError(418, "I'm a teapot");
    expect(error.kind).toBe('http_error');
    expect(error.status).toBe(418);
  });
});

describe('parseRetryAfter', () => {
  it('returns undefined for empty/null/undefined headers', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('   ')).toBeUndefined();
  });

  it('parses valid integer seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('  60  ')).toBe(60);
  });

  it('rejects invalid or negative numbers', () => {
    expect(parseRetryAfter('-10')).toBeUndefined();
    expect(parseRetryAfter('abc')).toBeUndefined();
    expect(parseRetryAfter('12.5')).toBeUndefined();
  });

  it('parses valid HTTP-Date in the future', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const futureDate = 'Tue, 15 Sep 2026 12:02:00 GMT'; // +120s
    expect(parseRetryAfter(futureDate, now)).toBe(120);
  });

  it('returns 0 for valid HTTP-Date in the past', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const pastDate = 'Tue, 15 Sep 2026 11:59:00 GMT'; // -60s
    expect(parseRetryAfter(pastDate, now)).toBe(0);
  });

  it('rejects invalid date string', () => {
    expect(parseRetryAfter('not a date string')).toBeUndefined();
  });
});

describe('sanitizeSample', () => {
  it('strips script tags', () => {
    const raw = '<div>Hello <script>alert("hack")</script> world</div>';
    expect(sanitizeSample(raw)).toBe('<div>Hello world</div>');
  });

  it('redacts tokens, cookies, auth headers', () => {
    const raw = 'error occurred token=abc123secret cookie=session_id;xyz bearer=my-token';
    const sanitized = sanitizeSample(raw);
    expect(sanitized).not.toContain('abc123secret');
    expect(sanitized).not.toContain('session_id');
    expect(sanitized).toContain('token=[REDACTED]');
    expect(sanitized).toContain('cookie=[REDACTED]');
  });

  it('truncates samples longer than max length', () => {
    const raw = 'a'.repeat(300);
    const sanitized = sanitizeSample(raw, 50);
    expect(sanitized.length).toBe(53); // 50 + '...'
    expect(sanitized.endsWith('...')).toBe(true);
  });
});
