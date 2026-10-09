import type { AccountScope } from '../../models/marketplace.models';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { MarketplaceFavoriteNotificationApiService } from '../../services/marketplace-favorite-notification-api.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import {
  MarketplaceSyncScheduleApiService,
  MarketplaceSyncScheduleError,
} from '../../services/marketplace-sync-schedule-api.service';
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
  authorizationVersion: 1,
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
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
    {
      type: VintedFavoriteSettingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-favorite-settings/vinted-favorite-settings.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
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
      {
        provide: MarketplaceFavoriteNotificationApiService,
        useValue: {
          readSettings: vi.fn().mockImplementation(async (scope: AccountScope) => ({
            ...scope,
            enabled: true,
            version: 0,
          })),
          setSettings: vi.fn(),
        },
      },
      provideRouter([]),
      { provide: MarketplaceSyncScheduleApiService, useValue: api },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
    ],
  });
});
async function render(openSettings = false) {
  const fixture = TestBed.createComponent(VintedSyncScheduleComponent);
  fixture.componentRef.setInput('account', account);
  fixture.componentRef.setInput('canManage', true);
  fixture.detectChanges();
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  await fixture.whenStable();
  fixture.detectChanges();
  if (openSettings) {
    fixture.nativeElement.querySelector('button[aria-label="Vinted-Kontoeinstellungen"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return fixture;
}
describe('Automatische Aktualisierung je Vinted-Konto', () => {
  it('entfernt nach Kontobestätigung die erledigte Anmeldewarnung und erhält die Pause', async () => {
    api.read.mockResolvedValue({ ...schedule, pausedReason: 'needs_login' });
    const fixture = await render();
    expect(fixture.componentInstance.headerNotice()?.text).toContain('neue Anmeldung');

    api.read.mockResolvedValue({ ...schedule, authorizationVersion: 2 });
    fixture.componentRef.setInput('account', { ...account });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.headerNotice()).toBeNull();
    expect(fixture.componentInstance.headerStatus()?.label).toBe('Automatik pausiert');
    expect(api.set).not.toHaveBeenCalled();
  });

  it('entfernt die serverseitig erledigte Abrufwarnung nach manuellem Erfolg und erhält die Pause', async () => {
    api.read.mockResolvedValue({
      ...schedule,
      pausedReason: 'forbidden',
      lastAttemptAt: '2026-10-02T15:13:28Z',
    });
    const fixture = await render();
    expect(fixture.componentInstance.headerNotice()?.text).toContain('von Vinted abgelehnt');
    api.read.mockResolvedValue({ ...schedule, lastAttemptAt: '2026-10-02T15:13:28Z' });
    fixture.componentRef.setInput('account', {
      ...account,
      lastSyncedAt: '2026-10-06T21:26:40Z',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.headerNotice()).toBeNull();
    expect(fixture.componentInstance.store.canEnable()).toBe(true);
    expect(fixture.componentInstance.headerStatus()?.label).toBe('Automatik pausiert');
    expect(api.set).not.toHaveBeenCalled();
  });

  it('schließt den Einstellungsdialog beim Öffnen der Vinted-Anmeldeseite', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'marketplaces/vinted/connect/:connectionId', component: VintedSyncScheduleComponent },
    ]);
    const fixture = await render(true);
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLAnchorElement>('[role="dialog"] a[href*="/connect/"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe(`/marketplaces/vinted/connect/${account.connectionId}`);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('zeigt einen fehlgeschlagenen Abstand im Dialog ohne Speicherbestätigung und lädt dort erneut', async () => {
    api.availability.mockResolvedValue({ enabled: true, allowedIntervals: [15, 30] });
    api.set.mockRejectedValue(new MarketplaceSyncScheduleError('request_failed'));
    const fixture = await render(true);
    await fixture.componentInstance.store.setIntervalMinutes(30);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
      'Änderung konnte nicht bestätigt werden',
    );
    expect(dialog.textContent).not.toContain('Gespeichert:');
    expect(fixture.componentInstance.store.schedule()?.intervalMinutes).toBe(15);
    [...dialog.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Erneut versuchen'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
    expect(dialog.textContent).toContain('Gespeichert: alle 15 Minuten');
  });

  it('zeigt einen Pausierungsfehler nach Schließen des Dialogs weiterhin mit Wiederholen', async () => {
    api.read.mockResolvedValue({ ...schedule, enabled: true });
    api.set.mockRejectedValue(new MarketplaceSyncScheduleError('conflict'));
    const fixture = await render(true);
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent?.includes('Automatik pausieren'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'inzwischen geändert',
    );
    fixture.componentInstance.settingsOpen.set(false);
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('inzwischen geändert');
    expect(
      [...element.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Erneut versuchen'),
      ),
    ).toBe(true);
  });

  it('bündelt Einstellungen und Anmeldung im Dialog statt im permanenten Erklärblock', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('geschlossener App');
    const settings = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Vinted-Kontoeinstellungen"]',
    );
    expect(settings).not.toBeNull();
    settings!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]');
    expect(dialog?.querySelector('a[href*="/connect/"]')?.getAttribute('href')).toContain(
      account.connectionId,
    );
    expect(dialog?.querySelector('[role="combobox"]')).not.toBeNull();
    expect(dialog?.querySelector('details')?.hasAttribute('open')).toBe(false);
  });
  it('schließt Kontoeinstellungen beim Kontowechsel', async () => {
    const fixture = await render();
    fixture.componentInstance.settingsOpen.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    fixture.componentRef.setInput('account', createMarketplaceFixtures().connections[1]);
    fixture.detectChanges();
    TestBed.tick();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
  it('meldet einen neu bestätigten Hintergrundimport genau einmal an die offene Ansicht', async () => {
    const fixture = await render();
    const synchronized = vi.fn();
    fixture.componentInstance.synchronized.subscribe(synchronized);
    const completed = { ...schedule, enabled: true, lastSuccessAt: '2026-10-01T12:15:00Z' };
    api.read.mockResolvedValue(completed);
    await fixture.componentInstance.store.reload(true);
    fixture.detectChanges();
    TestBed.tick();
    expect(synchronized).toHaveBeenCalledExactlyOnceWith(completed);
    fixture.componentRef.setInput('account', { ...account, lastSyncedAt: completed.lastSuccessAt });
    fixture.detectChanges();
    TestBed.tick();
    await fixture.componentInstance.store.reload(true);
    fixture.detectChanges();
    TestBed.tick();
    expect(synchronized).toHaveBeenCalledTimes(1);
  });
  it('zeigt einen aktivierten Zeitplan bei pausierter, gesperrter oder ausgeloggter Verbindung nicht als aktiv', async () => {
    api.read.mockResolvedValue({ ...schedule, enabled: true, nextDueAt: '2026-10-01T12:15:00Z' });
    const fixture = await render(true);
    expect(fixture.componentInstance.statusText()).toBe('Aktiv');
    for (const status of ['paused', 'blocked', 'needs_login'] as const) {
      fixture.componentRef.setInput('account', { ...account, status });
      fixture.detectChanges();
      TestBed.tick();
      for (let index = 0; index < 12; index++) await Promise.resolve();
      fixture.detectChanges();
      fixture.componentInstance.settingsOpen.set(true);
      fixture.detectChanges();
      expect(fixture.componentInstance.statusText()).not.toBe('Aktiv');
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).not.toContain('Status: Aktiv');
      expect(element.textContent).not.toContain('01.10.2026,');
      expect(
        [...element.querySelectorAll('button')].find((button) =>
          button.textContent?.includes('Automatik pausieren'),
        )?.disabled,
      ).toBe(false);
    }
  });
  it('verlangt bewusste Aktivierung und zeigt keine unfreigegebenen kürzeren Intervalle', async () => {
    const fixture = await render(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('15 Minuten');
    expect(element.textContent).toContain('geschlossener App');
    expect(api.set).not.toHaveBeenCalled();
    const button = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Automatik fortsetzen'),
    )!;
    expect(button.disabled).toBe(false);
    button.click();
    for (let index = 0; index < 12; index++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('Nächster geplanter Abruf');
    expect(element.textContent).toContain('Automatik pausieren');
    expect(element.querySelector('select')).toBeNull();
  });
  it('zeigt bei einem fehlenden Zeitplan die bestätigte Standardautomatik ohne Aktivierungsklick', async () => {
    api.read.mockResolvedValue({ ...schedule, authorizationVersion: 0 });
    const fixture = await render(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: account.workspaceId, connectionId: account.connectionId },
      true,
      15,
      0,
    );
    expect(element.textContent).toContain('Automatik pausieren');
    expect(element.textContent).not.toContain('Stand neu laden');
  });
  it('öffnet Abstände in den Einstellungen und zeigt die gespeicherte Einstellung', async () => {
    api.availability.mockResolvedValue({ enabled: true, allowedIntervals: [3, 5, 10, 15, 30, 60] });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === 'Vinted-Kontoeinstellungen')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(element.querySelector('[role="combobox"]')?.getAttribute('aria-label')).toBe(
      'Abrufabstand',
    );
  });
  it('zeigt gespeicherte Pausengründe verständlich und widerruft ohne verfügbaren Worker', async () => {
    api.read.mockResolvedValue({
      ...schedule,
      enabled: true,
      pausedReason: 'rate_limited',
      retryAfter: '2026-10-01T13:00:00Z',
    });
    api.availability.mockResolvedValue({ enabled: false, allowedIntervals: [] });
    const fixture = await render(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Wartezeit');
    const button = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('Automatik pausieren'),
    )!;
    expect(button.disabled).toBe(false);
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
