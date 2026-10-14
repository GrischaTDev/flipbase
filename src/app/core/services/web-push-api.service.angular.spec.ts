import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from './supabase.service';
import { WebPushApiService } from './web-push-api.service';

afterEach(() => TestBed.resetTestingModule());
describe('Versioned device settings', () => {
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
