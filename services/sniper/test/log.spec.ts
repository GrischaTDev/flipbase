import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/log.js';

describe('createLogger', () => {
  it('formats log lines with level and event', () => {
    const sink = { log: vi.fn(), error: vi.fn() };
    const logger = createLogger(sink);

    logger.info('cycle_started', { query: 'q-1' });

    expect(sink.log).toHaveBeenCalledTimes(1);
    const line = sink.log.mock.calls[0]?.[0] as string;
    expect(line).toContain('info cycle_started query=q-1');
  });

  it('redacts sensitive keys such as cookie, token, authorization', () => {
    const sink = { log: vi.fn(), error: vi.fn() };
    const logger = createLogger(sink);

    logger.error('request_failed', {
      cookie: 'secret_cookie_val',
      authToken: 'secret_jwt_token',
      apiKey: 'secret_key_val',
      query: 'q-2',
    });

    const line = sink.error.mock.calls[0]?.[0] as string;
    expect(line).not.toContain('secret_cookie_val');
    expect(line).not.toContain('secret_jwt_token');
    expect(line).not.toContain('secret_key_val');
    expect(line).toContain('cookie=[REDACTED]');
    expect(line).toContain('authToken=[REDACTED]');
    expect(line).toContain('apiKey=[REDACTED]');
    expect(line).toContain('query=q-2');
  });

  it('truncates oversized values to prevent huge dumps', () => {
    const sink = { log: vi.fn(), error: vi.fn() };
    const logger = createLogger(sink);

    logger.error('dump_test', { sample: 'x'.repeat(400) });

    const line = sink.error.mock.calls[0]?.[0] as string;
    expect(line.length).toBeLessThan(350);
    expect(line).toContain('sample=');
    expect(line).toContain('...');
  });
});
