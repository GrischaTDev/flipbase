import { MarketplaceAccountHeaderComponent } from '../../../../shared/components/marketplace-account-header/marketplace-account-header.component';
import { AuthService } from '../../../../core/services/auth.service';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { KleinanzeigenAccountsComponent } from './kleinanzeigen-accounts.component';
import { KleinanzeigenAccountService } from '../../services/kleinanzeigen-account.service';
import { KleinanzeigenAccountActionsService } from '../../services/kleinanzeigen-account-actions.service';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
const workspace = '49000000-0000-4000-8000-000000000011';
const first = {
  workspaceId: workspace,
  connectionId: '12',
  externalAccountId: '123',
  displayName: 'Privates Testkonto',
  accountType: 'private' as const,
  status: 'connected' as const,
  lastSyncedAt: '2026-10-16T06:00:00Z',
  listingCount: 17,
  activeCount: null,
  quota: { used: 8, observedAt: '2026-10-16T06:00:00Z', source: 'account_settings' as const },
  localGrant: { active: true, canPublish: false, generation: 1, expiresAt: '2026-10-17T06:00:00Z' },
  sync: null,
};
const second = {
  ...first,
  connectionId: '13',
  externalAccountId: '124',
  displayName: 'Zweites Testkonto',
  accountType: 'commercial' as const,
  lastSyncedAt: null,
  listingCount: null,
  quota: null,
  localGrant: null,
};
let restore: () => void;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: MarketplaceAccountHeaderComponent,
      path: 'src/app/shared/components/marketplace-account-header/marketplace-account-header.component.ts',
    },
    {
      type: KleinanzeigenAccountsComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-accounts/kleinanzeigen-accounts.component.ts',
    },
    ...[
      [ButtonComponent, 'button'],
      [BadgeComponent, 'badge'],
      [NoticeBannerComponent, 'notice-banner'],
      [LoadingIndicatorComponent, 'loading-indicator'],
      [ModalShellComponent, 'modal-shell'],
    ].map(([type, name]) => ({
      type,
      path: 'src/app/shared/components/' + name + '/' + name + '.component.ts',
    })),
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
  ]);
});
afterAll(() => restore?.());
describe('Kleinanzeigen-Kontenoberfläche', () => {
  const auth = {
    currentUser: signal<{ id: string } | null>({ id: '49000000-0000-4000-8000-000000000001' }),
  };
  const api = { readAccounts: vi.fn() };
  const actions = {
    reconnect: vi.fn(),
    connect: vi.fn(),
    synchronize: vi.fn(),
    disconnect: vi.fn(),
    cancel: vi.fn(),
  };
  const bridge = {
    capabilities: signal({ accounts: true, sync: true, publish: false }),
    checking: signal(false),
    checkInstallation: vi.fn(),
    status: vi.fn(),
    cancel: vi.fn(),
  };
  beforeEach(() => {
    auth.currentUser.set({ id: '49000000-0000-4000-8000-000000000001' });
    api.readAccounts
      .mockReset()
      .mockResolvedValue({ workspaceId: workspace, canManage: true, accounts: [first, second] });
    for (const fn of Object.values(actions)) fn.mockReset();
    actions.connect.mockResolvedValue({
      ...first,
      generation: 1,
      expiresAt: '2026-10-17T06:00:00Z',
      canPublish: false,
    });
    bridge.capabilities.set({ accounts: true, sync: true, publish: false });
    bridge.status.mockReset().mockResolvedValue({
      ...first,
      generation: 1,
      expiresAt: '2026-10-17T06:00:00Z',
      canPublish: false,
    });
    TestBed.configureTestingModule({
      imports: [KleinanzeigenAccountsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: KleinanzeigenAccountService, useValue: api },
      ],
    });
    TestBed.overrideProvider(KleinanzeigenAccountActionsService, { useValue: actions });
    TestBed.overrideProvider(KleinanzeigenExtensionBridge, { useValue: bridge });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function create() {
    const fixture = TestBed.createComponent(KleinanzeigenAccountsComponent);
    fixture.componentRef.setInput('workspaceId', workspace);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('zeigt beim Hinzufügen keine zweite Kontenliste und verlangt zunächst das Entfernen der bestehenden Bindung', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('setupOnly', true);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('article')).toHaveLength(0);
    expect(element.textContent).toContain('Verbundenes Kleinanzeigen-Konto:');
    expect(element.textContent).not.toContain('Dieses Browserprofil:');
    expect(
      Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Konto entfernen'),
      ),
    ).toBeDefined();
    expect(
      Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Konto verbinden'),
      ),
    ).toBeUndefined();
  });
  it('löst nach einem früheren Serverwiderruf auch eine verwaiste lokale Bindung', async () => {
    api.readAccounts.mockResolvedValue({ workspaceId: workspace, canManage: true, accounts: [] });
    const fixture = await create();
    fixture.componentRef.setInput('setupOnly', true);
    fixture.detectChanges();
    const remove = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Konto entfernen'));
    expect(remove).toBeDefined();
    remove!.click();
    fixture.detectChanges();
    actions.disconnect.mockResolvedValue('done');
    await fixture.componentInstance.confirmDisconnect();
    expect(actions.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: first.connectionId, workspaceId: workspace }),
    );
    expect(fixture.componentInstance.localBinding()).toBeNull();
  });
  it('gibt das Browserprofil nach bestätigtem Entfernen für ein anderes Konto frei', async () => {
    const fixture = await create();
    actions.disconnect.mockResolvedValue('done');
    api.readAccounts.mockResolvedValue({
      workspaceId: workspace,
      canManage: true,
      accounts: [second],
    });
    fixture.componentInstance.disconnecting.set(first);
    await fixture.componentInstance.confirmDisconnect();
    fixture.detectChanges();
    expect(actions.disconnect).toHaveBeenCalledWith(first);
    expect(fixture.componentInstance.localBinding()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Privates Testkonto');
    await fixture.componentInstance.connect();
    expect(actions.connect).toHaveBeenCalledWith(workspace, true);
  });
  it('behauptet nach einem gescheiterten Widerruf keine Entfernung', async () => {
    const fixture = await create();
    actions.disconnect.mockRejectedValue(new Error('Widerruf fehlgeschlagen'));
    fixture.componentInstance.disconnecting.set(first);
    await fixture.componentInstance.confirmDisconnect();
    expect(fixture.componentInstance.localBinding()?.connectionId).toBe(first.connectionId);
    expect(fixture.componentInstance.disconnecting()).toEqual(first);
    expect(fixture.componentInstance.error()).toBe('Widerruf fehlgeschlagen');
  });
  it('zeigt Konten getrennt und unterscheidet Inseratzahl vom offiziellen Kontingent', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Privates Testkonto');
    expect(text).toContain('Zweites Testkonto');
    expect(text).toMatch(/Inserate\s+17/u);
    expect(text).toMatch(/8\s*\/\s*100/u);
    expect(text).toContain('Gewerblich');
    expect(text).toContain('Inseratzahl unbekannt');
  });
  it('verwaltet im Kontokontext nur das gewählte Konto ohne neue Kontoverbindung', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('connectionId', '13');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Zweites Testkonto');
    expect(element.textContent).not.toContain('Privates Testkonto');
    expect(element.textContent).not.toContain('Browserprofil verbinden');
    expect(element.querySelectorAll('article')).toHaveLength(1);
    fixture.componentRef.setInput('connectionId', 'nicht-vorhanden');
    fixture.detectChanges();
    expect(element.querySelectorAll('article')).toHaveLength(0);
    expect(element.textContent).toContain('Dieses Konto ist nicht mehr verfügbar');
  });
  it('erneuert die abgelaufene Freigabe im gewählten Konto nach bewusster Bestätigung', async () => {
    bridge.status.mockResolvedValue(null);
    const fixture = await create();
    fixture.componentRef.setInput('connectionId', first.connectionId);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('keine gültige Freigabe');
    expect(element.textContent).not.toContain('anderes Kleinanzeigen-Konto');
    actions.reconnect.mockResolvedValue({ ...first, generation: 2, canPublish: true });
    const renew = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Freigabe erneuern'),
    );
    expect(renew).toBeDefined();
    expect(actions.reconnect).not.toHaveBeenCalled();
    renew!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(actions.reconnect).toHaveBeenCalledWith(first, true);
    expect(fixture.componentInstance.localBinding()?.generation).toBe(2);
  });
  it('bietet für eine bestehende Lesefreigabe die Erneuerung mit Veröffentlichung an', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('connectionId', first.connectionId);
    fixture.detectChanges();
    actions.reconnect.mockResolvedValue({ ...first, generation: 2, canPublish: true });
    const renew = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Freigabe erneuern'));
    expect(renew).toBeDefined();
    renew!.click();
    await fixture.whenStable();
    expect(actions.reconnect).toHaveBeenCalledWith(first, true);
    expect(fixture.componentInstance.localBinding()?.canPublish).toBe(true);
  });
  it('erhält den letzten bestätigten Bestand bei einem gescheiterten neuen Abruf', async () => {
    const fixture = await create();
    actions.synchronize.mockRejectedValue(new Error('Abruf unterbrochen'));
    await fixture.componentInstance.synchronize(first);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Abruf unterbrochen');
    expect(fixture.nativeElement.textContent).toMatch(/Inserate\s+17/u);
  });
  it('fragt beim Hinzufügen die Veröffentlichungsfreigabe ohne zusätzliche Checkbox an', async () => {
    bridge.status.mockResolvedValue(null);
    const fixture = await create();
    fixture.componentRef.setInput('setupOnly', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="checkbox"]')).toBeNull();
    expect(actions.connect).not.toHaveBeenCalled();
    await fixture.componentInstance.connect();
    expect(actions.connect).toHaveBeenCalledWith(workspace, true);
  });
  it('behauptet bei abgelehnter Erweiterungsbestätigung keine neue Verbindung', async () => {
    bridge.status.mockResolvedValue(null);
    actions.connect.mockRejectedValue(new Error('Verbindung abgebrochen'));
    const fixture = await create();
    const connected = vi.fn();
    fixture.componentInstance.connected.subscribe(connected);
    await fixture.componentInstance.connect();
    expect(actions.connect).toHaveBeenCalledWith(workspace, true);
    expect(fixture.componentInstance.localBinding()).toBeNull();
    expect(fixture.componentInstance.error()).toBe('Verbindung abgebrochen');
    expect(connected).not.toHaveBeenCalled();
  });
  it('bietet ohne Kleinanzeigen-Fähigkeit die Einrichtung statt einer vermeintlich bereiten Verbindung an', async () => {
    bridge.capabilities.set({ accounts: false, sync: false, publish: false });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Erweiterung');
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(
      buttons.find((button) => button.textContent?.includes('Konto verbinden'))?.disabled,
    ).toBe(true);
    expect(actions.connect).not.toHaveBeenCalled();
  });
  it('übernimmt verspätete Kontodaten nach einem Workspacewechsel nicht', async () => {
    let resolve!: (value: unknown) => void;
    api.readAccounts.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const fixture = TestBed.createComponent(KleinanzeigenAccountsComponent);
    fixture.componentRef.setInput('workspaceId', workspace);
    fixture.detectChanges();
    const next = '49000000-0000-4000-8000-000000000012';
    api.readAccounts.mockResolvedValue({ workspaceId: next, canManage: true, accounts: [] });
    fixture.componentRef.setInput('workspaceId', next);
    fixture.detectChanges();
    await fixture.whenStable();
    resolve({ workspaceId: workspace, canManage: true, accounts: [first] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Privates Testkonto');
  });
  it.each([null, { id: '49000000-0000-4000-8000-000000000002' }])(
    'verwirft verspätete Kontodaten nach Wechsel des Nutzers %s',
    async (nextUser) => {
      let resolve!: (value: unknown) => void;
      api.readAccounts.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const fixture = TestBed.createComponent(KleinanzeigenAccountsComponent);
      fixture.componentRef.setInput('workspaceId', workspace);
      fixture.detectChanges();
      api.readAccounts.mockResolvedValue({
        workspaceId: workspace,
        canManage: false,
        accounts: [],
      });
      auth.currentUser.set(nextUser);
      fixture.detectChanges();
      await fixture.whenStable();
      resolve({ workspaceId: workspace, canManage: true, accounts: [first] });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Privates Testkonto');
      expect(fixture.componentInstance.canManage()).toBe(false);
    },
  );
  it('zeigt ein ausgeschöpftes beobachtetes Privatkontingent ausdrücklich', async () => {
    api.readAccounts.mockResolvedValue({
      workspaceId: workspace,
      canManage: true,
      accounts: [{ ...first, quota: { ...first.quota, used: 100 } }],
    });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Kostenloses Kontingent ausgeschöpft');
  });
});
