import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { WebPushApiService } from './web-push-api.service';

afterEach(() => TestBed.resetTestingModule());
describe('Versioned device settings', () => {
  it.each([
    [401, 'settings', 'Melde dich erneut an'],
    [403, 'preferences', 'Arbeitsbereich'],
    [429, 'register', 'Warte eine Minute'],
    [503, 'register', 'Geräteaktivierung'],
  ])('explains HTTP %s for %s without showing server internals', async (status, action, text) => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: {
        context: new Response('{"error":"private-server-detail"}', { status: Number(status) }),
        message: 'private-server-detail',
      },
    }));
    TestBed.configureTestingModule({
      providers: [
        WebPushApiService,
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      ],
    });
    const api = TestBed.inject(WebPushApiService);
    const request =
      action === 'settings'
        ? api.loadSettings('installation')
        : action === 'preferences'
          ? api.savePreferences('device', 'workspace', ['favorite'])
          : api.register({
              generationId: 'generation',
              installationId: 'installation',
              tokenHash: 'hash',
              keyId: 'key',
              subscription: { endpoint: 'https://example.test', p256dh: 'key', auth: 'secret' },
            });
    await expect(request).rejects.toThrow(String(text));
    await expect(request).rejects.not.toThrow('private-server-detail');
  });

  it('requests version 2 and accepts favorite categories', async () => {
    const settings = {
      enabled: true,
      publicKey: 'key',
      keyId: 'key1',
      binding: null,
      allowedCategories: ['favorite'],
      preferences: [],
    };
    const invoke = vi.fn(async () => ({ data: settings, error: null }));
    TestBed.configureTestingModule({
      providers: [
        WebPushApiService,
        { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      ],
    });
    expect(await TestBed.inject(WebPushApiService).loadSettings('installation')).toEqual(settings);
    expect(invoke).toHaveBeenCalledWith('push-settings', {
      body: {
        action: 'settings',
        installationId: 'installation',
        apiVersion: 2,
      },
    });
  });
});
