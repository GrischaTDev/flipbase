import '@angular/compiler';
import { Component, computed, forwardRef, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { globSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { VintedLocalReadiness } from '../../models/vinted-local-readiness';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceCloudSetupStore } from '../../services/marketplace-cloud-setup.store';
import { VintedAccountPreviewsStore } from '../../services/vinted-account-previews.store';
import { VintedLocalExtensionBridge } from '../../services/vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from '../../services/vinted-local-extension.store';
import { VintedLocalRuntimeStore } from '../../services/vinted-local-runtime.store';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { MarketplaceAccountsComponent } from '../marketplace-accounts/marketplace-accounts.component';
import { VintedFavoriteSettingsComponent } from '../vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedAccountGridComponent } from './vinted-account-grid.component';

class AccountManagementStub {
  readonly openLogin = vi.fn();
  readonly upgrade = vi.fn();
  readonly openDelete = vi.fn();
  readonly openDialog = vi.fn();
}
Component({
  selector: 'app-marketplace-accounts',
  template: '',
  providers: [
    { provide: MarketplaceAccountsComponent, useExisting: forwardRef(() => AccountManagementStub) },
  ],
})(AccountManagementStub);
class FavoriteSettingsStub {}
Component({
  selector: 'app-vinted-favorite-settings',
  template: '<h3>Benachrichtigungen</h3>',
  inputs: ['account'],
})(FavoriteSettingsStub);

const account = { ...createMarketplaceFixtures().connections[0], executionMode: 'local' as const };
const accountList = signal<readonly MarketplaceConnection[]>([account]);
const canManage = signal(true);
const selected = signal<MarketplaceConnection | null>(null);
const workspace = signal({ id: account.workspaceId });
const readiness = signal<VintedLocalReadiness | null>(null);
const runtime = { readiness, checking: signal(false), error: signal(null), check: vi.fn() };
const accounts = {
  connections: accountList,
  canManage,
  accountLimit: 10,
  remainingSlots: computed(() => 10 - accountList().length),
  loading: signal(false),
  busy: signal(false),
  error: signal(null),
  mutationError: signal(null),
  selectedConnection: selected,
  selectConnection: vi.fn(async (connectionId: string) => {
    selected.set(
      accountList().find((connection) => connection.connectionId === connectionId) ?? null,
    );
  }),
  syncSelectedConnection: vi.fn(),
  reorderConnections: vi.fn().mockResolvedValue(true),
  setPaused: vi.fn(),
};
const local = {
  busy: signal(false),
  error: signal(null),
  loadConnection: vi.fn(),
  isCurrentConnection: vi.fn(() => true),
  hasValidBinding: vi.fn(() => true),
  sync: vi.fn(),
  revoke: vi.fn(),
};
const cloud = { canSetup: signal(true), busy: signal(false) };
let restore: (() => void) | undefined;
beforeAll(async () => {
  const resourceFiles = new Map(
    [...globSync('src/app/**/*.{html,scss}')].map((path) => [basename(path), resolve(path)]),
  );
  await ɵresolveComponentResources((url) => {
    const path = resourceFiles.get(basename(url));
    if (!path) throw new Error(`Unbekannte Komponentenvorlage: ${url}`);
    return Promise.resolve(readFileSync(path, 'utf8'));
  });
  restore = await prepareMarketplaceRendering([
    {
      type: VintedAccountGridComponent,
      path: 'src/app/features/marketplaces/components/vinted-account-grid/vinted-account-grid.component.ts',
    },
    ...[
      [BadgeComponent, 'badge'],
      [ButtonComponent, 'button'],
      [CardComponent, 'card'],
      [ModalShellComponent, 'modal-shell'],
      [NoticeBannerComponent, 'notice-banner'],
      [ProductThumbnailComponent, 'product-thumbnail'],
    ].map(([type, folder]) => ({
      type,
      path: `src/app/shared/components/${folder}/${folder}.component.ts`,
    })),
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  vi.clearAllMocks();
  accountList.set([account]);
  canManage.set(true);
  workspace.set({ id: account.workspaceId });
  selected.set(null);
  accounts.busy.set(false);
  runtime.checking.set(false);
  cloud.canSetup.set(true);
  cloud.busy.set(false);
  readiness.set({
    ...account,
    state: 'ready',
    checkedAt: '2026-10-06T10:00:00Z',
    version: '1.6.0',
  });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MarketplaceAccountStore, useValue: accounts },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: VintedLocalRuntimeStore, useValue: runtime },
      {
        provide: VintedLocalExtensionBridge,
        useValue: { installed: signal(true), checkInstallation: vi.fn() },
      },
      { provide: VintedLocalExtensionStore, useValue: local },
    ],
  });
  TestBed.overrideComponent(VintedAccountGridComponent, {
    remove: { imports: [MarketplaceAccountsComponent, VintedFavoriteSettingsComponent] },
    add: { imports: [AccountManagementStub, FavoriteSettingsStub] },
  });
  TestBed.overrideComponent(VintedAccountGridComponent, {
    set: {
      templateUrl: undefined,
      template: readFileSync(
        resolve(
          'src/app/features/marketplaces/components/vinted-account-grid/vinted-account-grid.component.html',
        ),
        'utf8',
      ),
      providers: [
        { provide: MarketplaceCloudSetupStore, useValue: cloud },
        {
          provide: VintedAccountPreviewsStore,
          useValue: {
            tiles: computed(() =>
              accountList().map((connection) => ({
                connection,
                preview: null,
                loading: false,
                error: false,
              })),
            ),
          },
        },
      ],
    },
  });
});
async function render() {
  const fixture = TestBed.createComponent(VintedAccountGridComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  // Der bestehende Vitest-JIT-Lauf liefert keine Signal-ViewQuery-Metadaten.
  const management = fixture.debugElement.query(By.directive(AccountManagementStub));
  Object.defineProperty(fixture.componentInstance, 'management', {
    value: signal(management.componentInstance as AccountManagementStub),
  });
  return { fixture, element: fixture.nativeElement as HTMLElement };
}
function primaryAction(element: HTMLElement): HTMLElement | null {
  return element.querySelector(
    'app-card app-button[variant="primary"] button, app-card app-button[variant="primary"] a',
  );
}
describe('Kompakte Vinted-Konten', () => {
  it('zeigt einen Status und eine Synchronisierungsaktion innerhalb der Karte ohne Kennzahlen oder Platzhalter', async () => {
    const { element } = await render();
    expect(element.querySelector('app-card dl')).toBeNull();
    expect(element.textContent).not.toContain('Bewertung noch unbekannt');
    expect(
      element.querySelector('app-card')?.parentElement?.querySelector(':scope > div app-button'),
    ).toBeNull();
    expect(primaryAction(element)?.textContent).toContain('Synchronisieren');
    expect(element.querySelectorAll('app-card app-button[variant="primary"]')).toHaveLength(1);
    expect(element.querySelector('app-card app-badge')?.textContent).toContain('Lokal');
    primaryAction(element)?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(local.sync).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(element.querySelector('a a')).toBeNull();
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
  it.each([
    ['expired', 'Freigabe erneuern'],
    ['login_required', 'Vinted öffnen'],
    ['paused', 'Einstellungen öffnen'],
    ['identity_mismatch', 'Browserprofil prüfen'],
    ['permission_required', 'Verbindung prüfen'],
  ] as const)('erhält die Reparaturaktion für %s innerhalb der Karte', async (state, label) => {
    readiness.update((current) => (current ? { ...current, state } : null));
    const { element } = await render();
    expect(primaryAction(element)?.textContent).toContain(label);
    expect(element.querySelectorAll('app-card app-button[variant="primary"]')).toHaveLength(1);
    if (state === 'expired')
      expect(primaryAction(element)?.getAttribute('href')).toContain('/local-connect/');
    if (state === 'login_required')
      expect(primaryAction(element)?.getAttribute('href')).toBe('https://www.vinted.de/');
  });
  it('synchronisiert ein Cloudkonto über den bestehenden Kontostore', async () => {
    accountList.set([{ ...account, executionMode: 'cloud' }]);
    const { element } = await render();
    expect(primaryAction(element)?.textContent).toContain('Synchronisieren');
    primaryAction(element)?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(accounts.selectConnection).toHaveBeenCalledWith(account.connectionId);
    expect(accounts.syncSelectedConnection).toHaveBeenCalledOnce();
    expect(local.sync).not.toHaveBeenCalled();
  });
  it('öffnet die IP-Einrichtung für ein bestehendes Cloudkonto', async () => {
    const cloudAccount = { ...account, executionMode: 'cloud' as const };
    accountList.set([cloudAccount]);
    const { element, fixture } = await render();
    element.querySelector<HTMLButtonElement>('button[aria-label$="einstellen"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const setup = [...element.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent?.includes('Cloud-IP einrichten'),
    );
    expect(setup?.disabled).toBe(false);
    setup?.click();
    expect(fixture.componentInstance.management()?.upgrade).toHaveBeenCalledWith(cloudAccount);
    expect(element.textContent).not.toContain('Auf Cloud wechseln');
  });
  it.each(['paused', 'blocked'] as const)(
    'sperrt die IP-Einrichtung eines %s Cloudkontos',
    async (status) => {
      accountList.set([{ ...account, executionMode: 'cloud', status }]);
      const { element, fixture } = await render();
      element.querySelector<HTMLButtonElement>('button[aria-label$="einstellen"]')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const setup = [...element.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
        (button) => button.textContent?.includes('Cloud-IP einrichten'),
      );
      expect(setup?.disabled).toBe(true);
    },
  );
  it('sortiert Karten per Tastatur ohne Griff oder Pfeilbuttons und zeigt den Cloudwechsel direkt', async () => {
    accountList.set([account, { ...account, connectionId: 'account-b', displayName: 'Konto B' }]);
    const { element, fixture } = await render();
    expect(element.querySelectorAll('app-card')).toHaveLength(2);
    expect(element.querySelector('[cdkDragHandle]')).toBeNull();
    expect(element.querySelector('button[aria-label$="verschieben"]')).toBeNull();
    element
      .querySelector('app-card a')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }),
      );
    await Promise.resolve();
    expect(accounts.reorderConnections).toHaveBeenCalledWith(['account-b', account.connectionId]);
    const upgrade = [...element.querySelectorAll<HTMLButtonElement>('app-card button')].find(
      (button) => button.textContent?.includes('Auf Cloud wechseln'),
    );
    expect(upgrade).toBeDefined();
    upgrade?.click();
    expect(fixture.componentInstance.management()?.upgrade).toHaveBeenCalledWith(account);
    expect(TestBed.inject(Router).url).toBe('/');
  });
  it('ordnet Einstellungen nach Aufgaben und erklärt die Wirkung von Trennen und Entfernen', async () => {
    const { element, fixture } = await render();
    element.querySelector<HTMLButtonElement>('button[aria-label$="einstellen"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]');
    expect(
      [...(dialog?.querySelectorAll('h3') ?? [])].map((heading) => heading.textContent?.trim()),
    ).toEqual(['Verbindung', 'Benachrichtigungen', 'Kontoverwaltung', 'Trennen und entfernen']);
    expect(dialog?.textContent).toContain('Verbindung prüfen');
    expect(dialog?.textContent).toContain('Konto entfernen');
    expect(dialog?.textContent).toContain('gespeicherten Daten bleiben erhalten');
    expect(dialog?.textContent).not.toContain('Auf Cloud wechseln');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
  it('zeigt einen nicht verfügbaren Cloudwechsel ohne die lokale Synchronisierung zu sperren', async () => {
    cloud.canSetup.set(false);
    const { element } = await render();
    const upgrade = [...element.querySelectorAll<HTMLButtonElement>('app-card button')].find(
      (button) => button.textContent?.includes('Auf Cloud wechseln'),
    );
    expect(upgrade?.disabled).toBe(true);
    expect((primaryAction(element) as HTMLButtonElement).disabled).toBe(false);
    primaryAction(element)?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(local.sync).toHaveBeenCalledOnce();
  });
  it.each(['mousedown', 'touchstart'])(
    'nimmt Bedienelemente bei %s vom Ziehen aus und lässt die übrige Kartenfläche ziehbar',
    async (eventType) => {
      const { element } = await render();
      const pointerDown = vi.fn();
      element.addEventListener(eventType, pointerDown);
      element
        .querySelector('app-card app-button[variant="primary"] svg')
        ?.dispatchEvent(new Event(eventType, { bubbles: true }));
      expect(pointerDown).not.toHaveBeenCalled();
      element
        .querySelector('app-card div.relative.z-10')
        ?.dispatchEvent(new Event(eventType, { bubbles: true }));
      expect(pointerDown).toHaveBeenCalledOnce();
    },
  );
  it('kennzeichnet ein ungebundenes Konto trotz fremder Bereitschaft nicht als verbunden', async () => {
    accountList.set([{ ...account, externalAccountId: null }]);
    const { element } = await render();
    expect(primaryAction(element)?.textContent).toContain('Lokal verbinden');
    expect(element.textContent).toContain('Lokal noch nicht verbunden');
    expect(local.sync).not.toHaveBeenCalled();
  });
  it.each(['paused', 'blocked', 'needs_login', 'disconnected'] as const)(
    'erhält die Cloud-Reparatur bei %s',
    async (status) => {
      accountList.set([{ ...account, executionMode: 'cloud', status }]);
      const { element } = await render();
      expect(primaryAction(element)?.textContent).toContain(
        status === 'paused' || status === 'blocked' ? 'Einstellungen öffnen' : 'Cloud verbinden',
      );
      expect(accounts.syncSelectedConnection).not.toHaveBeenCalled();
    },
  );
  it('bricht die Cloud-Synchronisierung bei zwischenzeitlichem Arbeitsbereichwechsel ab', async () => {
    accountList.set([{ ...account, executionMode: 'cloud' }]);
    const { element } = await render();
    accounts.selectConnection.mockImplementationOnce(async () => {
      selected.set(accountList()[0]);
      workspace.set({ id: 'anderer-arbeitsbereich' });
    });
    primaryAction(element)?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(accounts.syncSelectedConnection).not.toHaveBeenCalled();
  });
  it('verhindert Live-Aktionen ohne Verwaltungsrecht', async () => {
    const { element, fixture } = await render();
    canManage.set(false);
    fixture.detectChanges();
    expect((primaryAction(element) as HTMLButtonElement | null)?.disabled).toBe(true);
    primaryAction(element)?.click();
    expect(local.sync).not.toHaveBeenCalled();
  });
});
