import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';

const scope = {
  workspaceId: '25600000-0000-4000-8000-000000000011',
  connectionId: '25600000-0000-4000-8000-000000000021',
};
const id = '25600000-0000-4000-8000-000000000031';
const api = new MarketplaceBrowserTestApiService();

afterEach(() => vi.unstubAllGlobals());

describe('Browser-Test-API', () => {
  it('erkennt die SPA-Antwort nicht als aktiven Browserdienst', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>App</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    expect(await api.available()).toBe(false);
  });

  it('sendet nur den angemeldeten Token und den gewählten Kontobezug', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id }, { status: 201 }));
    vi.stubGlobal('fetch', request);
    expect(await api.open(scope, 'user-test-token')).toBe(id);
    const [path, options] = request.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/marketplace-browser/sessions');
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer user-test-token');
    expect(JSON.parse(String(options.body))).toEqual(scope);
  });

  it('verwirft eine übergroße Bildantwort', async () => {
    const bytes = new Uint8Array(512 * 1024 + 1);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } })),
    );
    await expect(api.frame(scope, id, 'user-test-token')).rejects.toThrow('ungültig');
  });
});
