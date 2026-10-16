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
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
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
      type: KleinanzeigenAccountsComponent,
      path: 'src/app/features/marketplaces/components/kleinanzeigen-accounts/kleinanzeigen-accounts.component.ts',
    },
    ...[
      [CardComponent, 'card'],
      [ButtonComponent, 'button'],
      [BadgeComponent, 'badge'],
      [NoticeBannerComponent, 'notice-banner'],
      [CustomCheckboxComponent, 'custom-checkbox'],
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
  const actions = { connect: vi.fn(), synchronize: vi.fn(), disconnect: vi.fn(), cancel: vi.fn() };
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
  it('zeigt Konten getrennt und unterscheidet Inseratzahl vom offiziellen Kontingent', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Privates Testkonto');
    expect(text).toContain('Zweites Testkonto');
    expect(text).toContain('17 gespeicherte Inserate');
    expect(text).toContain('8 von 100');
    expect(text).toContain('Gewerblich');
    expect(text).toContain('Inseratzahl unbekannt');
  });
  it('erhält den letzten bestätigten Bestand bei einem gescheiterten neuen Abruf', async () => {
    const fixture = await create();
    actions.synchronize.mockRejectedValue(new Error('Abruf unterbrochen'));
    await fixture.componentInstance.synchronize(first);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Abruf unterbrochen');
    expect(fixture.nativeElement.textContent).toContain('17 gespeicherte Inserate');
  });
  it.each([false, true])(
    'verbindet nur mit der ausdrücklich gewählten Schreibfreigabe %s',
    async (allowed) => {
      bridge.status.mockResolvedValue(null);
      const fixture = await create();
      fixture.componentInstance.publishPermission.setValue(allowed);
      await fixture.componentInstance.connect();
      expect(actions.connect).toHaveBeenCalledWith(workspace, allowed);
    },
  );
  it('bietet ohne Kleinanzeigen-Fähigkeit die Einrichtung statt einer vermeintlich bereiten Verbindung an', async () => {
    bridge.capabilities.set({ accounts: false, sync: false, publish: false });
    const fixture = await create();
    expect(fixture.nativeElement.textContent).toContain('Erweiterung');
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(
      buttons.find((button) => button.textContent?.includes('Angemeldetes Konto verbinden'))
        ?.disabled,
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
