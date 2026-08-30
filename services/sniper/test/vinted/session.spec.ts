import { describe, expect, it, vi } from 'vitest';
import { VintedSession } from '../../src/vinted/session.js';
import { VintedHttpError } from '../../src/vinted/errors.js';

function homepage(cookie: string): Response {
  return new Response('<html></html>', {
    status: 200,
    headers: { 'set-cookie': `access_token_web=${cookie}; Path=/; HttpOnly` },
  });
}

const options = {
  baseUrl: 'https://www.vinted.de',
  userAgent: 'test-agent',
};

describe('VintedSession', () => {
  it('warms up once and reuses the cookie', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(homepage('first'));
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('access_token_web=first');
    expect(await session.cookieHeader()).toBe('access_token_web=first');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('warms up again after invalidate', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(homepage('first'))
      .mockResolvedValueOnce(homepage('second'));
    const session = new VintedSession(options, fetchFn);

    await session.cookieHeader();
    session.invalidate();

    expect(await session.cookieHeader()).toBe('access_token_web=second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('sends the configured user agent', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(homepage('first'));
    const session = new VintedSession(options, fetchFn);

    await session.cookieHeader();
    const headers = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;

    expect(headers['User-Agent']).toBe('test-agent');
  });

  it('fails loudly when the warm-up is rejected', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    const session = new VintedSession(options, fetchFn);

    await expect(session.cookieHeader()).rejects.toBeInstanceOf(VintedHttpError);
  });

  it('joins every returned cookie', async () => {
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append('set-cookie', 'access_token_web=a; Path=/');
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('access_token_web=a; anon_id=b');
  });

  it('keeps the last value when Vinted sets a cookie twice', async () => {
    // Gemessen am 30.08.2026: Die Startseite invalidiert access_token_web
    // zuerst mit einem leeren Wert und setzt danach den echten Token. Wer die
    // Werte stumpf aneinanderhaengt, schickt den leeren zuerst und bekommt 401.
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append(
      'set-cookie',
      'access_token_web=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    response.headers.append('set-cookie', 'access_token_web=real-token; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    const header = await session.cookieHeader();

    expect(header).toContain('access_token_web=real-token');
    expect(header).not.toContain('access_token_web=;');
    expect(header).toContain('anon_id=b');
  });

  it('drops a malformed cookie without a name', async () => {
    const response = new Response('<html></html>', { status: 200 });
    response.headers.append('set-cookie', '=orphan; Path=/');
    response.headers.append('set-cookie', 'anon_id=b; Path=/');
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const session = new VintedSession(options, fetchFn);

    expect(await session.cookieHeader()).toBe('anon_id=b');
  });
});
