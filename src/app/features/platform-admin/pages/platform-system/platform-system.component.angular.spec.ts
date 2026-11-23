import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import type {
  PlatformFeatureKey,
  PlatformFeatureSwitch,
} from '../../../../core/models/platform-feature.model';
import { PlatformFeatureSwitchService } from '../../../../core/services/platform-feature-switch.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { parsePlatformSystemHealth } from '../../models/platform-system-health';
import type { SniperBrowserStatus } from '../../models/sniper-browser.model';
import { PlatformSystemService } from '../../services/platform-system.service';
import { parseVintedFeedCapacity } from '../../models/vinted-feed-sources';
import { VintedFeedSourcesService } from '../../services/vinted-feed-sources.service';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import { PlatformSystemComponent } from './platform-system.component';

const recent = new Date(Date.now() - 30_000).toISOString();

describe('PlatformSystemComponent', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: PlatformSystemComponent,
        path: 'src/app/features/platform-admin/pages/platform-system/platform-system.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  async function render(confirm: boolean, browserState: SniperBrowserStatus['state'] = 'ready') {
    const switches = signal<readonly PlatformFeatureSwitch[]>([
      { key: 'vinted', enabled: true, maintenanceMessage: null, updatedAt: '' },
    ]);
    const set = vi.fn(async (key: PlatformFeatureKey, enabled: boolean, message: string | null) => {
      const updated = { key, enabled, maintenanceMessage: message, updatedAt: '' };
      switches.set([updated]);
      return updated;
    });
    const frage = vi.fn(async () => confirm);
    await TestBed.configureTestingModule({
      imports: [PlatformSystemComponent],
      providers: [
        provideRouter([]),
        { provide: ConfirmDialogService, useValue: { frage } },
        {
          provide: SniperBrowserService,
          useValue: {
            status: vi.fn(async () => ({
              state: browserState,
              sessionId: null,
              expiresAt: null,
              message: null,
            })),
          },
        },
        {
          provide: PlatformSystemService,
          useValue: {
            health: vi.fn(async () =>
              parsePlatformSystemHealth({
                checkedAt: recent,
                marketplaceWorker: { heartbeatAt: recent, expiresAt: recent },
                feedBot: null,
                pushWorker: {
                  reportedAt: recent,
                  enabled: true,
                  waiting: 3,
                  retry: 1,
                  configurationError: 0,
                },
                storage: null,
                operationsLastHour: { queued: 0, running: 0, succeeded: 4, failed: 0 },
                cloudIps: { enabled: 1, expiringSoon: 0, expired: 0 },
              }),
            ),
          },
        },
        {
          provide: VintedFeedSourcesService,
          useValue: {
            capacity: vi.fn(async () =>
              parseVintedFeedCapacity({
                max_category_sources: 12,
                category_poll_interval_seconds: 60,
                active_category_sources: 1,
                active_feeds: 3,
                requests_last_minute: 20,
                request_budget: 120,
                reported_at: recent,
                sources: [
                  {
                    key: 'main',
                    kind: 'main',
                    catalog_id: null,
                    category_path: null,
                    feed_count: 2,
                    last_success_at: recent,
                    coverage_status: 'caught_up',
                  },
                ],
              }),
            ),
            categorySync: vi.fn(async () => ({
              refreshedAt: recent,
              requestedAt: null,
              lastAttemptAt: recent,
              categoryCount: 2500,
              lastError: null,
            })),
            saveSettings: vi.fn(),
            requestCategoryRefresh: vi.fn(),
          },
        },
        {
          provide: PlatformFeatureSwitchService,
          useValue: {
            switches,
            refresh: vi.fn(async () => switches()),
            switchFor: (key: PlatformFeatureKey) =>
              switches().find((entry) => entry.key === key) ?? null,
            set,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformSystemComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, set, frage };
  }

  const button = (element: HTMLElement, feature: string) =>
    element.querySelector<HTMLButtonElement>(`[data-feature="${feature}"] app-button button`)!;

  it('zeigt die Lebenszeichen der Dienste', async () => {
    const { element } = await render(true);

    expect(element.querySelector('[data-service="worker"]')?.textContent).toContain('Läuft');
    expect(element.querySelector('[data-service="feed-bot"]')?.textContent).toContain(
      'Keine Meldung',
    );
    expect(element.querySelector('[data-service="feed-bot"] button')).toBeNull();
    expect(element.querySelector('[data-service="operations"]')?.textContent).toContain(
      '4 erfolgreich',
    );
    const push = element.querySelector('[data-service="push-worker"]')?.textContent ?? '';
    expect(push).toContain('Läuft');
    expect(push).toContain('3 warten');
    expect(element.querySelector('[data-metric="category-sources"]')?.textContent?.trim()).toBe(
      '1 / 12',
    );
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('zeigt die manuelle Zugriffsprüfung bei angeforderter Interaktion', async () => {
    const { element } = await render(true, 'interaction_required');
    const action = element.querySelector<HTMLButtonElement>('[data-service="feed-bot"] button');
    expect(action?.textContent?.trim()).toBe('Vinted-Zugriff prüfen');
    expect(action?.disabled).toBe(false);
  });

  it('schaltet einen Bereich erst nach Bestätigung mit Wartungstext ab', async () => {
    const { fixture, element, set, frage } = await render(true);
    const input = element.querySelector<HTMLInputElement>('[data-feature="vinted"] input')!;
    input.value = 'Bis 18 Uhr';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    button(element, 'vinted').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(frage).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith('vinted', false, 'Bis 18 Uhr');
    expect(element.querySelector('[data-feature="vinted"]')?.textContent).toContain('Geschlossen');
    expect(button(element, 'vinted').textContent?.trim()).toBe('Einschalten');
  });

  it('lässt den Bereich offen, wenn die Bestätigung abgelehnt wird', async () => {
    const { fixture, element, set } = await render(false);

    button(element, 'vinted').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(set).not.toHaveBeenCalled();
    expect(element.querySelector('[data-feature="vinted"]')?.textContent).toContain('Offen');
  });
});
