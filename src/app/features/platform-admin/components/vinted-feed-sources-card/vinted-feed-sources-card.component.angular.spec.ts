import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { parseVintedFeedCapacity } from '../../models/vinted-feed-sources';
import { VintedFeedSourcesService } from '../../services/vinted-feed-sources.service';
import {
  VINTED_FEED_SOURCES_REFRESH_MS,
  VintedFeedSourcesCardComponent,
} from './vinted-feed-sources-card.component';

const recent = new Date(Date.now() - 12_000).toISOString();
const capacityResponse = {
  max_category_sources: 12,
  category_poll_interval_seconds: 60,
  active_category_sources: 1,
  active_feeds: 4,
  requests_last_minute: 30,
  request_budget: 120,
  reported_at: recent,
  sources: [
    {
      key: 'main',
      kind: 'main',
      catalog_id: null,
      category_path: null,
      feed_count: 3,
      last_success_at: recent,
      coverage_status: 'caught_up',
    },
    {
      key: 'category:1206',
      kind: 'category',
      catalog_id: 1206,
      category_path: 'Herren > Jacken',
      feed_count: 1,
      last_success_at: null,
      coverage_status: 'limited',
    },
  ],
};

describe('VintedFeedSourcesCardComponent', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: VintedFeedSourcesCardComponent,
        path: 'src/app/features/platform-admin/components/vinted-feed-sources-card/vinted-feed-sources-card.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function render() {
    const api = {
      capacity: vi.fn(async () => parseVintedFeedCapacity(capacityResponse)),
      categorySync: vi.fn(async () => ({
        refreshedAt: recent,
        requestedAt: null as string | null,
        lastAttemptAt: recent,
        categoryCount: 2500,
        lastError: 'Seitenformat geändert' as string | null,
      })),
      saveSettings: vi.fn(async () => undefined),
      requestCategoryRefresh: vi.fn(async () => undefined),
    };
    await TestBed.configureTestingModule({
      imports: [VintedFeedSourcesCardComponent],
      providers: [{ provide: VintedFeedSourcesService, useValue: api }],
    }).compileComponents();
    const fixture = TestBed.createComponent(VintedFeedSourcesCardComponent);
    fixture.detectChanges();
    await fixture.componentInstance.load();
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      card: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      api,
    };
  }

  it('zeigt Kennzahlen, Quellen und den Kategorienstand barrierefrei', async () => {
    const { element } = await render();
    const metric = (name: string) =>
      element.querySelector(`[data-metric="${name}"]`)?.textContent?.trim();
    expect(metric('category-sources')).toBe('1 / 12');
    expect(metric('active-feeds')).toBe('4');
    expect(metric('requests')).toBe('30 / 120');
    const rows = element.querySelectorAll('[data-vinted-feed-sources-table] tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Hauptquelle');
    expect(rows[0].textContent).toContain('Aktuell');
    expect(rows[1].textContent).toContain('Herren > Jacken');
    expect(rows[1].textContent).toContain('Kommt nicht hinterher');
    expect(element.querySelector('[data-category-sync-error]')?.textContent).toContain(
      'Seitenformat geändert',
    );
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('speichert gültige Einstellungen und weist ungültige zurück', async () => {
    const { card, api } = await render();
    expect(card.settingsForm.getRawValue()).toEqual({
      maxCategorySources: 12,
      categoryPollIntervalSeconds: 60,
    });

    card.settingsForm.setValue({ maxCategorySources: 501, categoryPollIntervalSeconds: 10 });
    card.settingsForm.markAsDirty();
    await card.saveSettings();
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(card.fieldError('maxCategorySources')).toBe(
      'Bitte gib eine ganze Zahl von 0 bis 500 ein.',
    );
    expect(card.fieldError('categoryPollIntervalSeconds')).toBe(
      'Bitte gib eine ganze Zahl von 15 bis 3600 ein.',
    );

    card.settingsForm.setValue({ maxCategorySources: 20, categoryPollIntervalSeconds: 30 });
    await card.saveSettings();
    expect(api.saveSettings).toHaveBeenCalledWith({
      maxCategorySources: 20,
      categoryPollIntervalSeconds: 30,
    });
    expect(card.capacity()?.maxCategorySources).toBe(20);
    expect(card.settingsForm.pristine).toBe(true);
  });

  it('zeigt einen Speicherfehler an', async () => {
    const { card, api } = await render();
    api.saveSettings.mockRejectedValueOnce(
      new Error('Die Einstellungen konnten nicht gespeichert werden.'),
    );
    card.settingsForm.setValue({ maxCategorySources: 5, categoryPollIntervalSeconds: 60 });
    await card.saveSettings();
    expect(card.saveError()).toBe('Die Einstellungen konnten nicht gespeichert werden.');
  });

  it('fordert das Neu-Einlesen an und lädt den Stand neu', async () => {
    const { card, api } = await render();
    api.categorySync.mockResolvedValueOnce({
      refreshedAt: recent,
      requestedAt: new Date().toISOString(),
      lastAttemptAt: recent,
      categoryCount: 2500,
      lastError: null,
    });
    await card.requestCategoryRefresh();
    expect(api.requestCategoryRefresh).toHaveBeenCalledOnce();
    expect(card.pendingRefresh()).not.toBeNull();
  });

  it('aktualisiert regelmäßig und hört nach dem Zerstören auf', async () => {
    const setTimer = vi.spyOn(globalThis, 'setInterval');
    const clearTimer = vi.spyOn(globalThis, 'clearInterval');
    const { fixture, api } = await render();
    const registration = setTimer.mock.calls.findIndex(
      ([, delay]) => delay === VINTED_FEED_SOURCES_REFRESH_MS,
    );
    expect(registration).toBeGreaterThanOrEqual(0);
    const calls = api.capacity.mock.calls.length;
    (setTimer.mock.calls[registration][0] as () => void)();
    await fixture.whenStable();
    expect(api.capacity.mock.calls.length).toBe(calls + 1);
    fixture.destroy();
    expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[registration].value);
    setTimer.mockRestore();
    clearTimer.mockRestore();
  });
});

describe('VintedFeedSourcesService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ruft die Einstellungen mit den RPC-Parametern auf', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    await TestBed.inject(VintedFeedSourcesService).saveSettings({
      maxCategorySources: 40,
      categoryPollIntervalSeconds: 90,
    });
    expect(rpc).toHaveBeenCalledWith('set_sniper_feed_settings', {
      p_max_category_sources: 40,
      p_category_poll_interval_seconds: 90,
    });
  });

  it('meldet fehlende Adminrechte beim Laden verständlich', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    await expect(TestBed.inject(VintedFeedSourcesService).capacity()).rejects.toThrow(
      'Die Vinted-Quellen konnten nicht geladen werden.',
    );
  });

  it('setzt für das Neu-Einlesen nur requested_at', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn((_values: Record<string, unknown>) => ({ eq }));
    const from = vi.fn(() => ({ update }));
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { from } } }],
    });
    await TestBed.inject(VintedFeedSourcesService).requestCategoryRefresh();
    expect(from).toHaveBeenCalledWith('vinted_category_syncs');
    expect(Object.keys(update.mock.calls[0][0])).toEqual(['requested_at']);
    expect(eq).toHaveBeenCalledWith('id', 1);
  });
});
