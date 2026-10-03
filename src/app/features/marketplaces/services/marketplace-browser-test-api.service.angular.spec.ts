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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const sourceResults = () => ({
  profile: { status: 'complete' },
  publications: { status: 'complete' },
  conversations: { status: 'complete' },
  messages: { status: 'partial' },
  sales: { status: 'complete' },
  feedback: { status: 'failed', failure: 'rate_limited' },
});

it('übernimmt getrennte Bereichsergebnisse eines erfolgreichen Auftrags', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.endsWith('/start')
          ? Response.json({ id }, { status: 202 })
          : Response.json({ id, state: 'succeeded', sourceResults: sourceResults() }),
      ),
  );
  const onProgress = vi.fn();
  const result = api.syncConnection(scope, 'token', onProgress);
  await vi.runAllTimersAsync();
  await result;
  expect(onProgress).toHaveBeenLastCalledWith({
    id,
    state: 'succeeded',
    stage: null,
    errorCode: null,
    sourceResults: sourceResults(),
  });
});

it('akzeptiert einen älteren Worker ohne Bereichsergebnisse', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.endsWith('/start')
          ? Response.json({ id }, { status: 202 })
          : Response.json({ id, state: 'succeeded' }),
      ),
  );
  const result = api.syncConnection(scope, 'token');
  await vi.runAllTimersAsync();
  await expect(result).resolves.toBeUndefined();
});

it.each(
  [
    { ...sourceResults(), unexpected: { status: 'complete' } },
    { ...sourceResults(), profile: { status: 'pretend_complete' } },
    { ...sourceResults(), feedback: { status: 'failed', failure: 'secret-server-detail' } },
    { profile: { status: 'complete' } },
    null,
    [],
  ].map((results) => ({ results })),
)('weist beschädigte oder unbekannte Bereichsergebnisse zurück: %j', async ({ results }) => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.endsWith('/start')
          ? Response.json({ id }, { status: 202 })
          : Response.json({ id, state: 'succeeded', sourceResults: results }),
      ),
  );
  const result = api.syncConnection(scope, 'token').then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  const error = await result;
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('nicht vollständig aktualisiert');
});

describe('Browser-Test-API', () => {
  it('erkennt Ziehbewegungen nur bei ausdrücklicher Unterstützung im schreibenden Browserdienst', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ok: true, readOnly: false, apiVersion: 2, dragSupported: true }),
        ),
    );
    expect(await api.available()).toEqual({
      available: true,
      readOnly: false,
      dragSupported: true,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ ok: true, readOnly: true, apiVersion: 2, dragSupported: true }),
        ),
    );
    expect(await api.available()).toEqual({ available: true, readOnly: true });
  });

  it('überträgt die manuelle Bewegung mit unverändertem Kontobezug und Zeitwerten', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ accepted: true }));
    vi.stubGlobal('fetch', request);
    const input = {
      kind: 'drag' as const,
      points: [
        { x: 0.1, y: 0.2, elapsedMs: 0 },
        { x: 0.8, y: 0.2, elapsedMs: 150 },
      ],
    };
    await api.input(scope, id, input, 'user-test-token');
    const [path, options] = request.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/marketplace-browser/sessions/${id}/input`);
    expect(JSON.parse(String(options.body))).toEqual({ ...scope, input });
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer user-test-token');
  });
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ok: true, readOnly: true, apiVersion: 2 })),
    );
    expect(await api.available()).toEqual({ available: true, readOnly: true });
  });

  it('erkennt einen laufenden Worker mit veralteter API-Version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, readOnly: false })));
    expect(await api.available()).toEqual({ available: false, readOnly: true, outdated: true });
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

  it('erklärt eine bereits laufende Anmeldung ohne interne Serverdetails zu übernehmen', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { code: 'browser_session_busy', error: 'secret-server-detail' },
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', request);
    await expect(api.open(scope, 'user-test-token')).rejects.toThrow(
      'Eine Browsersitzung läuft bereits',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('verwendet bei einem unbekannten Konflikt weiterhin den neutralen Fehler', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 'unknown', error: 'secret-server-detail' }, { status: 409 }),
        ),
    );
    await expect(api.open(scope, 'user-test-token')).rejects.toThrow(
      'Browsersitzung nicht verfügbar',
    );
  });

  it('nennt die erreichte GoLogin-Profilgrenze beim Browserstart', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 'gologin_profile_limit_reached' }, { status: 503 }),
        ),
    );
    await expect(api.open(scope, 'user-test-token')).rejects.toThrow('GoLogin-Profile');
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
  request.mockResolvedValueOnce(Response.json({ status: 'already_authenticated' }));
  await expect(
    api.login(scope, id, { username: 'synthetic', password: 'synthetic' }, 'token'),
  ).resolves.toBe('already_authenticated');
  request.mockResolvedValueOnce(Response.json({ status: 'verification_required' }));
  await expect(
    api.login(scope, id, { username: 'synthetic', password: 'synthetic' }, 'token'),
  ).resolves.toBe('verification_required');
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

it('meldet einen angeforderten Vinted-Code und sendet ihn an die gebundene Sitzung', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(Response.json({ code: 'vinted_verification_required' }, { status: 422 }));
  vi.stubGlobal('fetch', request);
  await expect(api.identify(scope, id, 'token', true)).rejects.toThrow('Bestätigungscode');
  request.mockResolvedValueOnce(Response.json({ status: 'submitted' }));
  await expect(api.verify(scope, id, '123456', 'token')).resolves.toBe('submitted');
  expect(request.mock.calls[1][0]).toBe(`/marketplace-browser/sessions/${id}/verify`);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ ...scope, code: '123456' });
});

it('meldet eine unbestätigte Kontolöschung gesondert', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 409 })));
  await expect(api.deleteConnection(scope, 'token')).rejects.toThrow(
    'noch nicht vollständig gelöscht',
  );
});

it('verweigert das Löschen über einen veralteten Worker vor einer Schreibanfrage', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ ok: true, readOnly: false }));
  vi.stubGlobal('fetch', request);
  await expect(api.deleteConnection(scope, 'token')).rejects.toThrow('aktualisiert');
  expect(request).toHaveBeenCalledOnce();
});

it('behandelt nur nachgelesene Vinted-Änderungen als gespeichert', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ status: 'unconfirmed' }));
  vi.stubGlobal('fetch', request);
  const fields = { title: 'Jacke', description: 'Beschreibung', price: '12,50' };
  await expect(api.saveListingEdit(scope, id, fields, 'token')).rejects.toThrow(
    'nicht eindeutig bestätigt',
  );
  expect(request.mock.calls[0][0]).toBe('/marketplace-browser/listings/edit/save');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ ...scope, entryId: id, fields });
  request.mockResolvedValueOnce(Response.json({ status: 'confirmed' }));
  await expect(api.saveListingEdit(scope, id, fields, 'token')).resolves.toBeUndefined();
  request.mockResolvedValueOnce(Response.json({ status: 'unconfirmed' }));
  await expect(api.saveProfileAbout(scope, 'Neuer Text', 'token')).rejects.toThrow(
    'nicht eindeutig bestätigt',
  );
});

it('bewahrt eine ausstehende Textspeicherung und bestätigt alte Antworten nicht', async () => {
  const fields = { title: 'Jacke', description: '', price: '12,50' };
  const request = vi.fn().mockResolvedValue(Response.json({ fields, cache: 'pending' }));
  vi.stubGlobal('fetch', request);
  expect(await api.readListingData(scope, id, 'token')).toEqual({ fields, cacheState: 'pending' });
  request.mockResolvedValueOnce(Response.json({ fields }));
  expect(await api.readListingData(scope, id, 'token')).toEqual({
    fields,
    cacheState: 'unconfirmed',
  });
  request.mockResolvedValueOnce(Response.json({ fields: { ...fields, description: null } }));
  await expect(api.readListingData(scope, id, 'token')).rejects.toThrow('ungültige');
});
