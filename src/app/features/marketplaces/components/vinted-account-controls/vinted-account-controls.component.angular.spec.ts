import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import type { AccountScope } from '../../models/marketplace.models';
import { MarketplaceFavoriteNotificationApiService } from '../../services/marketplace-favorite-notification-api.service';
import { MarketplaceSyncScheduleApiService } from '../../services/marketplace-sync-schedule-api.service';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedSyncScheduleComponent } from '../vinted-sync-schedule/vinted-sync-schedule.component';
import { VintedAccountControlsComponent } from './vinted-account-controls.component';

const account = { ...createMarketplaceFixtures().connections[0], executionMode: 'local' as const };
let restore: (() => void) | undefined;
const favoriteApi = {
  readSettings: vi.fn(),
  setSettings: vi.fn(),
};
const scheduleApi = {
  read: vi.fn(),
  availability: vi.fn(),
};

beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedAccountControlsComponent,
      path: 'src/app/features/marketplaces/components/vinted-account-controls/vinted-account-controls.component.ts',
    },
    {
      type: VintedFavoriteSettingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-favorite-settings/vinted-favorite-settings.component.ts',
    },
    {
      type: VintedSyncScheduleComponent,
      path: 'src/app/features/marketplaces/components/vinted-sync-schedule/vinted-sync-schedule.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    {
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: ProductThumbnailComponent,
      path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  vi.clearAllMocks();
  favoriteApi.readSettings.mockImplementation(async (scope: AccountScope) => ({
    ...scope,
    enabled: true,
    version: 1,
  }));
  favoriteApi.setSettings.mockImplementation(async (scope: AccountScope, enabled: boolean) => ({
    ...scope,
    enabled,
    version: 2,
  }));
  scheduleApi.read.mockResolvedValue({
    ...account,
    enabled: false,
    intervalMinutes: 15,
    pausedReason: null,
  });
  scheduleApi.availability.mockResolvedValue({ enabled: true, allowedIntervals: [15] });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: account.workspaceId }) },
      },
      { provide: MarketplaceFavoriteNotificationApiService, useValue: favoriteApi },
      { provide: MarketplaceSyncScheduleApiService, useValue: scheduleApi },
    ],
  });
});

async function settle(
  fixture: ReturnType<typeof TestBed.createComponent<VintedAccountControlsComponent>>,
) {
  fixture.detectChanges();
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  fixture.detectChanges();
}
async function render(canManage = true) {
  const fixture = TestBed.createComponent(VintedAccountControlsComponent);
  fixture.componentRef.setInput('account', account);
  fixture.componentRef.setInput('connections', [account]);
  fixture.componentRef.setInput('canManage', canManage);
  await settle(fixture);
  return fixture;
}
function settingsButton(
  fixture: ReturnType<typeof TestBed.createComponent<VintedAccountControlsComponent>>,
): HTMLButtonElement | null {
  return fixture.nativeElement.querySelector('button[aria-label="Vinted-Kontoeinstellungen"]');
}

describe('Benachrichtigungseinstellungen bei lokalen Vinted-Konten', () => {
  it('öffnet und speichert die echte Favoriteneinstellung ohne Cloud-Abrufe', async () => {
    const fixture = await render();
    expect(settingsButton(fixture)).not.toBeNull();
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Neue Favoriten in der Glocke anzeigen');
    expect(fixture.nativeElement.textContent).not.toContain('Automatische Aktualisierung');
    expect(favoriteApi.readSettings).toHaveBeenCalledWith(account);
    const checkbox: HTMLButtonElement =
      fixture.nativeElement.querySelector('button[role="checkbox"]');
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    checkbox.click();
    await settle(fixture);
    expect(favoriteApi.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: account.connectionId, version: 1 }),
      false,
    );
    expect(scheduleApi.read).not.toHaveBeenCalled();
    expect(scheduleApi.availability).not.toHaveBeenCalled();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
  it('schließt bei Kontowechsel und öffnet danach die Einstellung des neuen Kontos', async () => {
    const fixture = await render();
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    const nextAccount = { ...account, connectionId: 'account-b' };
    fixture.componentRef.setInput('account', nextAccount);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(favoriteApi.readSettings).toHaveBeenLastCalledWith(nextAccount);
  });
  it('verhindert das Öffnen ohne Verwaltungsrecht und schließt nach Rechteentzug', async () => {
    const fixture = await render(false);
    expect(settingsButton(fixture)?.disabled).toBe(true);
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(favoriteApi.readSettings).not.toHaveBeenCalled();
    fixture.componentRef.setInput('canManage', true);
    await settle(fixture);
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    fixture.componentRef.setInput('canManage', false);
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
  it('behält bei Cloud-Konten den vorhandenen Einstellungsdialog', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('account', { ...account, executionMode: 'cloud' });
    await settle(fixture);
    expect(
      fixture.nativeElement.querySelectorAll('button[aria-label="Vinted-Kontoeinstellungen"]'),
    ).toHaveLength(1);
    settingsButton(fixture)?.click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Automatische Aktualisierung');
    expect(fixture.nativeElement.textContent).toContain('Neue Favoriten in der Glocke anzeigen');
    expect(scheduleApi.read).toHaveBeenCalled();
  });
  it('lässt den lokalen Dialog bei einer Datenaktualisierung desselben Kontos offen', async () => {
    const fixture = await render();
    settingsButton(fixture)?.click();
    await settle(fixture);
    fixture.componentRef.setInput('account', { ...account, lastSyncedAt: '2026-10-06T07:00:00Z' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
