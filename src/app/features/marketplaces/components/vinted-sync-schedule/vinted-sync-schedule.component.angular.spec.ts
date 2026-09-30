import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceSyncScheduleApiService } from '../../services/marketplace-sync-schedule-api.service';
import { VintedSyncScheduleComponent } from './vinted-sync-schedule.component';

const account = createMarketplaceFixtures().connections[0];
const schedule = {
  workspaceId: account.workspaceId,
  connectionId: account.connectionId,
  enabled: false,
  intervalMinutes: 15,
  nextDueAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  pausedReason: null,
  retryAfter: null,
  authorizationVersion: 0,
};
let restore: (() => void) | undefined;
let api: {
  read: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  availability: ReturnType<typeof vi.fn>;
};
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedSyncScheduleComponent,
      path: 'src/app/features/marketplaces/components/vinted-sync-schedule/vinted-sync-schedule.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  api = {
    read: vi.fn().mockResolvedValue(schedule),
    set: vi.fn().mockResolvedValue({
      ...schedule,
      enabled: true,
      nextDueAt: '2026-10-01T12:15:00Z',
      authorizationVersion: 1,
    }),
    availability: vi.fn().mockResolvedValue({ enabled: true, allowedIntervals: [15] }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: MarketplaceSyncScheduleApiService, useValue: api },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
    ],
  });
});
async function render() {
  const fixture = TestBed.createComponent(VintedSyncScheduleComponent);
  fixture.componentRef.setInput('account', account);
  fixture.componentRef.setInput('canManage', true);
  fixture.detectChanges();
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}
describe('Automatische Aktualisierung je Vinted-Konto', () => {
  it('zeigt einen aktivierten Zeitplan bei pausierter, gesperrter oder ausgeloggter Verbindung nicht als aktiv', async () => {
    api.read.mockResolvedValue({ ...schedule, enabled: true, nextDueAt: '2026-10-01T12:15:00Z' });
    const fixture = await render();
    expect(fixture.componentInstance.statusText()).toBe('Aktiv');
    for (const status of ['paused', 'blocked', 'needs_login'] as const) {
      fixture.componentRef.setInput('account', { ...account, status });
      fixture.detectChanges();
      TestBed.tick();
      for (let index = 0; index < 12; index++) await Promise.resolve();
      fixture.detectChanges();
      expect(fixture.componentInstance.statusText()).not.toBe('Aktiv');
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('app-badge')?.textContent).not.toContain('Aktiv');
      expect(element.textContent).not.toContain('01.10.2026,');
      expect(
        [...element.querySelectorAll('button')].find((button) =>
          button.textContent?.includes('Automatische Aktualisierung pausieren'),
        )?.disabled,
      ).toBe(false);
    }
  });
  it('verlangt bewusste Aktivierung und zeigt keine unfreigegebenen kürzeren Intervalle', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('15 Minuten');
    expect(element.textContent).toContain('geschlossener App');
    expect(api.set).not.toHaveBeenCalled();
    const button = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Automatische Aktualisierung aktivieren'),
    )!;
    expect(button.disabled).toBe(false);
    button.click();
    for (let index = 0; index < 12; index++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Nächster geplanter Abruf');
    expect(element.textContent).toContain('Automatische Aktualisierung pausieren');
    expect(element.querySelector('select')).toBeNull();
  });
  it('zeigt gespeicherte Pausengründe verständlich und widerruft ohne verfügbaren Worker', async () => {
    api.read.mockResolvedValue({
      ...schedule,
      enabled: true,
      pausedReason: 'rate_limited',
      retryAfter: '2026-10-01T13:00:00Z',
    });
    api.availability.mockResolvedValue({ enabled: false, allowedIntervals: [] });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Wartezeit');
    const button = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Automatische Aktualisierung pausieren'),
    )!;
    expect(button.disabled).toBe(false);
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
