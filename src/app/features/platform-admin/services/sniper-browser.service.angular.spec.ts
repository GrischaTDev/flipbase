import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SniperBrowserService } from './sniper-browser.service';

describe('SniperBrowserService', () => {
  const getSession = vi.fn();
  const request = vi.fn();
  let service: SniperBrowserService;
  beforeEach(() => {
    getSession
      .mockReset()
      .mockResolvedValue({ data: { session: { access_token: 'current-token' } }, error: null });
    request.mockReset();
    vi.stubGlobal('fetch', request);
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { auth: { getSession } } } }],
    });
    service = TestBed.inject(SniperBrowserService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('loads images with the current bearer token and no token in the URL', async () => {
    request.mockResolvedValue(
      new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );
    const frame = await service.frame(
      '12345678-1234-1234-1234-123456789012',
      new AbortController().signal,
    );
    expect(frame.size).toBe(4);
    expect(request.mock.calls[0]?.[0]).toBe(
      '/sniper-browser/sessions/12345678-1234-1234-1234-123456789012/frame',
    );
    expect(request.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer current-token');
  });
  it('does not request anything when the login has ended', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(service.status()).rejects.toThrow('Bitte melde Dich erneut an.');
    expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 403, 409])('preserves an actionable API error (%s)', async (status) => {
    request.mockResolvedValue(Response.json({ message: 'Sitzung ist gesperrt.' }, { status }));
    await expect(service.open()).rejects.toMatchObject({
      status,
      message: 'Sitzung ist gesperrt.',
    });
  });
  it('rejects a successful HTML fallback instead of treating it as browser status', async () => {
    request.mockResolvedValue(
      new Response('<html>offline</html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(service.status()).rejects.toThrow();
  });
});
