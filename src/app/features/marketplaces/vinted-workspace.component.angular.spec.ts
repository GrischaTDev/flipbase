import { VintedFavoriteSettingsComponent } from './components/vinted-favorite-settings/vinted-favorite-settings.component';
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
import { createMarketplaceFixtures } from './testing/marketplace-fixtures';
import { parseMarketplaceSnapshot } from './models/marketplace-response';
import type { AccountScope } from './models/marketplace.models';
import { VintedWorkspaceComponent } from './vinted-workspace.component';
import { VintedOverviewComponent } from './components/vinted-overview/vinted-overview.component';
import { VintedProfileComponent } from './components/vinted-profile/vinted-profile.component';
import { VintedMessagesComponent } from './components/vinted-messages/vinted-messages.component';
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
import { MarketplaceSyncScheduleApiService } from './services/marketplace-sync-schedule-api.service';
import {
  MarketplaceBrowserTestApiService,
  MarketplaceImportError,
  MarketplaceWorkerOutdatedError,
} from './services/marketplace-browser-test-api.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
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
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { TableActionButtonComponent } from '../../shared/components/table-action-button/table-action-button.component';
import { ProductThumbnailComponent } from '../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableColumnPickerComponent } from '../../shared/components/table-column-picker/table-column-picker.component';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';

const fixtureConnections = createMarketplaceFixtures().connections;
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
  readListingStatistics: ReturnType<typeof vi.fn>;
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPublication: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  renameConnection: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
};
let browserApi: {
  available: ReturnType<typeof vi.fn>;
  syncConnection: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  const shared: [unknown, string][] = [
    [ButtonComponent, 'button/button.component'],
    [CardComponent, 'card/card.component'],
    [BadgeComponent, 'badge/badge.component'],
    [CustomSelectComponent, 'custom-select/custom-select.component'],
    [PageHeaderComponent, 'page-header/page-header.component'],
    [NoticeBannerComponent, 'notice-banner/notice-banner.component'],
    [RouteTabsComponent, 'route-tabs/route-tabs.component'],
    [ModalShellComponent, 'modal-shell/modal-shell.component'],
    [TextFieldComponent, 'text-field/text-field.component'],
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
  ]);
});
afterAll(() => resetBindings?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  browserApi = {
    available: vi.fn().mockResolvedValue({ available: false, readOnly: true }),
    syncConnection: vi.fn().mockResolvedValue(undefined),
  };
  api = {
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
    renameConnection: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
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
      provideRouter([
        {
          path: 'marketplaces/vinted',
          component: VintedWorkspaceComponent,
          children: [
            {
              path: 'feedback',
              redirectTo: '/marketplaces/vinted/profile#reviews',
              pathMatch: 'full',
            },
            { path: 'connect/:connectionId', component: MarketplaceConnectComponent },
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
        { path: 'settings/marketplaces', component: MarketplaceAccountsComponent },
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
    ],
  });
});
async function render(url: string) {
  const harness = await RouterTestingHarness.create(url);
  await harness.fixture.whenStable();
  harness.detectChanges();
  // Der Vitest-JIT-Lauf erzeugt noch keine Signal-ViewQuery-Metadaten.
  // Die Produktionskomponente bleibt unverändert; der Browsertest prüft AOT.
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
  it('ordnet die Bereiche mit Aktivitäten und ohne separaten Bewertungstab', async () => {
    const { element } = await render('/marketplaces/vinted/overview');
    const links = [...element.querySelectorAll('nav[aria-label="Vinted-Bereiche"] a')];
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Übersicht',
      'Nachrichten',
      'Inserate',
      'Verkäufe',
      'Aktivitäten',
      'Profil',
    ]);
    expect(links[0].getAttribute('aria-current')).toBe('page');
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
    ).toEqual(['Übersicht', 'Nachrichten', 'Inserate', 'Verkäufe', 'Aktivitäten', 'Profil']);
    expect(element.querySelector('a[href="/marketplaces/vinted/activity"]')).not.toBeNull();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Vinted-Kontoeinstellungen"]')
      ?.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(
      element.querySelector('[role="dialog"] a[href="/settings/marketplaces"]'),
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
    expect(element.textContent).toContain('Noch kein Vinted-Konto hinzugefügt');
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
    expect(
      element.querySelector('app-route-tabs a[aria-current="page"]')?.textContent?.trim(),
    ).toBe('Inserate');
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
      button.textContent?.includes('Account hinzufügen'),
    );
    expect(add).toBeDefined();
    expect(element.querySelector('app-card h2')?.textContent).toContain('Vinted-Konten');
    expect(add?.closest('[data-card-header]')).toBeNull();
  });
  it('wechselt im Kontodialog direkt zur zugehörigen Anmeldung', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const { element, harness } = await render('/settings/marketplaces');
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.includes('Account hinzufügen'),
    );
    expect(button).toBeDefined();
    button?.click();
    harness.detectChanges();
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
