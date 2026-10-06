import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { MarketplaceBrowserTestComponent } from '../marketplace-browser-test/marketplace-browser-test.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceCloudSetupApiService } from '../../services/marketplace-cloud-setup-api.service';
import { MarketplaceAccountsComponent } from './marketplace-accounts.component';
import {
  VintedLocalExtensionBridge,
  type VintedLocalAccountStatus,
} from '../../services/vinted-local-extension-bridge';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
const account = {
  ...createMarketplaceFixtures().connections[0],
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
};
const createConnection = vi.fn();
const renameConnection = vi.fn().mockResolvedValue(true);
const deleteConnection = vi.fn().mockResolvedValue(true);
const currentWorkspace = signal({ id: account.workspaceId });
const canManage = signal(true);
const loading = signal(false);
const reloadConnections = vi.fn().mockResolvedValue(undefined);
const remainingSlots = signal(10);
const connections = signal([account]);
const selectedConnection = signal(account);
const selectConnection = vi.fn().mockResolvedValue(undefined);
const extension = {
  localAccount: signal<VintedLocalAccountStatus | null | undefined>(undefined),
  installed: signal(false),
  checkInstallation: vi.fn(),
};
const cloud = {
  available: vi.fn().mockResolvedValue(true),
  begin: vi.fn().mockResolvedValue({ status: 'no_capacity' }),
  action: vi.fn().mockResolvedValue(undefined),
};
beforeEach(() => {
  TestBed.resetTestingModule();
  vi.clearAllMocks();
  currentWorkspace.set({ id: account.workspaceId });
  canManage.set(true);
  loading.set(false);
  reloadConnections.mockResolvedValue(undefined);
  remainingSlots.set(10);
  connections.set([account]);
  selectedConnection.set(account);
  extension.localAccount.set(undefined);
  cloud.begin.mockResolvedValue({ status: 'no_capacity' });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'operator' }),
          session: signal({ access_token: 'test-token' }),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace },
      },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          connections,
          canManage,
          accountLimit: 10,
          remainingSlots,
          selectedConnection,
          selectConnection,
          reloadConnections,
          busy: signal(false),
          loading,
          error: signal(null),
          mutationError: signal(null),
          clearMutationError: vi.fn(),
          createConnection,
          renameConnection,
          deleteConnection,
        },
      },
      { provide: MarketplaceCloudSetupApiService, useValue: cloud },
      { provide: VintedLocalExtensionBridge, useValue: extension },
    ],
  });
});
async function createFixture() {
  const fixture = TestBed.createComponent(MarketplaceAccountsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return fixture;
}
it('rendert ausschließlich Dialoge und keine zweite Kontotabelle', async () => {
  const fixture = await createFixture();
  expect(fixture.nativeElement.querySelector('app-data-table')).toBeNull();
  expect(fixture.nativeElement.querySelector('app-card')).toBeNull();
  expect(fixture.nativeElement.textContent.trim()).toBe('');
});
it('blockiert eine neue lokale Verbindung bei bekannter Browserprofilbindung', async () => {
  const fixture = await createFixture();
  extension.localAccount.set({
    boundUsername: 'profilkonto',
    boundConnectionId: '35000000-0000-4000-8000-000000000021',
    expiresAt: '2026-10-07T10:00:00.000Z',
    state: 'expired',
  });
  fixture.componentInstance.openDialog();
  fixture.componentInstance.name.setValue('Noch ein Konto');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('@profilkonto');
  expect(fixture.nativeElement.textContent).toContain('neues Browserprofil');
  await fixture.componentInstance.save();
  expect(createConnection).not.toHaveBeenCalled();
  fixture.componentInstance.connectionMethod.setValue('cloud');
  await fixture.componentInstance.save();
  expect(cloud.begin).toHaveBeenCalledOnce();
});
it('erlaubt unbekannten Erweiterungsstatus mit Profilanleitung und freie lokale Verbindung', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDialog();
  fixture.componentInstance.name.setValue('Mein Konto');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Chrome oder Brave');
  expect(fixture.nativeElement.textContent).toContain('Logo-Blase');
  expect(extension.checkInstallation).toHaveBeenCalled();
  extension.localAccount.set(null);
  createConnection.mockResolvedValue('new-account');
  await fixture.componentInstance.save();
  expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
    '/marketplaces/vinted/local-connect',
    'new-account',
  ]);
});
it('beachtet die Kontogrenze auch nach Öffnen und erlaubt weiterhin Umbenennen', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDialog();
  fixture.componentInstance.name.setValue('Elftes Konto');
  remainingSlots.set(0);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('10 Vinted-Konten');
  await fixture.componentInstance.save();
  expect(createConnection).not.toHaveBeenCalled();
  fixture.componentInstance.openDialog(account);
  fixture.componentInstance.name.setValue('Neuer Name');
  await fixture.componentInstance.save();
  expect(renameConnection).toHaveBeenCalledWith(account.connectionId, 'Neuer Name');
});
it('übernimmt die gewählte Cloudmethode und zeigt bei der Reservierung einen Wartedialog', async () => {
  const fixture = await createFixture();
  let resolve: (result: { status: 'no_capacity' }) => void = () => undefined;
  cloud.begin.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fixture.componentInstance.openDialog(undefined, 'cloud');
  fixture.componentInstance.name.setValue('Cloudkonto');
  expect(fixture.componentInstance.connectionMethod.value).toBe('cloud');
  const pending = fixture.componentInstance.save();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Cloud-Verfügbarkeit wird geprüft');
  expect(fixture.nativeElement.querySelector('app-loading-indicator')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('app-marketplace-browser-test')).toBeNull();
  fixture.componentInstance.closeDialog();
  resolve({ status: 'no_capacity' });
  await pending;
  fixture.detectChanges();
  expect(fixture.componentInstance.dialog()).toBeNull();
});
it.each(['context', 'permission', 'closed'] as const)(
  'öffnet nach spätem Cloudwechsel keinen Dialog bei %s',
  async (change) => {
    const fixture = await createFixture();
    const localAccount = { ...account, executionMode: 'local' as const };
    connections.set([localAccount]);
    let resolve: (result: unknown) => void = () => undefined;
    cloud.begin.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = fixture.componentInstance.upgrade(localAccount);
    if (change === 'context') currentWorkspace.set({ id: 'other-workspace' });
    else if (change === 'permission') canManage.set(false);
    else fixture.componentInstance.closeDialog();
    resolve({
      status: 'ready',
      setup: {
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        setupId: '37100000-0000-4000-8000-000000000031',
        sessionId: null,
        state: 'reserved',
      },
    });
    await pending;
    fixture.detectChanges();
    expect(fixture.componentInstance.dialog()).toBeNull();
  },
);
it('schließt einen offenen Dialog bei Rechteverlust', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDialog(account);
  canManage.set(false);
  fixture.detectChanges();
  expect(fixture.componentInstance.dialog()).toBeNull();
});
it.each(['create', 'rename', 'cloud'] as const)(
  'behält den autorisierten Dialog beim Neuladen nach %s und führt den nächsten Schritt aus',
  async (operation) => {
    const fixture = await createFixture();
    fixture.componentInstance.openDialog(
      operation === 'rename' ? account : undefined,
      operation === 'cloud' ? 'cloud' : 'local',
    );
    fixture.componentInstance.name.setValue('Aktualisiertes Konto');
    const originalDialog = fixture.componentInstance.dialog();
    let finishReload: () => void = () => undefined;
    const pauseReload = () => {
      loading.set(true);
      canManage.set(false);
      return new Promise<void>((resolve) => {
        finishReload = () => {
          canManage.set(true);
          loading.set(false);
          resolve();
        };
      });
    };
    if (operation === 'create')
      createConnection.mockImplementationOnce(async () => {
        await pauseReload();
        return 'new-account';
      });
    else if (operation === 'rename')
      renameConnection.mockImplementationOnce(async () => {
        await pauseReload();
        return true;
      });
    else {
      cloud.begin.mockResolvedValueOnce({
        status: 'ready',
        setup: {
          workspaceId: account.workspaceId,
          connectionId: account.connectionId,
          setupId: '37100000-0000-4000-8000-000000000031',
          sessionId: null,
          state: 'reserved',
        },
      });
      reloadConnections.mockImplementationOnce(pauseReload);
    }
    const pending = fixture.componentInstance.save();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const dialogDuringReload = fixture.componentInstance.dialog();
    const checkingDuringReload = fixture.componentInstance.checkingCloud();
    const nameDuringReload = fixture.componentInstance.name.value;
    finishReload();
    await pending;
    expect(dialogDuringReload).toBe(originalDialog);
    expect(nameDuringReload).toBe('Aktualisiertes Konto');
    if (operation === 'create')
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
        '/marketplaces/vinted/local-connect',
        'new-account',
      ]);
    else if (operation === 'rename') expect(fixture.componentInstance.dialog()).toBeNull();
    else {
      expect(checkingDuringReload).toBe(true);
      expect(fixture.componentInstance.dialog()?.mode).toBe('login');
    }
  },
);
it('öffnet während des Ladens ohne bestätigten Zugriff keinen neuen Dialog', async () => {
  const fixture = await createFixture();
  loading.set(true);
  canManage.set(false);
  fixture.componentInstance.openDialog();
  fixture.detectChanges();
  expect(fixture.componentInstance.dialog()).toBeNull();
});
it.each(['local', 'cloud', 'rename', 'delete'] as const)(
  'sperrt Eingaben und Schreibaufrufe während eines Neuladens für %s',
  async (operation) => {
    const fixture = await createFixture();
    if (operation === 'delete') fixture.componentInstance.openDelete(account);
    else
      fixture.componentInstance.openDialog(
        operation === 'rename' ? account : undefined,
        operation === 'cloud' ? 'cloud' : 'local',
      );
    fixture.componentInstance.name.setValue('Beibehaltenes Konto');
    loading.set(true);
    canManage.set(false);
    fixture.detectChanges();
    const nameDisabled = fixture.componentInstance.name.disabled;
    const methodDisabled = fixture.componentInstance.connectionMethod.disabled;
    const submitButton =
      operation === 'delete'
        ? ([...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
            button.textContent?.includes('Verknüpfung entfernen'),
          ) as HTMLButtonElement | undefined)
        : (fixture.nativeElement.querySelector(
            'button[type="submit"]',
          ) as HTMLButtonElement | null);
    const submitDisabled = submitButton?.disabled;
    if (operation === 'delete') await fixture.componentInstance.confirmDelete();
    else await fixture.componentInstance.save();
    canManage.set(true);
    loading.set(false);
    fixture.detectChanges();
    expect(nameDisabled).toBe(true);
    expect(methodDisabled).toBe(true);
    expect(submitDisabled).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
    expect(renameConnection).not.toHaveBeenCalled();
    expect(deleteConnection).not.toHaveBeenCalled();
    expect(cloud.begin).not.toHaveBeenCalled();
    expect(fixture.componentInstance.checkingCloud()).toBe(false);
    expect(fixture.componentInstance.name.enabled).toBe(true);
  },
);
it('beendet die Cloudprüfanzeige auch bei einem währenddessen gestarteten Neuladen', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDialog(undefined, 'cloud');
  fixture.componentInstance.name.setValue('Cloudkonto');
  cloud.begin.mockImplementationOnce(async () => {
    loading.set(true);
    canManage.set(false);
    return { status: 'no_capacity' };
  });
  await fixture.componentInstance.save();
  const checkingDuringReload = fixture.componentInstance.checkingCloud();
  canManage.set(true);
  loading.set(false);
  fixture.detectChanges();
  expect(checkingDuringReload).toBe(false);
  expect(fixture.componentInstance.checkingCloud()).toBe(false);
  expect(fixture.componentInstance.dialog()?.mode).toBe('create');
});
it('beendet mit einer alten Cloudantwort keine neu gestartete Cloudprüfung', async () => {
  const fixture = await createFixture();
  const responses: ((result: { status: 'no_capacity' }) => void)[] = [];
  cloud.begin.mockImplementation(
    () =>
      new Promise((resolve) => {
        responses.push(resolve);
      }),
  );
  fixture.componentInstance.openDialog(undefined, 'cloud');
  fixture.componentInstance.name.setValue('Erste Prüfung');
  const firstRequest = fixture.componentInstance.save();
  fixture.componentInstance.closeDialog();
  fixture.componentInstance.openDialog(undefined, 'cloud');
  fixture.componentInstance.name.setValue('Neue Prüfung');
  const secondRequest = fixture.componentInstance.save();
  expect(responses).toHaveLength(2);
  responses[0]?.({ status: 'no_capacity' });
  await firstRequest;
  const secondChecking = fixture.componentInstance.checkingCloud();
  responses[1]?.({ status: 'no_capacity' });
  await secondRequest;
  expect(secondChecking).toBe(true);
  expect(fixture.componentInstance.checkingCloud()).toBe(false);
  expect(fixture.componentInstance.dialog()?.mode).toBe('create');
  expect(fixture.componentInstance.name.value).toBe('Neue Prüfung');
});
it('schließt auch während des Ladens bei einem Workspacewechsel', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDialog(account);
  loading.set(true);
  canManage.set(false);
  currentWorkspace.set({ id: 'other-workspace' });
  fixture.detectChanges();
  expect(fixture.componentInstance.dialog()).toBeNull();
});
it.each(['context', 'permission', 'closed'] as const)(
  'öffnet nach später Kontoauswahl keinen Anmeldedialog bei %s',
  async (change) => {
    const fixture = await createFixture();
    let finishSelection: () => void = () => undefined;
    selectConnection.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSelection = resolve;
        }),
    );
    const pending = fixture.componentInstance.openLogin(account);
    if (change === 'context') currentWorkspace.set({ id: 'other-workspace' });
    else if (change === 'permission') canManage.set(false);
    else fixture.componentInstance.closeDialog();
    finishSelection();
    await pending;
    expect(fixture.componentInstance.dialog()).toBeNull();
  },
);
it('öffnet eine bestätigte Anmeldung für das aktuelle Konto', async () => {
  const fixture = await createFixture();
  await fixture.componentInstance.openLogin(account);
  expect(fixture.componentInstance.dialog()?.mode).toBe('login');
  expect(fixture.componentInstance.dialog()?.connectionId).toBe(account.connectionId);
});
it('beschreibt das Entfernen ausschließlich als Flipbase-Verknüpfung', async () => {
  const fixture = await createFixture();
  fixture.componentInstance.openDelete(account);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Verknüpfung');
  expect(fixture.nativeElement.textContent).toContain(
    'Browserprofil und Dein Vinted-Konto bleiben erhalten',
  );
  expect(fixture.nativeElement.textContent).not.toContain('Browserprofil werden entfernt');
});
it.each(['create', 'delete'] as const)(
  'erfüllt die AXE-Prüfung für den Dialog %s',
  async (mode) => {
    const fixture = await createFixture();
    if (mode === 'create') fixture.componentInstance.openDialog();
    else fixture.componentInstance.openDelete(account);
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  },
);
it('zeigt bei fehlender IP den Hinweis und lässt lokale Einrichtung ohne Browserdialog zu', async () => {
  const fixture = TestBed.createComponent(MarketplaceAccountsComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.openDialog();
  fixture.componentInstance.name.setValue('Cloudtest');
  fixture.componentInstance.connectionMethod.setValue('cloud');
  await fixture.componentInstance.save();
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain(
    'Aktuell sind keine freien Cloud-IPs vorhanden.',
  );
  expect(fixture.nativeElement.querySelector('app-marketplace-browser-test')).toBeNull();
  expect(createConnection).not.toHaveBeenCalled();
  expect(fixture.componentInstance.connectionMethod.enabled).toBe(true);
});

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: MarketplaceAccountsComponent,
      path: 'src/app/features/marketplaces/components/marketplace-accounts/marketplace-accounts.component.ts',
    },
    {
      type: MarketplaceBrowserTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: LoadingIndicatorComponent,
      path: 'src/app/shared/components/loading-indicator/loading-indicator.component.ts',
    },
    { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
    {
      type: DataTableComponent,
      path: 'src/app/shared/components/data-table/data-table.component.ts',
    },
    {
      type: CustomSearchInputComponent,
      path: 'src/app/shared/components/custom-search-input/custom-search-input.component.ts',
    },
    {
      type: TableColumnMenuComponent,
      path: 'src/app/shared/components/table-column-menu/table-column-menu.component.ts',
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
      type: TableActionButtonComponent,
      path: 'src/app/shared/components/table-action-button/table-action-button.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
