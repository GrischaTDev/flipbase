import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('loadConfig', () => {
  it('keeps browser control private and the profile separate by default', () => {
    const config = loadConfig(validEnv);
    expect(config.browserHost).toBe('127.0.0.1');
    expect(config.browserPort).toBe(8081);
    expect(config.browserProfileDir).toBe('/var/lib/flipbase-sniper/browser');
    expect(config.browserCdpPort).toBe(9228);
    expect(() => loadConfig({ ...validEnv, SNIPER_BROWSER_HOST: '0.0.0.0' })).toThrow();
  });
  it('loads configurable request spacing and timeout', () => {
    const config = loadConfig({
      ...validEnv,
      SNIPER_REQUEST_MIN_INTERVAL_MS: '15000',
      SNIPER_REQUEST_TIMEOUT_MS: '30000',
    });
    expect(config.requestMinIntervalMs).toBe(15_000);
    expect(config.requestTimeoutMs).toBe(30_000);
  });
  it.each(['SNIPER_REQUEST_MIN_INTERVAL_MS', 'SNIPER_REQUEST_TIMEOUT_MS'])(
    'rejects unsafe %s',
    (key) => {
      expect(() => loadConfig({ ...validEnv, [key]: '0' })).toThrow();
    },
  );
  it('applies documented defaults', () => {
    const config = loadConfig(validEnv);

    expect(config.vintedBaseUrl).toBe('https://www.vinted.de');
    expect(config.requestsPerMinute).toBe(30);
    expect(config.tickIntervalMs).toBe(5000);
    expect(config.categoryMaxAgeMs).toBe(86_400_000);
  });

  it('rejects a missing service role key', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow();
  });

  it('rejects a request budget below one per minute', () => {
    expect(() => loadConfig({ ...validEnv, SNIPER_REQUESTS_PER_MINUTE: '0' })).toThrow();
  });

  it('rejects a category age below one minute', () => {
    expect(() => loadConfig({ ...validEnv, SNIPER_CATEGORY_MAX_AGE_MS: '59000' })).toThrow();
  });
});
