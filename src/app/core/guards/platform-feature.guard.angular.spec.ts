import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../services/supabase.service';
import { PlatformFeatureSwitchService } from '../services/platform-feature-switch.service';
import { platformFeatureGuard } from './platform-feature.guard';

function setup(result: { data: unknown; error: { message: string } | null }) {
  const select = vi.fn().mockResolvedValue(result);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SupabaseService, useValue: { client: { from: vi.fn(() => ({ select })) } } },
    ],
  });
  return { select };
}

const run = (key: 'vinted' | 'vinted_feed') =>
  TestBed.runInInjectionContext(() =>
    platformFeatureGuard(key)({} as never, {} as never),
  ) as Promise<boolean | UrlTree>;

describe('platformFeatureGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('führt bei einem abgeschalteten Bereich auf dessen Wartungsseite', async () => {
    setup({
      data: [
        { feature_key: 'vinted', enabled: false, maintenance_message: 'Kurz weg', updated_at: '' },
        { feature_key: 'vinted_feed', enabled: true, maintenance_message: null, updated_at: '' },
      ],
      error: null,
    });

    const result = await run('vinted');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/maintenance/vinted');
    expect(await run('vinted_feed')).toBe(true);
    expect(
      TestBed.inject(PlatformFeatureSwitchService).switchFor('vinted')?.maintenanceMessage,
    ).toBe('Kurz weg');
  });

  it('lässt bei einem Ladefehler oder fehlendem Eintrag durch', async () => {
    setup({ data: null, error: { message: 'offline' } });
    expect(await run('vinted')).toBe(true);
  });

  it('fragt innerhalb kurzer Zeit nur einmal nach', async () => {
    const { select } = setup({ data: [], error: null });
    await run('vinted');
    await run('vinted_feed');
    expect(select).toHaveBeenCalledTimes(1);
  });
});
