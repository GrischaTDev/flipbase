import { VintedFavoriteSettingsComponent } from './components/vinted-favorite-settings/vinted-favorite-settings.component';
import { VintedLocalConnectComponent } from './components/vinted-local-connect/vinted-local-connect.component';
import { VintedSetupComponent } from './components/vinted-setup/vinted-setup.component';
import { VintedLocalExtensionApiService } from './services/vinted-local-extension-api.service';
import { VintedMessagingApiService } from './services/vinted-messaging-api.service';
import { VintedLocalExtensionBridge } from './services/vinted-local-extension-bridge';
import { MarketplaceFavoriteNotificationApiService } from './services/marketplace-favorite-notification-api.service';
import { ElementRef, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { MarketplaceApiError, MarketplaceApiService } from './services/marketplace-api.service';
import { MarketplaceCloudSetupApiService } from './services/marketplace-cloud-setup-api.service';
import { createMarketplaceFixtures } from './testing/marketplace-fixtures';
import { parseMarketplaceSnapshot } from './models/marketplace-response';
import type { AccountScope } from './models/marketplace.models';
import { VintedWorkspaceComponent } from './vinted-workspace.component';
import { VintedAccountGridComponent } from './components/vinted-account-grid/vinted-account-grid.component';
import { VintedOverviewComponent } from './components/vinted-overview/vinted-overview.component';
import { VintedProfileComponent } from './components/vinted-profile/vinted-profile.component';
import { VintedMessagesComponent } from './components/vinted-messages/vinted-messages.component';
import { VintedOfferActionsComponent } from './components/vinted-offer-actions/vinted-offer-actions.component';
import { VintedListingsComponent } from './components/vinted-listings/vinted-listings.component';
import { VintedListingMetricsComponent } from './components/vinted-listings/vinted-listing-metrics.component';
import { VintedAccountContentComponent } from './components/vinted-account-content/vinted-account-content.component';
import { VintedProfileEditorComponent } from './components/vinted-profile-editor/vinted-profile-editor.component';
import { VintedListingDetailComponent } from './components/vinted-listing-detail/vinted-listing-detail.component';
import { VintedRatingComponent } from './components/vinted-rating/vinted-rating.component';
import { VintedFeedbackListComponent } from './components/vinted-feedback-list/vinted-feedback-list.component';
import { MarketplaceAccountsComponent } from './components/marketplace-accounts/marketplace-accounts.component';
import { MarketplaceConnectComponent } from './components/marketplace-connect/marketplace-connect.component';
import { MarketplaceBrowserTestComponent } from './components/marketplace-browser-test/marketplace-browser-test.component';
import { MarketplaceSyncProgressComponent } from './components/marketplace-sync-progress/marketplace-sync-progress.component';
import { VintedSyncScheduleComponent } from './components/vinted-sync-schedule/vinted-sync-schedule.component';
import { VintedCloudMessageSettingsComponent } from './components/vinted-cloud-message-settings/vinted-cloud-message-settings.component';
import { MarketplaceSyncScheduleApiService } from './services/marketplace-sync-schedule-api.service';
import {
  MarketplaceBrowserTestApiService,
  MarketplaceImportError,
  MarketplaceWorkerOutdatedError,
} from './services/marketplace-browser-test-api.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../shared/components/loading-indicator/loading-indicator.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NoticeBannerComponent } from '../../shared/components/notice-banner/notice-banner.component';
import { RouteTabsComponent } from '../../shared/components/route-tabs/route-tabs.component';
import { VintedAccountControlsComponent } from './components/vinted-account-controls/vinted-account-controls.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { ModalDialogDirective } from '../../shared/directives/modal-dialog.directive';
import { TextFieldComponent } from '../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../shared/components/number-input/number-input.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { TableActionButtonComponent } from '../../shared/components/table-action-button/table-action-button.component';
import { ProductThumbnailComponent } from '../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableColumnPickerComponent } from '../../shared/components/table-column-picker/table-column-picker.component';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';

const fixtureConnections = createMarketplaceFixtures().connections;
const cloudApi = { available: vi.fn(), begin: vi.fn(), action: vi.fn() };
const emptyPage = () => ({ items: [], total: 0, nextCursor: null });
const makeSnapshot = (scope: AccountScope) =>
  parseMarketplaceSnapshot(
    {
      ...scope,
      profile: {
        ...scope,
        displayName: `Profil ${scope.connectionId}`,
        feedbackCount: 1,
        feedbackReputation: 1,
      },
      publications: {
        items: [
          {
            ...scope,
            id: 'publication-1',
            title: 'Testschal',
            metrics: { views: 0, favorites: null },
          },
        ],
        total: 1,
        nextCursor: null,
      },
      conversations: {
        items: [
          {
            ...scope,
            id: 'conversation-1',
            title: 'Anfrage zum Schal',
            lastMessage: 'Ist er noch da?',
          },
        ],
        total: 1,
        nextCursor: null,
      },
      sales: emptyPage(),
      activity: emptyPage(),
    },
    scope,
  );
let resetBindings: (() => void) | undefined;
let api: {
  readAccountPreview: ReturnType<typeof vi.fn>;
  readListingStatistics: ReturnType<typeof vi.fn>;
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPublication: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  reorderConnections: ReturnType<typeof vi.fn>;
  renameConnection: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
};
let browserApi: {
  available: ReturnType<typeof vi.fn>;
  syncConnection: ReturnType<typeof vi.fn>;
};
let localApi: {
  read: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  const shared: [unknown, string][] = [
    [ButtonComponent, 'button/button.component'],
    [LoadingIndicatorComponent, 'loading-indicator/loading-indicator.component'],
    [CardComponent, 'card/card.component'],
    [BadgeComponent, 'badge/badge.component'],
    [CustomSelectComponent, 'custom-select/custom-select.component'],
    [PageHeaderComponent, 'page-header/page-header.component'],
    [NoticeBannerComponent, 'notice-banner/notice-banner.component'],
    [RouteTabsComponent, 'route-tabs/route-tabs.component'],
    [ModalShellComponent, 'modal-shell/modal-shell.component'],
    [TextFieldComponent, 'text-field/text-field.component'],
    [NumberInputComponent, 'number-input/number-input.component'],
    [DataTableComponent, 'data-table/data-table.component'],
    [TableActionButtonComponent, 'table-action-button/table-action-button.component'],
    [ProductThumbnailComponent, 'product-thumbnail/product-thumbnail.component'],
    [CustomSearchInputComponent, 'custom-search-input/custom-search-input.component'],
    [TableColumnMenuComponent, 'table-column-menu/table-column-menu.component'],
    [TableColumnPickerComponent, 'table-column-picker/table-column-picker.component'],
    [CustomCheckboxComponent, 'custom-checkbox/custom-checkbox.component'],
  ];
  resetBindings = await prepareMarketplaceRendering([
    {
      type: VintedSetupComponent,
      path: 'src/app/features/marketplaces/components/vinted-setup/vinted-setup.component.ts',
    },
    {
      type: VintedLocalConnectComponent,
      path: 'src/app/features/marketplaces/components/vinted-local-connect/vinted-local-connect.component.ts',
    },
    {
      type: VintedAccountGridComponent,
      path: 'src/app/features/marketplaces/components/vinted-account-grid/vinted-account-grid.component.ts',
    },
    {
      type: VintedFavoriteSettingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-favorite-settings/vinted-favorite-settings.component.ts',
    },
    {
      type: VintedAccountControlsComponent,
      path: 'src/app/features/marketplaces/components/vinted-account-controls/vinted-account-controls.component.ts',
    },
    {
      type: VintedOverviewComponent,
      path: 'src/app/features/marketplaces/components/vinted-overview/vinted-overview.component.ts',
    },
    {
      type: VintedProfileComponent,
      path: 'src/app/features/marketplaces/components/vinted-profile/vinted-profile.component.ts',
    },
    {
      type: VintedMessagesComponent,
      path: 'src/app/features/marketplaces/components/vinted-messages/vinted-messages.component.ts',
    },
    {
      type: VintedOfferActionsComponent,
      path: 'src/app/features/marketplaces/components/vinted-offer-actions/vinted-offer-actions.component.ts',
    },
    {
      type: VintedListingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.ts',
    },
    {
      type: VintedListingMetricsComponent,
      path: 'src/app/features/marketplaces/components/vinted-listings/vinted-listing-metrics.component.ts',
    },
    ...shared.map(([type, path]) => ({ type, path: `src/app/shared/components/${path}.ts` })),
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    {
      type: VintedWorkspaceComponent,
      path: 'src/app/features/marketplaces/vinted-workspace.component.ts',
    },
    {
      type: VintedAccountContentComponent,
      path: 'src/app/features/marketplaces/components/vinted-account-content/vinted-account-content.component.ts',
    },
    {
      type: VintedProfileEditorComponent,
      path: 'src/app/features/marketplaces/components/vinted-profile-editor/vinted-profile-editor.component.ts',
    },
    {
      type: VintedListingDetailComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-detail/vinted-listing-detail.component.ts',
    },
    {
      type: VintedRatingComponent,
      path: 'src/app/features/marketplaces/components/vinted-rating/vinted-rating.component.ts',
    },
    {
      type: VintedFeedbackListComponent,
      path: 'src/app/features/marketplaces/components/vinted-feedback-list/vinted-feedback-list.component.ts',
    },
    {
      type: MarketplaceAccountsComponent,
      path: 'src/app/features/marketplaces/components/marketplace-accounts/marketplace-accounts.component.ts',
    },
    {
      type: MarketplaceConnectComponent,
      path: 'src/app/features/marketplaces/components/marketplace-connect/marketplace-connect.component.ts',
    },
    {
      type: MarketplaceBrowserTestComponent,
      path: 'src/app/features/marketplaces/components/marketplace-browser-test/marketplace-browser-test.component.ts',
    },
    {
      type: MarketplaceSyncProgressComponent,
      path: 'src/app/features/marketplaces/components/marketplace-sync-progress/marketplace-sync-progress.component.ts',
    },
    {
      type: VintedSyncScheduleComponent,
      path: 'src/app/features/marketplaces/components/vinted-sync-schedule/vinted-sync-schedule.component.ts',
    },
    {
      type: VintedCloudMessageSettingsComponent,
      path: 'src/app/features/marketplaces/components/vinted-cloud-message-settings/vinted-cloud-message-settings.component.ts',
    },
  ]);
});
afterAll(() => resetBindings?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  cloudApi.available.mockResolvedValue(true);
  cloudApi.begin.mockReset();
  cloudApi.action.mockResolvedValue({ state: 'cancelled' });
  localStorage.clear();
  localApi = { read: vi.fn().mockResolvedValue(null), approve: vi.fn(), revoke: vi.fn() };
  browserApi = {
    available: vi.fn().mockResolvedValue({ available: false, readOnly: true }),
    syncConnection: vi.fn().mockResolvedValue(undefined),
  };
  api = {
    readAccountPreview: vi.fn().mockImplementation(async (scope: AccountScope) => ({
      ...scope,
      profile: makeSnapshot(scope).profile,
      publicationCount: 8,
      saleCount: 3,
    })),
    readListingStatistics: vi
      .fn()
      .mockImplementation(async (scope: AccountScope, periodMinutes: number) => ({
        ...scope,
        periodMinutes,
        items: [],
      })),
    listConnections: vi
      .fn()
      .mockResolvedValue({ canManage: true, connections: fixtureConnections }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => makeSnapshot(scope)),
    readPublication: vi
      .fn()
      .mockImplementation(async (scope: AccountScope) => makeSnapshot(scope).publications.items[0]),
    readPage: vi.fn().mockResolvedValue(emptyPage()),
    createConnection: vi.fn(),
    reorderConnections: vi.fn().mockResolvedValue(undefined),
    renameConnection: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: VintedMessagingApiService,
        useValue: { read: vi.fn().mockResolvedValue([]), enqueue: vi.fn() },
      },
      {
        provide: VintedLocalExtensionApiService,
        useValue: localApi,
      },
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
      provideRouter([
        {
          path: 'marketplaces/vinted',
          component: VintedWorkspaceComponent,
          children: [
            { path: '', redirectTo: 'accounts', pathMatch: 'full' },
            { path: 'accounts', component: VintedAccountGridComponent },
            { path: 'setup', component: VintedSetupComponent },
            { path: 'manage', redirectTo: 'accounts', pathMatch: 'full' },
            {
              path: 'feedback',
              redirectTo: '/marketplaces/vinted/profile#reviews',
              pathMatch: 'full',
            },
            { path: 'connect/:connectionId', component: MarketplaceConnectComponent },
            { path: 'local-connect/:connectionId', component: VintedLocalConnectComponent },
            { path: 'listings/:connectionId/:entryId', component: VintedListingDetailComponent },
            ...['overview', 'listings', 'messages', 'sales', 'profile', 'activity'].map(
              (section) => ({
                path: section,
                component: VintedAccountContentComponent,
                data: { section },
              }),
            ),
          ],
        },
        {
          path: 'settings/marketplaces',
          redirectTo: '/marketplaces/vinted/manage',
          pathMatch: 'full',
        },
      ]),
      { provide: MarketplaceApiService, useValue: api },
      {
        provide: MarketplaceSyncScheduleApiService,
        useValue: {
          availability: vi.fn().mockResolvedValue({ enabled: false, allowedIntervals: [] }),
          read: vi.fn().mockImplementation(async (scope: AccountScope) => ({
            ...scope,
            enabled: false,
            intervalMinutes: 15,
            nextDueAt: null,
            lastAttemptAt: null,
            lastSuccessAt: null,
            pausedReason: null,
            retryAfter: null,
            authorizationVersion: 0,
          })),
          set: vi.fn(),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: fixtureConnections[0].workspaceId }) },
      },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'user-a' }),
          session: signal({ access_token: 'synthetic-token' }),
        },
      },
      {
        provide: MarketplaceBrowserTestApiService,
        useValue: {
          available: browserApi.available,
          open: vi.fn(),
          frame: vi.fn(),
          input: vi.fn(),
          close: vi.fn(),
          syncConnection: browserApi.syncConnection,
          readListingData: vi.fn().mockResolvedValue({
            fields: { title: 'Testschal', description: 'Ein Schal', price: '12,50' },
            cacheState: 'unconfirmed',
          }),
          readListingEdit: vi
            .fn()
            .mockResolvedValue({ title: 'Testschal', description: 'Ein Schal', price: '12,50' }),
        },
      },
      { provide: MarketplaceCloudSetupApiService, useValue: cloudApi },
    ],
  });
});
async function render(url: string) {
  const harness = await RouterTestingHarness.create(url);
  await harness.fixture.whenStable();
  harness.detectChanges();
  // Der Vitest-JIT-Lauf erzeugt noch keine Signal-ViewQuery-Metadaten.
  // Die Produktionskomponente bleibt unverändert; der Browsertest prüft AOT.
  for (const debug of harness.fixture.debugElement.queryAll(
    By.directive(VintedAccountGridComponent),
  )) {
    const grid = debug.componentInstance as VintedAccountGridComponent;
    const child = debug.query(By.directive(MarketplaceAccountsComponent));
    if (child && !grid.management())
      Object.defineProperty(grid, 'management', {
        value: signal(child.componentInstance as MarketplaceAccountsComponent),
      });
  }
  for (const debug of harness.fixture.debugElement.queryAll(By.directive(CustomSelectComponent))) {
    const component = debug.componentInstance as { trigger: () => ElementRef<HTMLElement> };
    try {
      component.trigger();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('NG0951')) throw error;
      Object.defineProperty(component, 'trigger', {
        value: () => new ElementRef(debug.nativeElement.querySelector('[role="combobox"]')),
      });
    }
  }
  return { harness, element: harness.routeNativeElement as HTMLElement };
}
describe('Vinted-Bereich in Flipbase', () => {
  it('meldet ein passendes geprüftes Profil als verbunden und erklärt einen Profilwechsel unter dem Header', async () => {
    const account = {
      ...fixtureConnections[0],
      executionMode: 'local' as const,
      workspaceId: '35000000-0000-4000-8000-000000000001',
      connectionId: '35000000-0000-4000-8000-000000000002',
      externalAccountId: '12345',
    };
    TestBed.inject(WorkspaceService).currentWorkspace.set({ id: account.workspaceId } as ReturnType<
      WorkspaceService['currentWorkspace']
    >);
    api.listConnections.mockResolvedValue({ canManage: true, connections: [account] });
    const { element, harness } = await render('/marketplaces/vinted/overview');
    const parent = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent))
      .componentInstance as VintedWorkspaceComponent;
    const workspace = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent));
    const bridge = workspace.injector.get(VintedLocalExtensionBridge);
    const readiness = {
      state: 'ready',
      workspaceId: account.workspaceId,
      connectionId: account.connectionId,
      externalAccountId: account.externalAccountId,
      checkedAt: '2026-10-06T10:00:00Z',
      version: '1.6.0',
    };
    const request = vi.spyOn(bridge, 'request').mockResolvedValue(readiness);
    bridge.installed.set(true);
    harness.detectChanges();
    await parent.runtime.check();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const row = element.querySelector('[data-account-controls]');
    expect(row?.textContent).toContain('Erweiterung verbunden');
    request.mockResolvedValue({
      ...readiness,
      connectionId: '35000000-0000-4000-8000-000000000009',
    });
    await parent.runtime.check();
    harness.detectChanges();
    expect(row?.textContent).not.toContain('Erweiterung verbunden');
    expect(row?.textContent).toContain('In anderem Browserprofil verknüpft');
    const notice = [...element.querySelectorAll('app-notice-banner')].find((notice) =>
      notice.textContent?.includes('Browserprofil mit dem passenden Vinted-Konto'),
    );
    expect(notice).toBeDefined();
    expect(notice?.closest('app-page-header')).toBeNull();
  });
  it('zeigt die Cloudpause in den Kontrollen und den Abrufgrund einmal unter dem Seitenkopf', async () => {
    const scheduleApi = TestBed.inject(MarketplaceSyncScheduleApiService);
    vi.mocked(scheduleApi.read).mockImplementation(async (scope) => ({
      ...scope,
      enabled: false,
      intervalMinutes: 15,
      nextDueAt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      pausedReason: 'forbidden',
      retryAfter: null,
      authorizationVersion: 1,
    }));
    const { element } = await render('/marketplaces/vinted/overview');
    const header = element.querySelector('app-page-header');
    expect(header?.querySelector('[data-account-controls] app-badge')?.textContent).toContain(
      'Automatik pausiert',
    );
    expect(header?.querySelector('app-notice-banner')).toBeNull();
    const notices = [...element.querySelectorAll('app-notice-banner')].filter((notice) =>
      notice.textContent?.includes('Der letzte automatische Abruf wurde von Vinted abgelehnt'),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].closest('app-page-header')).toBeNull();
  });
  it('behält Cloudfehler mit Wiederholen unter dem Seitenkopf und räumt sie nach erfolgreichem Abruf auf', async () => {
    const scheduleApi = TestBed.inject(MarketplaceSyncScheduleApiService);
    vi.mocked(scheduleApi.read).mockRejectedValueOnce(new Error('synthetic failure'));
    const { element, harness } = await render('/marketplaces/vinted/overview');
    const notice = [...element.querySelectorAll('app-notice-banner')].find((notice) =>
      notice.textContent?.includes('automatische Aktualisierung konnte nicht geladen'),
    );
    expect(notice).toBeDefined();
    expect(notice?.closest('app-page-header')).toBeNull();
    notice?.querySelector<HTMLButtonElement>('button')?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.textContent).not.toContain('automatische Aktualisierung konnte nicht geladen');
  });
  it('öffnet den Einstellungslink nur für das Konto im aktuellen Workspace', async () => {
    const account = fixtureConnections[0];
    const { element } = await render(
      `/marketplaces/vinted/accounts?settings=${account.connectionId}&workspaceId=${account.workspaceId}`,
    );
    expect(element.querySelector('app-modal-shell')?.textContent).toContain(account.displayName);
    expect(element.querySelector('app-modal-shell')?.textContent).toContain('Einstellungen');
  });
  it('öffnet keine Einstellung aus einer fremden Workspace-URL', async () => {
    const account = fixtureConnections[0];
    const { element } = await render(
      `/marketplaces/vinted/accounts?settings=${account.connectionId}&workspaceId=other-workspace`,
    );
    expect(element.querySelector('app-modal-shell')).toBeNull();
  });
  it('fordert eine bestätigte Trennung statt beim Deep-Link zu widerrufen', async () => {
    const account = { ...fixtureConnections[0], executionMode: 'local' as const };
    api.listConnections.mockResolvedValue({ canManage: true, connections: [account] });
    const { element } = await render(
      `/marketplaces/vinted/accounts?disconnect=${account.connectionId}&workspaceId=${account.workspaceId}`,
    );
    expect(element.textContent).toContain('Lokale Freigabe trennen');
    expect(element.textContent).toContain('Du bleibst bei Vinted angemeldet');
    expect(localApi.revoke).not.toHaveBeenCalled();
  });
  it('öffnet den lesenden lokalen Piloten ohne Cloudanmeldung und ohne erfundenen Store-Link', async () => {
    const { element } = await render(
      `/marketplaces/vinted/local-connect/${fixtureConnections[0].connectionId}`,
    );
    expect(element.textContent).toContain('Profil und Inserate aus Deinem Browserprofil');
    expect(element.textContent).toContain('24 Stunden');
    expect(element.querySelector('app-marketplace-browser-test')).toBeNull();
    expect(element.querySelector('a[href*="chromewebstore"]')).toBeNull();
    expect(browserApi.available).not.toHaveBeenCalled();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
    expect(
      (await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([]);
  });
  it('führt ohne lokale Freigabe zur konkreten Einrichtung statt zum Cloudworker', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...fixtureConnections[0], executionMode: 'local' }],
    });
    const { harness, element } = await render('/marketplaces/vinted/overview');
    expect(element.querySelector('app-vinted-sync-schedule')).toBeNull();
    const parent = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent))
      .componentInstance as VintedWorkspaceComponent;
    await parent.sync();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('app-vinted-local-connect')).not.toBeNull();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
  });
  it('synchronisiert ein freigegebenes lokales Konto direkt und zeigt die bestätigten Daten ohne Seitenwechsel', async () => {
    const account = {
      ...fixtureConnections[0],
      executionMode: 'local' as const,
      externalAccountId: '123',
    };
    const observedAt = '2026-10-04T19:00:00Z';
    api.listConnections.mockResolvedValue({ canManage: true, connections: [account] });
    localApi.read.mockResolvedValue({
      externalAccountId: '123',
      expiresAt: '2030-01-01T00:00:00Z',
      revoked: false,
      lastSeenAt: null,
    });
    const { harness, element } = await render('/marketplaces/vinted/overview');
    const workspace = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent));
    const parent = workspace.componentInstance as VintedWorkspaceComponent;
    const bridge = workspace.injector.get(VintedLocalExtensionBridge);
    vi.spyOn(parent.runtime, 'check').mockResolvedValue();
    bridge.installed.set(true);
    bridge.localAccount.set({
      boundUsername: 'synthetic-test',
      boundConnectionId: account.connectionId,
      expiresAt: '2030-01-01T00:00:00Z',
      state: 'linked',
    });
    const request = vi
      .spyOn(bridge, 'request')
      .mockRejectedValueOnce(new Error('Der Arbeitstab war nicht erreichbar.'))
      .mockResolvedValue({
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        externalAccountId: '123',
        expiresAt: '2030-01-01T00:00:00Z',
        counts: { profile: 1, publication: 2 },
        observedAt,
        publicationsComplete: true,
      });
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...account, lastSyncedAt: observedAt }],
    });
    await parent.sync();
    expect(parent.local.error()).toContain('Arbeitstab');
    await parent.sync();
    harness.detectChanges();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith('FLIPBASE_VINTED_LOCAL_SYNC', {
      workspaceId: account.workspaceId,
      connectionId: account.connectionId,
    });
    expect(parent.local.imported()?.observedAt).toBe(observedAt);
    expect(parent.store.selectedConnection()?.lastSyncedAt).toBe(observedAt);
    expect(element.querySelector('app-vinted-local-connect')).toBeNull();
    expect(element.textContent).toContain('lokale Verbindung bestätigt');
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
  });
  it('zeigt für die gültige Verknüpfung eine Hauptaktion statt der erneuten Installationsschritte', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...fixtureConnections[0], executionMode: 'local', externalAccountId: '123' }],
    });
    localApi.read.mockResolvedValue({
      externalAccountId: '123',
      expiresAt: '2030-01-01T00:00:00Z',
      revoked: false,
      lastSeenAt: null,
    });
    const { element } = await render(
      `/marketplaces/vinted/local-connect/${fixtureConnections[0].connectionId}`,
    );
    expect(element.textContent).toContain('Konto lokal verknüpft');
    expect(element.textContent).toContain('Jetzt synchronisieren');
    expect(element.textContent).toContain('Arbeitstab automatisch');
    expect(element.textContent).not.toContain('1. Erweiterung installieren');
    expect(element.querySelector('a[href="https://www.vinted.de/"]')).toBeNull();
  });
  it('übernimmt nach einem Kontowechsel kein verspätetes lokales Synchronisierungsergebnis', async () => {
    const accounts = fixtureConnections.map((account, index) => ({
      ...account,
      executionMode: 'local' as const,
      externalAccountId: String(123 + index),
    }));
    api.listConnections.mockResolvedValue({ canManage: true, connections: accounts });
    localApi.read.mockImplementation(async (scope: AccountScope) => ({
      externalAccountId: accounts.find((account) => account.connectionId === scope.connectionId)
        ?.externalAccountId,
      expiresAt: '2030-01-01T00:00:00Z',
      revoked: false,
      lastSeenAt: null,
    }));
    const { harness, element } = await render('/marketplaces/vinted/overview');
    const workspace = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent));
    const parent = workspace.componentInstance as VintedWorkspaceComponent;
    const bridge = workspace.injector.get(VintedLocalExtensionBridge);
    bridge.installed.set(true);
    bridge.localAccount.set({
      boundUsername: 'synthetic-test',
      boundConnectionId: accounts[0].connectionId,
      expiresAt: '2030-01-01T00:00:00Z',
      state: 'linked',
    });
    let finish: ((result: unknown) => void) | undefined;
    const request = vi.spyOn(bridge, 'request').mockReturnValue(
      new Promise<unknown>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = parent.sync();
    for (let index = 0; index < 4; index++) await Promise.resolve();
    expect(request).toHaveBeenCalledOnce();
    await parent.store.selectConnection(accounts[1].connectionId);
    harness.detectChanges();
    finish?.({
      workspaceId: accounts[0].workspaceId,
      connectionId: accounts[0].connectionId,
      externalAccountId: '123',
      expiresAt: '2030-01-01T00:00:00Z',
      counts: { profile: 1, publication: 2 },
      observedAt: '2026-10-04T19:00:00Z',
      publicationsComplete: true,
    });
    await pending;
    harness.detectChanges();
    expect(parent.store.selectedConnection()?.connectionId).toBe(accounts[1].connectionId);
    expect(parent.local.imported()).toBeNull();
    expect(api.listConnections).toHaveBeenCalledOnce();
    expect(element.querySelector('app-vinted-local-connect')).toBeNull();
  });
  it('zeigt beim Einstieg alle Konten als erreichbare Kacheln ohne Kontotabs', async () => {
    const { element } = await render('/marketplaces/vinted');
    expect(element.querySelector('app-vinted-account-grid')).not.toBeNull();
    expect(element.querySelector('nav[aria-label="Vinted-Bereiche"]')).toBeNull();
    expect(element.querySelector('app-vinted-account-controls')).toBeNull();
    expect(element.textContent).not.toContain(
      'Gespeicherte Kontodaten · Verkäufe aus Deinen Importen',
    );
    expect(
      element.querySelector('app-vinted-account-grid a[href="/settings/marketplaces"]'),
    ).toBeNull();
    const links = [
      ...element.querySelectorAll('app-vinted-account-grid app-card a[aria-label$="öffnen"]'),
    ];
    expect(links).toHaveLength(2);
    expect(links[1].getAttribute('href')).toContain(
      `connectionId=${fixtureConnections[1].connectionId}`,
    );
    expect(element.querySelector('app-vinted-account-grid dd')).toBeNull();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
  });
  it('führt beim ersten Einstieg durch die Erweiterungseinrichtung statt zur Cloudanmeldung', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const { element } = await render('/marketplaces/vinted');
    expect(element.querySelector('app-vinted-setup')).not.toBeNull();
    expect(element.textContent).toContain('Erweiterung installieren');
    expect(element.querySelector('app-marketplace-browser-test')).toBeNull();
    expect(element.querySelector('a[href*="chromewebstore"]')).toBeNull();
    expect(
      element.querySelector('app-vinted-setup a[href^="/marketplaces/vinted/accounts"]'),
    ).toBeNull();
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: location.origin,
        data: { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
      }),
    );
    TestBed.tick();
    expect(
      element.querySelector('app-vinted-setup a[href^="/marketplaces/vinted/accounts"]'),
    ).not.toBeNull();
    expect(element.querySelector('a[href="https://www.vinted.de/"]')?.getAttribute('target')).toBe(
      '_blank',
    );
  });
  it('zeigt nicht angebundene lokale Postfach- und Verkaufsquellen ohne Cloudabruf', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [
        {
          ...fixtureConnections[0],
          executionMode: 'local',
          capabilities: {},
        },
      ],
    });
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => ({
      ...makeSnapshot(scope),
      conversations: emptyPage(),
      sales: emptyPage(),
    }));
    const { harness, element } = await render('/marketplaces/vinted/messages');
    expect(element.textContent).toContain('Verbinde Dein Postfach');
    expect(element.textContent).toContain('Lokale Verbindung prüfen');
    expect(element.textContent).not.toContain('Noch keine Gespräche gespeichert');
    expect(element.textContent).toContain('Nachrichten noch nicht synchronisiert');
    await harness.navigateByUrl('/marketplaces/vinted/sales');
    expect(element.textContent).toContain('Verkäufe noch nicht lokal angebunden');
    expect(element.textContent).not.toContain('Noch keine gespeicherten Verkäufe');
    expect(browserApi.available).not.toHaveBeenCalled();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
  });
  it('öffnet über eine Kachel das zweite Konto und bleibt beim Wechsel der Bereiche darin', async () => {
    const { harness, element } = await render('/marketplaces/vinted/accounts');
    element
      .querySelectorAll<HTMLAnchorElement>(
        'app-vinted-account-grid app-card a[aria-label$="öffnen"]',
      )[1]
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const parent = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent))
      .componentInstance as VintedWorkspaceComponent;
    expect(parent.store.selectedConnection()?.connectionId).toBe(
      fixtureConnections[1].connectionId,
    );
    expect(harness.routeNativeElement?.querySelector('app-vinted-overview')).not.toBeNull();
    await harness.navigateByUrl('/marketplaces/vinted/profile');
    expect(parent.store.selectedConnection()?.connectionId).toBe(
      fixtureConnections[1].connectionId,
    );
    expect(
      harness.routeNativeElement?.querySelector('a[href^="/marketplaces/vinted/accounts"]'),
    ).not.toBeNull();
  });
  it('hält andere Kontokacheln erreichbar, wenn eine Vorschau scheitert', async () => {
    api.readAccountPreview.mockRejectedValueOnce(new Error('preview failed'));
    const { element } = await render('/marketplaces/vinted/accounts');
    expect(
      element.querySelectorAll('app-vinted-account-grid app-card a[aria-label$="öffnen"]'),
    ).toHaveLength(2);
    expect(element.textContent).toContain('Vorschau gerade nicht verfügbar');
    expect(element.querySelector('app-vinted-account-grid dd')).toBeNull();
  });
  it('zeigt ohne importiertes Profil unbekannte Werte statt scheinbarer Nullen', async () => {
    api.readAccountPreview.mockImplementation(async (scope: AccountScope) => ({
      ...scope,
      profile: null,
      publicationCount: 0,
      saleCount: 0,
    }));
    const { element } = await render('/marketplaces/vinted/accounts');
    expect(element.querySelector('app-vinted-account-grid dd')).toBeNull();
    expect(element.textContent).not.toContain('Bewertung noch unbekannt');
  });
  it('lässt die Bereichsnavigation der Seitenleiste und zeigt keine doppelten Kontotabs', async () => {
    const { element } = await render('/marketplaces/vinted/overview');
    const links = [...element.querySelectorAll('nav[aria-label="Vinted-Bereiche"] a')];
    expect(links).toEqual([]);
    expect(element.querySelector('a[href*="/connect/"]')).toBeNull();
  });
  it.each([
    { feedbackResult: { status: 'failed', failure: 'rate_limited' }, remainsOpen: true },
    { feedbackResult: { status: 'complete' }, remainsOpen: false },
  ])(
    'lädt erfolgreiche Bereiche neu und schließt nur ohne Teilfehler: %j',
    async ({ feedbackResult, remainsOpen }) => {
      browserApi.syncConnection.mockImplementation(
        async (_scope: unknown, _token: unknown, onProgress: (progress: unknown) => void) => {
          onProgress({
            id: 'operation-partial',
            state: 'succeeded',
            stage: 'cleanup',
            errorCode: null,
            sourceResults: {
              profile: { status: 'complete' },
              publications: { status: 'complete' },
              conversations: { status: 'complete' },
              messages: { status: 'partial' },
              sales: { status: 'complete' },
              feedback: feedbackResult,
            },
          });
        },
      );
      const { element, harness } = await render('/marketplaces/vinted/overview');
      vi.useFakeTimers();
      try {
        const component = harness.fixture.debugElement.query(By.directive(VintedWorkspaceComponent))
          .componentInstance as VintedWorkspaceComponent;
        await component.sync();
        await vi.advanceTimersByTimeAsync(2_000);
        harness.detectChanges();

        expect(api.readSnapshot).toHaveBeenCalledTimes(2);
        expect(component.syncModalOpen()).toBe(remainsOpen);
        if (remainsOpen) {
          expect(element.querySelector('app-marketplace-sync-progress')?.textContent).toContain(
            'Bewertungen',
          );
        } else {
          expect(element.querySelector('app-marketplace-sync-progress')).toBeNull();
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('aktualisiert das ausgewählte Konto erst nach ausdrücklichem Klick', async () => {
    const { element, harness } = await render('/marketplaces/vinted/overview');
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.getAttribute('aria-label') === 'Kontodaten aktualisieren',
    );
    expect(button).toBeDefined();
    button?.click();
    await harness.fixture.whenStable();
    expect(browserApi.syncConnection).toHaveBeenCalledWith(
      {
        workspaceId: fixtureConnections[0].workspaceId,
        connectionId: fixtureConnections[0].connectionId,
      },
      'synthetic-token',
      expect.any(Function),
    );
    expect(api.readSnapshot).toHaveBeenCalledTimes(2);
  });
  it('meldet einen veralteten Browserdienst ohne einen angenommenen Auftrag vorzutäuschen', async () => {
    browserApi.syncConnection.mockRejectedValue(new MarketplaceWorkerOutdatedError());
    const { element, harness } = await render('/marketplaces/vinted/overview');
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.getAttribute('aria-label') === 'Kontodaten aktualisieren',
    );
    button?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = element.querySelector('app-marketplace-sync-progress');
    expect(dialog?.textContent).toContain('Die Aktualisierung konnte nicht gestartet werden.');
    expect(dialog?.textContent).toContain('Der Browserdienst muss aktualisiert werden.');
    expect(dialog?.textContent).not.toContain('Der Auftrag wurde angenommen');
    expect(dialog?.textContent).not.toContain('läuft im Hintergrund weiter');
    expect(dialog?.querySelector('ol')).toBeNull();
  });
  it('führt nach abgelaufener Vinted-Anmeldung direkt zum erneuten Login des Kontos', async () => {
    browserApi.syncConnection.mockImplementation(
      async (_scope: unknown, _token: unknown, onProgress: (progress: unknown) => void) => {
        onProgress({ id: 'operation-a', state: 'failed', stage: 'profile', errorCode: 'identity' });
        throw new MarketplaceImportError('identity');
      },
    );
    const { element, harness } = await render('/marketplaces/vinted/overview');
    const refresh = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.getAttribute('aria-label') === 'Kontodaten aktualisieren',
    );
    refresh?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const dialog = element.querySelector('app-marketplace-sync-progress');
    expect(dialog?.textContent).toContain('Vinted bestätigt Deine Anmeldung nicht mehr.');
    const link = dialog?.querySelector<HTMLAnchorElement>('a');
    expect(link?.getAttribute('href')).toBe(
      `/marketplaces/vinted/connect/${fixtureConnections[0].connectionId}?reauth=1`,
    );
    link?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.querySelector('app-marketplace-sync-progress')).toBeNull();
  });
  it('öffnet die erneute Anmeldung nur für das ausgewählte verbundene Konto', async () => {
    browserApi.available.mockResolvedValue({ available: true, readOnly: false });
    const { element } = await render(
      `/marketplaces/vinted/connect/${fixtureConnections[0].connectionId}?reauth=1`,
    );
    expect(element.textContent).toContain('Melde Dich mit demselben Vinted-Konto erneut an.');
    expect(element.textContent).toContain('Anmelden und Konto verbinden');
    expect(element.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
    const accessibility = await axe.run(element, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      accessibility.violations.filter(
        (item) => item.impact === 'critical' || item.impact === 'serious',
      ),
    ).toEqual([]);
  });
  it('öffnet keine erneute Anmeldung für eine fremde Kontoverbindung', async () => {
    browserApi.available.mockResolvedValue({ available: true, readOnly: false });
    const { element } = await render('/marketplaces/vinted/connect/foreign-account?reauth=1');
    expect(element.textContent).toContain('in diesem Workspace nicht verfügbar');
    expect(element.querySelector('input[type="password"]')).toBeNull();
  });
  it('zeigt echte Konten, Kontowechsler und die vorgesehenen Bereiche', async () => {
    const { element, harness } = await render('/marketplaces/vinted/overview');
    expect(element.querySelector('h1')?.textContent).toContain('Vinted');
    expect(element.querySelector('[role="combobox"]')?.textContent).toContain('Testkonto A');
    expect(
      [...element.querySelectorAll('app-route-tabs a')].map((a) => a.textContent?.trim()),
    ).toEqual([]);
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Vinted-Kontoeinstellungen"]')
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      element.querySelector('[role="dialog"] a[href^="/marketplaces/vinted/accounts"]'),
    ).not.toBeNull();
    expect(
      element.querySelector(
        `a[href="/marketplaces/vinted/connect/${fixtureConnections[0].connectionId}"]`,
      ),
    ).not.toBeNull();
  });
  it('zeigt die normierte Vinted-Bewertung als fünf Sterne', async () => {
    const { element } = await render('/marketplaces/vinted/profile');
    expect(element.textContent).toContain('1 Bewertung');
    expect(element.querySelector('app-vinted-profile')).not.toBeNull();
    const rating = element.querySelector('[aria-label="5,0 von 5 Sternen"]');
    expect(rating).not.toBeNull();
    expect(rating?.querySelectorAll('svg.fill-current')).toHaveLength(5);
  });
  it('zeigt einen ehrlichen Leerzustand statt eingebauter Beispielkonten', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const { element } = await render('/marketplaces/vinted/overview');
    expect(element.textContent).toContain('Willkommen bei Vinted in Flipbase');
    expect(element.textContent).not.toContain('Testkonto');
    expect(api.readSnapshot).not.toHaveBeenCalled();
  });
  it('wechselt per Kontenauswahl das sichtbare Profil', async () => {
    const { element, harness } = await render('/marketplaces/vinted/profile');
    element.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
    harness.detectChanges();
    const option = [...element.querySelectorAll<HTMLElement>('[role="option"]')].find((node) =>
      node.textContent?.includes('Testkonto B'),
    );
    expect(option).toBeDefined();
    option?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.textContent).toContain('Profil fixture-account-b');
    expect(element.textContent).not.toContain('Profil fixture-account-a');
  });
  it('unterscheidet auf der Inseratseite null und unbekannte Aufrufe', async () => {
    const { element } = await render('/marketplaces/vinted/listings');
    expect(element.textContent).toContain('Testschal');
    expect(element.querySelector('[data-views]')?.textContent?.trim()).toBe('0');
    expect(element.querySelector('[data-favorites]')?.textContent?.trim()).toBe('—');
  });
  it('öffnet ein Inserat nur innerhalb des ausgewählten Kontos', async () => {
    const { element, harness } = await render('/marketplaces/vinted/listings');
    const link = element.querySelector<HTMLAnchorElement>(
      'a[aria-label="Inserat Testschal öffnen"]',
    );
    expect(link?.getAttribute('href')).toBe(
      '/marketplaces/vinted/listings/fixture-account-a/publication-1',
    );
    link?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.readPublication).not.toHaveBeenCalled();
    expect(element.querySelector('app-vinted-listing-detail')).not.toBeNull();
    expect(element.querySelector('app-route-tabs')).toBeNull();
    expect(element.textContent).toContain('Testschal');
  });
  it('zeigt Verkäufe im dichten Kartenraster ohne den bisherigen Hinweis', async () => {
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => ({
      ...makeSnapshot(scope),
      sales: {
        items: [
          {
            ...scope,
            id: 'sale-1',
            title: 'Verkauftes Hemd',
            price: 30,
            currency: 'EUR',
            status: 'Versendet',
            imageUrl: null,
            shipmentStatus: null,
            occurredAt: null,
          },
        ],
        total: 1,
        nextCursor: null,
      },
    }));
    const { element } = await render('/marketplaces/vinted/sales');
    expect(element.textContent).toContain('Verkauftes Hemd');
    expect(element.textContent).not.toContain('Hier erscheinen Bestellungen');
    expect(
      element.querySelector('app-vinted-account-content .grid.grid-cols-2')?.classList,
    ).toContain('2xl:grid-cols-5');
  });
  it('zeigt den gespeicherten Fehlerschritt eines Hintergrundauftrags', async () => {
    const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ id: operationId }, { status: 202 }))
      .mockResolvedValueOnce(
        Response.json({ id: operationId, state: 'failed', stage: 'profile', errorCode: 'profile' }),
      );
    vi.useFakeTimers();
    try {
      const result = new MarketplaceBrowserTestApiService().syncConnection(
        {
          workspaceId: fixtureConnections[0].workspaceId,
          connectionId: fixtureConnections[0].connectionId,
        },
        'synthetic-token',
      );
      const assertion = expect(result).rejects.toThrow('beim Lesen des Profils');
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
      request.mockRestore();
    }
  });
  it('zeigt Serverfehler statt eines scheinbar leeren Kontos', async () => {
    api.listConnections.mockRejectedValue(new MarketplaceApiError('unavailable'));
    const { element } = await render('/marketplaces/vinted/overview');
    expect(element.textContent).toContain('noch nicht verfügbar');
    expect(element.textContent).not.toContain('Noch kein Vinted-Konto hinzugefügt');
  });
  it('zeigt Nachrichten als Text, nicht als fremdes HTML', async () => {
    api.readPage.mockResolvedValue({
      items: [
        {
          ...fixtureConnections[0],
          id: 'message-1',
          conversationId: 'conversation-1',
          title: '',
          text: '<img src=x onerror=alert(1)>',
          occurredAt: null,
          direction: 'inbound',
        },
      ],
      total: 1,
      nextCursor: null,
    });
    const { element, harness } = await render('/marketplaces/vinted/messages');
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.includes('Anfrage zum Schal'),
    );
    expect(button).toBeDefined();
    button?.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(element.querySelector('img[src="x"]')).toBeNull();
  });
  it('hält die Kontenaktionen außerhalb des schmalen Kartenkopfs', async () => {
    const { element } = await render('/settings/marketplaces');
    const add = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Konto hinzufügen'),
    );
    expect(add).toBeDefined();
    expect(element.querySelector('app-vinted-account-grid h2')?.textContent).toContain(
      'Vinted-Konten',
    );
    expect(add?.closest('[data-card-header]')).toBeNull();
  });
  it('bietet Hinzufügen und Einstellungen direkt auf den Konto-Kacheln an', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: fixtureConnections.map((account, index) => ({
        ...account,
        executionMode: index === 0 ? 'local' : 'cloud',
      })),
    });
    const { element, harness } = await render('/marketplaces/vinted/accounts');
    expect(element.querySelector('button[aria-label="Testkonto A einstellen"]')).not.toBeNull();
    expect(element.querySelector('button[aria-label="Testkonto B einstellen"]')).not.toBeNull();
    const badgeLabels = [...element.querySelectorAll('app-vinted-account-grid app-badge')].map(
      (badge) => badge.textContent?.trim(),
    );
    expect(badgeLabels).toContain('Lokal');
    expect(badgeLabels).toContain('Cloud');
    expect(element.querySelector('a[href="/marketplaces/vinted/manage"]')).toBeNull();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Testkonto A einstellen"]')
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain(
      'Neue Favoriten in der Glocke anzeigen',
    );
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('Konto entfernen');
  });
  it('behält Kontoeinstellungen beim Neuladen und schließt bei bestätigtem Rechteentzug', async () => {
    const { element, harness } = await render('/marketplaces/vinted/accounts');
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Testkonto A einstellen"]')
      ?.click();
    harness.detectChanges();
    const grid = harness.fixture.debugElement.query(By.directive(VintedAccountGridComponent))
      .componentInstance as VintedAccountGridComponent;
    let finish:
      | ((result: { canManage: boolean; connections: typeof fixtureConnections }) => void)
      | undefined;
    api.listConnections.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const saving = grid.setPaused(fixtureConnections[0]);
    for (let index = 0; index < 8; index++) await Promise.resolve();
    harness.detectChanges();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(element.querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
    finish?.({
      canManage: true,
      connections: fixtureConnections.map((account, index) => ({
        ...account,
        status: index === 0 ? 'paused' : account.status,
      })),
    });
    await saving;
    harness.detectChanges();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('Fortsetzen');
    api.listConnections.mockResolvedValue({ canManage: false, connections: [] });
    await grid.accounts.reloadConnections();
    harness.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });
  it('zeigt alle zehn Plätze einschließlich noch nicht angemeldeter Konten', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: Array.from({ length: 10 }, (_, index) => ({
        ...fixtureConnections[0],
        connectionId: '25000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        externalAccountId: null,
      })),
    });
    const { element } = await render('/marketplaces/vinted/accounts');
    expect(element.textContent).toContain('0 von 10 Plätzen frei');
    const add = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Konto hinzufügen',
    );
    expect(add?.disabled).toBe(true);
  });
  it('ändert die Reihenfolge per Tastatur und behält bestehende Vorschauen', async () => {
    api.reorderConnections.mockImplementation(async (_workspaceId: string, ids: string[]) => {
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: ids.flatMap((id) =>
          fixtureConnections.filter((account) => account.connectionId === id),
        ),
      });
    });
    const { element, harness } = await render('/marketplaces/vinted/accounts');
    const reads = api.readAccountPreview.mock.calls.length;
    element
      .querySelector<HTMLAnchorElement>('app-card a[aria-label="Testkonto A öffnen"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }),
      );
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.reorderConnections).toHaveBeenCalledWith(fixtureConnections[0].workspaceId, [
      fixtureConnections[1].connectionId,
      fixtureConnections[0].connectionId,
    ]);
    expect(api.readAccountPreview).toHaveBeenCalledTimes(reads);
    expect(
      [...element.querySelectorAll('app-vinted-account-grid h3')].map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['Testkonto B', 'Testkonto A']);
  });
  it('legt ein neues Konto lokal an, auch wenn der Cloudbrowser nicht verfügbar ist', async () => {
    const created = {
      ...fixtureConnections[1],
      displayName: 'Mein Konto',
      externalAccountId: null,
    };
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [fixtureConnections[0]],
    });
    api.createConnection.mockImplementation(async () => {
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: [fixtureConnections[0], created],
      });
      return created;
    });
    const { element, harness } = await render('/marketplaces/vinted/manage');
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Konto hinzufügen'))
      ?.click();
    harness.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('Kontoname fehlt');
    input.value = 'Mein Konto';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    element
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-vinted-local-connect')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Kontoverbindung: Mein Konto');
    expect(harness.routeNativeElement?.querySelector('app-marketplace-browser-test')).toBeNull();
    expect(browserApi.available).not.toHaveBeenCalled();
    expect(api.createConnection).toHaveBeenCalledWith(created.workspaceId, 'Mein Konto');
  });
  it('wechselt im Kontodialog bei Cloudauswahl zur zugehörigen Anmeldung', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const created = {
      ...fixtureConnections[0],
      displayName: 'Mein Konto',
      executionMode: 'local' as const,
    };
    cloudApi.begin.mockImplementation(async () => {
      api.listConnections.mockResolvedValue({ canManage: true, connections: [created] });
      return {
        status: 'ready',
        setup: {
          workspaceId: created.workspaceId,
          connectionId: created.connectionId,
          setupId: '25500000-0000-4000-8000-000000000031',
          state: 'reserved',
          sessionId: null,
        },
      };
    });
    const { element, harness } = await render('/settings/marketplaces');
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.includes('Konto hinzufügen'),
    );
    expect(button).toBeDefined();
    button?.click();
    harness.detectChanges();
    const component = harness.fixture.debugElement.query(By.directive(MarketplaceAccountsComponent))
      .componentInstance as MarketplaceAccountsComponent;
    component.form.get('connectionMethod')?.setValue('cloud');
    const input = element.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    input!.value = 'Mein Konto';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    harness.detectChanges();
    element
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(api.createConnection).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain('Mein Konto');
    expect(
      harness.routeNativeElement?.querySelector('app-marketplace-browser-test'),
    ).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it('behält den Namen bei, wenn das lokale Anlegen vom Server abgelehnt wird', async () => {
    api.createConnection.mockRejectedValue(new MarketplaceApiError('unavailable'));
    const { element, harness } = await render('/settings/marketplaces');
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Konto hinzufügen'))
      ?.click();
    harness.detectChanges();
    const component = harness.fixture.debugElement.query(By.directive(MarketplaceAccountsComponent))
      .componentInstance as MarketplaceAccountsComponent;
    component.name.setValue('Mein Konto');
    await component.save();
    harness.detectChanges();
    expect(component.name.value).toBe('Mein Konto');
    expect(component.dialog()?.mode).toBe('create');
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('app-marketplace-browser-test')).toBeNull();
    expect(browserApi.available).not.toHaveBeenCalled();
  });
  it('öffnet nach dem Schließen des Dialogs keine verspätet angelegte lokale Verbindung', async () => {
    let finishCreate: ((account: (typeof fixtureConnections)[0]) => void) | undefined;
    api.createConnection.mockReturnValue(
      new Promise<(typeof fixtureConnections)[0]>((resolve) => {
        finishCreate = resolve;
      }),
    );
    const { element, harness } = await render('/settings/marketplaces');
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Konto hinzufügen'))
      ?.click();
    harness.detectChanges();
    const component = harness.fixture.debugElement.query(By.directive(MarketplaceAccountsComponent))
      .componentInstance as MarketplaceAccountsComponent;
    component.name.setValue('Mein Konto');
    const saving = component.save();
    component.closeDialog();
    finishCreate?.(fixtureConnections[1]);
    await saving;
    harness.detectChanges();
    expect(component.dialog()).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-marketplace-accounts')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-vinted-local-connect')).toBeNull();
  });
  it('öffnet nur die zum Link gehörende Kontoverbindung', async () => {
    const { element } = await render(
      `/marketplaces/vinted/connect/${fixtureConnections[1].connectionId}`,
    );
    expect(element.querySelector('app-marketplace-connect')?.textContent).toContain('Testkonto B');
    expect(element.querySelector('app-marketplace-connect')?.textContent).not.toContain(
      'Testkonto A',
    );
    expect(element.querySelector('app-marketplace-browser-test')).not.toBeNull();
    expect(element.textContent).toContain('Browserdienst ist auf dem Server nicht erreichbar');
  });
  it('öffnet bei einer fremden Konto-ID keinen Browser', async () => {
    const { element } = await render(
      '/marketplaces/vinted/connect/26000000-0000-4000-8000-000000000099',
    );
    expect(element.textContent).toContain('in diesem Workspace nicht verfügbar');
    expect(element.querySelector('app-marketplace-browser-test')).toBeNull();
  });
  it('öffnet für eine pausierte Verbindung keinen Browser', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...fixtureConnections[0], status: 'paused' }],
    });
    const { element } = await render(
      `/marketplaces/vinted/connect/${fixtureConnections[0].connectionId}`,
    );
    expect(element.textContent).toContain('pausiert oder gesperrt');
    expect(element.querySelector('app-marketplace-browser-test')).toBeNull();
  });
  it('erlaubt die Anmeldung auch dann, wenn gespeicherte Kontodaten nicht lesbar sind', async () => {
    api.readSnapshot.mockRejectedValue(new MarketplaceApiError('unavailable'));
    const { element } = await render(
      `/marketplaces/vinted/connect/${fixtureConnections[0].connectionId}`,
    );
    expect(element.querySelector('app-marketplace-browser-test')).not.toBeNull();
    expect(element.textContent).toContain('noch nicht verfügbar');
  });
  it('zeigt gespeicherte Aktivitäten im Tabelleninhalt ohne unverdrahtete Suche', async () => {
    api.readSnapshot.mockImplementation(async (scope: AccountScope) => ({
      ...makeSnapshot(scope),
      activity: {
        items: [
          {
            ...scope,
            id: 'activity-1',
            title: 'Gespeicherte Änderung',
            text: 'Inserat aktualisiert',
            occurredAt: '2026-10-01T12:00:00Z',
          },
        ],
        total: 1,
        nextCursor: null,
      },
    }));
    const { element } = await render('/marketplaces/vinted/activity');
    expect(element.querySelector('[data-data-table-content]')?.textContent).toContain(
      'Inserat aktualisiert',
    );
    expect(element.querySelector('[data-data-table-search]')).toBeNull();
    expect(element.querySelector('th')?.textContent).toBe('Aktivität');
  });
  it('hat im Arbeitsbereich keine automatisch erkennbaren schweren Barrieren', async () => {
    const { element } = await render('/marketplaces/vinted/overview');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious'),
    ).toEqual([]);
  });
});
