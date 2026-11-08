import { describe, expect, it, vi } from 'vitest';
import { createWakeUpFetch } from './supabase-wake-up-fetch';

const url = 'https://api.example.test';
const anonKey = 'anon-key';

function setup(options: { signedIn?: boolean; token?: string | null } = {}) {
  const base = vi.fn<typeof fetch>();
  const freshAccessToken = vi
    .fn()
    .mockResolvedValue('token' in options ? options.token : 'fresh-token');
  const wrapped = createWakeUpFetch({
    supabaseUrl: url,
    anonKey,
    hasSignedInUser: () => options.signedIn ?? true,
    freshAccessToken,
    fetch: base,
  });
  return { base, freshAccessToken, wrapped };
}

function sentToken(call: Parameters<typeof fetch>): string | null {
  return new Headers(call[1]?.headers).get('Authorization');
}

describe('Datenanfragen nach dem Aufwecken', () => {
  it('wiederholt eine ohne Anmeldung gesendete Anfrage einmal mit frischem Token', async () => {
    const { base, wrapped } = setup();
    base.mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('[1]'));
    const response = await wrapped(`${url}/rest/v1/rpc/marketplace_list_connections`, {
      method: 'POST',
      body: '{}',
      headers: { Authorization: `Bearer ${anonKey}` },
    });
    expect(await response.text()).toBe('[1]');
    expect(base).toHaveBeenCalledTimes(2);
    expect(sentToken(base.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('wiederholt eine Anfrage mit abgelaufenem Token einmal', async () => {
    const { base, wrapped } = setup();
    base
      .mockResolvedValueOnce(new Response('{"code":"PGRST301"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('ok'));
    const response = await wrapped(`${url}/rest/v1/items`, {
      headers: { Authorization: 'Bearer old-token' },
    });
    expect(response.status).toBe(200);
    expect(sentToken(base.mock.calls[1])).toBe('Bearer fresh-token');
  });

  it('lässt gültige Anfragen und abgemeldete Gäste unverändert', async () => {
    const valid = setup();
    valid.base.mockResolvedValue(new Response('ok'));
    await valid.wrapped(`${url}/rest/v1/items`, { headers: { Authorization: 'Bearer user' } });
    expect(valid.base).toHaveBeenCalledOnce();
    expect(valid.freshAccessToken).not.toHaveBeenCalled();

    const guest = setup({ signedIn: false });
    guest.base.mockResolvedValue(new Response('[]'));
    await guest.wrapped(`${url}/rest/v1/items`, {
      headers: { Authorization: `Bearer ${anonKey}` },
    });
    expect(guest.base).toHaveBeenCalledOnce();
  });

  it('wiederholt nicht ohne neuen Token und fasst Anmeldeaufrufe nie an', async () => {
    const noToken = setup({ token: null });
    noToken.base.mockResolvedValue(new Response('', { status: 401 }));
    const response = await noToken.wrapped(`${url}/rest/v1/items`, {
      headers: { Authorization: 'Bearer old' },
    });
    expect(response.status).toBe(401);
    expect(noToken.base).toHaveBeenCalledOnce();

    const auth = setup();
    auth.base.mockResolvedValue(new Response('', { status: 401 }));
    await auth.wrapped(`${url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' });
    expect(auth.base).toHaveBeenCalledOnce();
    expect(auth.freshAccessToken).not.toHaveBeenCalled();
  });

  it('wiederholt keine Anfrage mit nicht erneut lesbarem Inhalt', async () => {
    const { base, wrapped } = setup();
    base.mockResolvedValue(new Response('', { status: 401 }));
    await wrapped(`${url}/storage/v1/object/photos/a.webp`, {
      method: 'POST',
      body: new Blob(['x']),
      headers: { Authorization: 'Bearer old' },
    });
    expect(base).toHaveBeenCalledOnce();
  });
});
