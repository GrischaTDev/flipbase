import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(validEnv);

    expect(config.vintedBaseUrl).toBe('https://www.vinted.de');
    expect(config.requestsPerMinute).toBe(30);
    expect(config.tickIntervalMs).toBe(5000);
  });

  it('rejects a missing service role key', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow();
  });

  it('rejects a request budget below one per minute', () => {
    expect(() => loadConfig({ ...validEnv, SNIPER_REQUESTS_PER_MINUTE: '0' })).toThrow();
  });
});
