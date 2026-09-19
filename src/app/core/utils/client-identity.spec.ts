import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalClientId, createSecureClientUuid } from './client-identity';

describe('client identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('erzeugt ohne randomUUID mit getRandomValues eine UUID der Version 4', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.set(Array.from({ length: values.length }, (_, index) => index));
        return values;
      },
    });

    expect(createSecureClientUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('verweigert eine sichere UUID ohne Browser-Zufallsquelle', () => {
    vi.stubGlobal('crypto', undefined);

    expect(() => createSecureClientUuid()).toThrow('sichere Browser-UUID');
  });

  it('nutzt ohne Browser-Zufallsquelle nur für kurzlebige Clientdaten eine temporäre Kennung', () => {
    vi.stubGlobal('crypto', undefined);

    expect(createLocalClientId('catalog')).toMatch(/^catalog-local-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });
});
