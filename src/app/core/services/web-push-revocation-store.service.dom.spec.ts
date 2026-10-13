import '@angular/compiler';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebPushRevocationStoreService } from './web-push-revocation-store.service';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const subscription = { endpoint: 'https://web.push.apple.com/test', p256dh: 'key', auth: 'secret' };
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
describe('Durable device revocation', () => {
  it('persists the generation and hashes raw token bytes before registration', async () => {
    const store = new WebPushRevocationStoreService();
    const binding = await store.prepare(userId, sessionId, 'key1', subscription);
    expect(new WebPushRevocationStoreService().listBindings()).toEqual([binding]);
    const bytes = Uint8Array.from(binding.token.match(/../g) ?? [], (pair) => parseInt(pair, 16));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    expect(binding.tokenHash).toBe(hash);
    expect(JSON.stringify(binding)).not.toContain('access_token');
  });
  it('keeps failed revocation across restart and prevents late activation', async () => {
    const store = new WebPushRevocationStoreService();
    const binding = await store.prepare(userId, sessionId, 'key1', subscription);
    store.markForRevoke(userId);
    expect(store.confirm(binding.generationId)).toBe(false);
    expect(
      await store.flush(async () => {
        throw new Error('offline');
      }),
    ).toBe(false);
    const restarted = new WebPushRevocationStoreService();
    expect(restarted.listBindings()[0]?.state).toBe('revoke_pending');
    const revoke = vi.fn(async () => undefined);
    expect(await restarted.flush(revoke)).toBe(true);
    expect(revoke).toHaveBeenCalledWith(binding.generationId, binding.token);
    expect(store.confirm(binding.generationId)).toBe(false);
  });
  it('does not remove a new user generation when finishing an old logout', async () => {
    const store = new WebPushRevocationStoreService();
    const old = await store.prepare(userId, sessionId, 'key1', subscription);
    store.markForRevoke(userId);
    const next = await store.prepare(
      '33333333-3333-4333-8333-333333333333',
      sessionId,
      'key1',
      subscription,
    );
    await store.flush(async () => undefined);
    expect(store.listBindings().map((binding) => binding.generationId)).toEqual([
      next.generationId,
    ]);
    expect(store.confirm(old.generationId)).toBe(false);
  });
  it('reports storage failure without claiming persistence', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(
      new WebPushRevocationStoreService().prepare(userId, sessionId, 'key1', subscription),
    ).rejects.toThrow('full');
    vi.restoreAllMocks();
  });
});
