import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startBrowserApi, createOperatorVerifier } from '../../src/browser/browser-http-api.js';
import { BrowserSessionError, type BrowserSession } from '../../src/browser/browser-types.js';

const sessionId = '710ed0fe-8f30-4a9c-8c62-dcb699454716';
const routes = [
  ['GET', '/status'],
  ['POST', '/sessions'],
  ['GET', `/sessions/${sessionId}/frame`],
  ['POST', `/sessions/${sessionId}/input`],
  ['POST', `/sessions/${sessionId}/verify`],
  ['DELETE', `/sessions/${sessionId}`],
] as const;

async function fixture() {
  const effects: string[] = [];
  const checked: string[] = [];
  const result = {
    state: 'manual' as const,
    sessionId,
    expiresAt: '2026-10-07T12:10:00Z',
    message: null,
  };
  const session: BrowserSession = {
    status: async () => result,
    open: async () => result,
    frame: async () => {
      effects.push('frame');
      return new Uint8Array([255, 216, 255, 1]);
    },
    input: async (_owner, _id, command) => {
      effects.push(JSON.stringify(command));
    },
    verify: async () => result,
    close: async () => {
      effects.push('closed');
    },
    runAutomatic: async (operation) => operation(),
  };
  const server = startBrowserApi({
    host: '127.0.0.1',
    port: 0,
    session,
    verifyOperator: async (token) => {
      checked.push(token);
      if (token === 'expired') throw new BrowserSessionError(401, 'expired');
      if (token !== 'operator') throw new BrowserSessionError(403, 'operator required');
      return 'owner';
    },
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sniper-browser`;
  return {
    base,
    session,
    checked,
    effects,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe('manual bot browser API', () => {
  it('never exposes browser control on an unspecified public host', async () => {
    const api = await fixture();
    try {
      expect(() =>
        startBrowserApi({
          host: '0.0.0.0',
          port: 0,
          session: api.session,
          verifyOperator: async () => 'owner',
        }),
      ).toThrow('private');
    } finally {
      await api.close();
    }
  });
  it.each(routes)('requires operator authentication for %s %s', async (method, path) => {
    const api = await fixture();
    try {
      for (const [token, expected] of [
        ['', 401],
        ['expired', 401],
        ['member', 403],
      ] as const) {
        const response = await fetch(api.base + path, {
          method,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        expect(response.status).toBe(expected);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect(api.effects).toEqual([]);
    } finally {
      await api.close();
    }
  });
  it('reauthenticates every frame request and does not cache a revoked role', async () => {
    const api = await fixture();
    try {
      const first = await fetch(`${api.base}/sessions/${sessionId}/frame`, {
        headers: { Authorization: 'Bearer operator' },
      });
      expect(first.headers.get('content-type')).toBe('image/jpeg');
      expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([255, 216, 255, 1]));
      const second = await fetch(`${api.base}/sessions/${sessionId}/frame`, {
        headers: { Authorization: 'Bearer member' },
      });
      expect(second.status).toBe(403);
      expect(api.checked).toEqual(['operator', 'member']);
      expect(api.effects).toEqual(['frame']);
    } finally {
      await api.close();
    }
  });
  it.each([
    { kind: 'click', x: -1, y: 0.5 },
    { kind: 'text', text: 'a\nsecret' },
    { kind: 'key', key: 'F12' },
    { kind: 'text', text: 'x'.repeat(257) },
  ])('rejects invalid native input %#', async (input) => {
    const api = await fixture();
    try {
      const response = await fetch(`${api.base}/sessions/${sessionId}/input`, {
        method: 'POST',
        headers: { Authorization: 'Bearer operator', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(400);
      expect(api.effects).toEqual([]);
    } finally {
      await api.close();
    }
  });
  it('rejects oversized inputs and invalid images without sending private contents', async () => {
    const api = await fixture();
    try {
      const body = await fetch(`${api.base}/sessions/${sessionId}/input`, {
        method: 'POST',
        headers: { Authorization: 'Bearer operator' },
        body: 'x'.repeat(16 * 1024 + 1),
      });
      expect(body.status).toBe(413);
      api.session.frame = async () => new Uint8Array(Buffer.from('private screenshot error'));
      const frame = await fetch(`${api.base}/sessions/${sessionId}/frame`, {
        headers: { Authorization: 'Bearer operator' },
      });
      expect(frame.status).toBe(503);
      expect(await frame.text()).not.toContain('private screenshot error');
    } finally {
      await api.close();
    }
  });
  it('returns a session conflict instead of exposing a foreign frame', async () => {
    const api = await fixture();
    try {
      api.session.frame = async () => {
        throw new BrowserSessionError(409, 'Die Sitzung gehört einem anderen Betreiber.');
      };
      const response = await fetch(`${api.base}/sessions/${sessionId}/frame`, {
        headers: { Authorization: 'Bearer operator' },
      });
      expect(response.status).toBe(409);
      expect(response.headers.get('content-type')).toContain('application/json');
    } finally {
      await api.close();
    }
  });
});

describe('operator verifier', () => {
  it('rejects expired authentication before checking the role', async () => {
    let requests = 0;
    const verify = createOperatorVerifier(
      { supabaseUrl: 'https://supabase.example.test', supabaseAnonKey: 'publishable' },
      async () => {
        requests++;
        return new Response('', { status: 401 });
      },
    );
    await expect(verify('expired')).rejects.toMatchObject({ status: 401 });
    expect(requests).toBe(1);
  });
  it('checks the role with the caller JWT and refuses a revoked role', async () => {
    const requests: { path: string; token: string | null }[] = [];
    let isOperator = true;
    const verify = createOperatorVerifier(
      { supabaseUrl: 'https://supabase.example.test', supabaseAnonKey: 'publishable' },
      async (input, init) => {
        const path = new URL(String(input)).pathname;
        requests.push({ path, token: new Headers(init?.headers).get('authorization') });
        return Response.json(path === '/auth/v1/user' ? { id: 'verified-user' } : isOperator);
      },
    );
    await expect(verify('user-jwt')).resolves.toBe('verified-user');
    isOperator = false;
    await expect(verify('user-jwt')).rejects.toMatchObject({ status: 403 });
    expect(requests).toEqual([
      { path: '/auth/v1/user', token: 'Bearer user-jwt' },
      { path: '/rest/v1/rpc/is_platform_operator', token: 'Bearer user-jwt' },
      { path: '/auth/v1/user', token: 'Bearer user-jwt' },
      { path: '/rest/v1/rpc/is_platform_operator', token: 'Bearer user-jwt' },
    ]);
  });
});
