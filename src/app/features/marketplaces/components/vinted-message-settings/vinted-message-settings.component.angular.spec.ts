import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { MarketplaceMessageNotificationApiService } from '../../services/marketplace-message-notification-api.service';
import { VintedMessageSettingsComponent } from './vinted-message-settings.component';
import { messageNotificationCategorySettings } from '../../models/marketplace-message-notifications';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
let restore: (() => void) | undefined;
let api: { readSettings: ReturnType<typeof vi.fn>; setCategorySettings: ReturnType<typeof vi.fn> };
const user = signal<{ id: string } | null>({ id: 'user-a' });
const workspace = signal({ id: scope.workspaceId });
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedMessageSettingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-message-settings/vinted-message-settings.component.ts',
    },
    {
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  user.set({ id: 'user-a' });
  workspace.set({ id: scope.workspaceId });
  api = {
    readSettings: vi.fn().mockResolvedValue({ ...scope, enabled: true, version: 2 }),
    setCategorySettings: vi.fn().mockResolvedValue({ ...scope, enabled: false, version: 3 }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: MarketplaceMessageNotificationApiService, useValue: api },
    ],
  });
});
async function settle(
  fixture: ReturnType<typeof TestBed.createComponent<VintedMessageSettingsComponent>>,
) {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  fixture.detectChanges();
}
async function render() {
  const fixture = TestBed.createComponent(VintedMessageSettingsComponent);
  fixture.componentRef.setInput('account', scope);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}
describe('Kontoweise Nachrichteneinstellung', () => {
  it('zeigt alle belegten Kategorien und speichert eine Zahlungswahl unabhängig von Chatnachrichten', async () => {
    const initial = { ...scope, enabled: true, version: 2 };
    const saved = {
      ...initial,
      version: 3,
      categories: { ...messageNotificationCategorySettings(initial), payments: false },
    };
    const fixture = await render();
    expect(
      [...fixture.nativeElement.querySelectorAll('[role="switch"]')].map((node) =>
        (node as HTMLElement).getAttribute('aria-label'),
      ),
    ).toEqual([
      'Neue Nachrichten',
      'Preisvorschläge',
      'Bestellungen und Verkäufe',
      'Versand und Zustellung',
      'Zahlungen und Rückerstattungen',
      'Neue Bewertungen',
      'Weitere Statusmeldungen',
    ]);
    api.setCategorySettings.mockResolvedValueOnce(saved);
    fixture.componentInstance.categoryControls.payments.setValue(false);
    expect(api.setCategorySettings).toHaveBeenCalledWith(initial, 'payments', false);
    await settle(fixture);
    expect(fixture.componentInstance.categoryControls.payments.value).toBe(false);
    expect(fixture.componentInstance.categoryControls.messages.value).toBe(true);
    expect(fixture.componentInstance.categoryControls.orders.value).toBe(true);
    expect(fixture.componentInstance.settings()?.version).toBe(3);
  });
  it('setzt bei abgelehnter Kategorienwahl sämtliche bestätigten Werte zurück', async () => {
    const fixture = await render();
    api.setCategorySettings.mockRejectedValueOnce(new Error('Keine Berechtigung'));
    fixture.componentInstance.categoryControls.feedback.setValue(false);
    await settle(fixture);
    expect(fixture.componentInstance.categoryControls.feedback.value).toBe(true);
    expect(fixture.componentInstance.categoryControls.messages.value).toBe(true);
    expect(fixture.componentInstance.categoryControls.feedback.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Keine Berechtigung');
  });
  it('sperrt weitere Kategorien bis zur versionsgeschützten Bestätigung und erhält andere Werte', async () => {
    const initial = { ...scope, enabled: true, version: 2 };
    const saved = {
      ...initial,
      version: 3,
      categories: { ...messageNotificationCategorySettings(initial), shipping: false },
    };
    let finish: (value: typeof saved) => void = () => undefined;
    api.setCategorySettings.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = await render();
    fixture.componentInstance.categoryControls.shipping.setValue(false);
    await settle(fixture);
    for (const control of Object.values(fixture.componentInstance.categoryControls))
      expect(control.disabled).toBe(true);
    expect(fixture.componentInstance.categoryControls.messages.value).toBe(true);
    finish(saved);
    await settle(fixture);
    for (const control of Object.values(fixture.componentInstance.categoryControls))
      expect(control.disabled).toBe(false);
    expect(fixture.componentInstance.categoryControls.shipping.value).toBe(false);
    expect(fixture.componentInstance.categoryControls.messages.value).toBe(true);
    expect(api.setCategorySettings).toHaveBeenCalledTimes(1);
  });
  it('zeigt den bestätigten Zustand und speichert ohne Optimismus mit dessen Version', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.enabledControl.value).toBe(true);
    expect(fixture.componentInstance.enabledControl.disabled).toBe(false);
    fixture.componentInstance.enabledControl.setValue(false);
    expect(api.setCategorySettings).toHaveBeenCalledWith(
      { ...scope, enabled: true, version: 2 },
      'messages',
      false,
    );
    expect(fixture.componentInstance.settings()?.enabled).toBe(true);
    await settle(fixture);
    expect(fixture.componentInstance.settings()).toEqual({ ...scope, enabled: false, version: 3 });
  });
  it('setzt bei Speicherfehler den bestätigten Zustand zurück und bietet erneutes Laden', async () => {
    const fixture = await render();
    api.setCategorySettings.mockRejectedValueOnce(new Error('Zwischenzeitlich geändert'));
    fixture.componentInstance.enabledControl.setValue(false);
    await settle(fixture);
    expect(fixture.componentInstance.enabledControl.value).toBe(true);
    expect(fixture.componentInstance.enabledControl.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Zwischenzeitlich geändert');
    const retry = Array.from(fixture.nativeElement.querySelectorAll('button')).find((node) =>
      (node as HTMLButtonElement).textContent?.includes('Erneut versuchen'),
    ) as HTMLButtonElement;
    retry.click();
    await settle(fixture);
    expect(api.readSettings).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.error()).toBeNull();
  });
  it('zeigt nach fehlgeschlagenem Lesen keinen erfundenen Aktivzustand', async () => {
    api.readSettings.mockRejectedValueOnce(new Error('Nicht verfügbar'));
    const fixture = await render();
    expect(fixture.componentInstance.settings()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-custom-checkbox')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nicht verfügbar');
  });
  it('erhält den Schalter ohne neuen Abruf bei aktualisiertem Kontoobjekt', async () => {
    const fixture = await render();
    const control = fixture.nativeElement.querySelector('[role="switch"]');
    fixture.componentRef.setInput('account', { ...scope });
    fixture.detectChanges();
    await settle(fixture);
    expect(api.readSettings).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[role="switch"]')).toBe(control);
    expect(fixture.componentInstance.loading()).toBe(false);
  });
  it('verwirft eine verspätete Antwort nach einem Kontowechsel', async () => {
    let finish: (settings: typeof scope & { enabled: boolean; version: number }) => void = () =>
      undefined;
    api.readSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const fixture = await render();
    fixture.componentRef.setInput('account', { ...scope, connectionId: 'account-b' });
    api.readSettings.mockResolvedValueOnce({
      ...scope,
      connectionId: 'account-b',
      enabled: false,
      version: 8,
    });
    fixture.detectChanges();
    await settle(fixture);
    finish({ ...scope, enabled: true, version: 2 });
    await settle(fixture);
    expect(fixture.componentInstance.settings()?.connectionId).toBe('account-b');
  });
  it('blendet nach Logout die Einstellung aus und verwirft eine alte Speicherung', async () => {
    let finish: (settings: typeof scope & { enabled: boolean; version: number }) => void = () =>
      undefined;
    const fixture = await render();
    api.setCategorySettings.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fixture.componentInstance.enabledControl.setValue(false);
    user.set(null);
    await settle(fixture);
    finish({ ...scope, enabled: false, version: 3 });
    await settle(fixture);
    expect(fixture.componentInstance.settings()).toBeNull();
  });
});
