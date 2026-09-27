import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserTestSessionEndedError,
  GoLoginApiLimitError,
  MarketplaceBrowserTestApiService,
} from './marketplace-browser-test-api.service';

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
    expect(await api.available()).toEqual({ available: false, readOnly: true });
  });

  it('übernimmt den lesenden Modus nur aus einer gültigen Dienstantwort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, readOnly: true })));
    expect(await api.available()).toEqual({ available: true, readOnly: true });
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

  it('erkennt den festen Code für das erreichte GoLogin-API-Limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ code: 'gologin_api_limit_reached' }, { status: 503 })),
    );
    await expect(api.open(scope, 'user-test-token')).rejects.toBeInstanceOf(GoLoginApiLimitError);
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

  it('erkennt eine serverseitig bestätigte beendete Sitzung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 410 })));
    await expect(api.frame(scope, id, 'user-test-token')).rejects.toBeInstanceOf(
      BrowserTestSessionEndedError,
    );
  });

  it('akzeptiert eine Identität nur für den angeforderten Workspace und das Konto', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        externalAccountId: '12345',
        username: 'my-vinted',
      }),
    );
    vi.stubGlobal('fetch', request);
    await expect(api.identify(scope, id, 'user-test-token')).resolves.toEqual({
      externalAccountId: '12345',
      username: 'my-vinted',
    });
    const [path] = request.mock.calls[0] as [string];
    expect(path).toBe(`/marketplace-browser/sessions/${id}/identify`);
    request.mockResolvedValueOnce(
      Response.json({
        workspaceId: scope.workspaceId,
        connectionId: '25600000-0000-4000-8000-000000000022',
        externalAccountId: '12345',
        username: 'my-vinted',
      }),
    );
    await expect(api.identify(scope, id, 'user-test-token')).rejects.toThrow();
  });
});

it('sendet Zugangsdaten nur im begrenzten Loginauftrag und behandelt Ablauf getrennt', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ status: 'submitted' }));
  vi.stubGlobal('fetch', request);
  await expect(
    api.login(scope, id, { username: 'synthetic', password: 'synthetic' }, 'token'),
  ).resolves.toBe('submitted');
  expect(request.mock.calls[0][0]).toBe(`/marketplace-browser/sessions/${id}/login`);
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    ...scope,
    credentials: { username: 'synthetic', password: 'synthetic' },
  });
  request.mockResolvedValueOnce(new Response(null, { status: 410 }));
  await expect(
    api.login(scope, id, { username: 'synthetic', password: 'synthetic' }, 'token'),
  ).rejects.toBeInstanceOf(BrowserTestSessionEndedError);
  request.mockResolvedValueOnce(Response.json({ status: 'unknown' }));
  await expect(
    api.login(scope, id, { username: 'synthetic', password: 'synthetic' }, 'token'),
  ).rejects.toThrow('Ungültige');
});

it('unterscheidet eine noch offene Anmeldung von einer bestätigten Identität', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 422 }));
  vi.stubGlobal('fetch', request);
  await expect(api.identify(scope, id, 'token', true)).resolves.toBeNull();
  await expect(api.identify(scope, id, 'token')).rejects.toThrow();
});

it('meldet ein weiterhin sichtbares Vinted-Anmeldeformular gesondert', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ code: 'vinted_login_pending' }, { status: 422 })),
  );
  await expect(api.identify(scope, id, 'synthetic', true)).rejects.toThrow('Anmeldeformular');
});

it('zeigt abgelehnte Zugangsdaten statt eines endlosen Prüfstatus', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ code: 'vinted_login_rejected' }, { status: 422 })),
  );
  await expect(api.identify(scope, id, 'synthetic', true)).rejects.toThrow('Zugangsdaten');
});
