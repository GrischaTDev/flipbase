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
import { VintedAccountContentComponent } from './components/vinted-account-content/vinted-account-content.component';
import { MarketplaceAccountsComponent } from './components/marketplace-accounts/marketplace-accounts.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NoticeBannerComponent } from '../../shared/components/notice-banner/notice-banner.component';
import { SectionNavigationComponent } from '../../shared/components/section-navigation/section-navigation.component';
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
      profile: { ...scope, displayName: `Profil ${scope.connectionId}` },
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
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  renameConnection: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  const shared: [unknown, string][] = [
    [ButtonComponent, 'button/button.component'],
    [CardComponent, 'card/card.component'],
    [BadgeComponent, 'badge/badge.component'],
    [CustomSelectComponent, 'custom-select/custom-select.component'],
    [PageHeaderComponent, 'page-header/page-header.component'],
    [NoticeBannerComponent, 'notice-banner/notice-banner.component'],
    [SectionNavigationComponent, 'section-navigation/section-navigation.component'],
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
      type: MarketplaceAccountsComponent,
      path: 'src/app/features/marketplaces/components/marketplace-accounts/marketplace-accounts.component.ts',
    },
  ]);
});
afterAll(() => resetBindings?.());
afterEach(() => TestBed.resetTestingModule());
beforeEach(() => {
  api = {
    listConnections: vi
      .fn()
      .mockResolvedValue({ canManage: true, connections: fixtureConnections }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => makeSnapshot(scope)),
    readPage: vi.fn().mockResolvedValue(emptyPage()),
    createConnection: vi.fn(),
    renameConnection: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: 'marketplaces/vinted',
          component: VintedWorkspaceComponent,
          children: ['overview', 'listings', 'messages', 'sales', 'profile', 'activity'].map(
            (section) => ({
              path: section,
              component: VintedAccountContentComponent,
              data: { section },
            }),
          ),
        },
        { path: 'settings/marketplaces', component: MarketplaceAccountsComponent },
      ]),
      { provide: MarketplaceApiService, useValue: api },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: fixtureConnections[0].workspaceId }) },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'user-a' }) } },
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
  it('zeigt echte Konten, Kontowechsler und die vorgesehenen Bereiche', async () => {
    const { element } = await render('/marketplaces/vinted/overview');
    expect(element.querySelector('h1')?.textContent).toContain('Vinted');
    expect(element.querySelector('[role="combobox"]')?.textContent).toContain('Testkonto A');
    expect(
      [...element.querySelectorAll('app-section-navigation a')].map((a) => a.textContent?.trim()),
    ).toEqual(['Übersicht', 'Inserate', 'Nachrichten', 'Verkäufe', 'Profil']);
    expect(element.querySelector('a[href="/settings/marketplaces"]')).not.toBeNull();
    expect(element.querySelector('a[href="/marketplaces/vinted/activity"]')).not.toBeNull();
  });
  it('zeigt einen ehrlichen Leerzustand statt eingebauter Beispielkonten', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const { element } = await render('/marketplaces/vinted/overview');
    expect(element.textContent).toContain('Noch kein Vinted-Konto hinterlegt');
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
  it('zeigt Serverfehler statt eines scheinbar leeren Kontos', async () => {
    api.listConnections.mockRejectedValue(new MarketplaceApiError('unavailable'));
    const { element } = await render('/marketplaces/vinted/overview');
    expect(element.textContent).toContain('noch nicht verfügbar');
    expect(element.textContent).not.toContain('Noch kein Vinted-Konto hinterlegt');
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
    expect(element.querySelector('app-card h2')?.textContent).toContain('Vinted-Konten');
    expect(add?.closest('[data-card-header]')).toBeNull();
  });
  it('speichert eine vorbereitete Verbindung aus dem Einstellungsdialog', async () => {
    api.listConnections.mockResolvedValue({ canManage: true, connections: [] });
    const created = { ...fixtureConnections[0], displayName: 'Mein Konto', status: 'needs_login' };
    api.createConnection.mockImplementation(async () => {
      api.listConnections.mockResolvedValue({ canManage: true, connections: [created] });
      return created;
    });
    const { element, harness } = await render('/settings/marketplaces');
    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((node) =>
      node.textContent?.includes('Konto hinzufügen'),
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
    expect(api.createConnection).toHaveBeenCalledWith(
      fixtureConnections[0].workspaceId,
      'Mein Konto',
    );
    expect(element.textContent).toContain('Mein Konto');
    expect(element.textContent).toContain('Anmeldung ausstehend');
  });
  it('hat im Arbeitsbereich keine automatisch erkennbaren schweren Barrieren', async () => {
    const { element } = await render('/marketplaces/vinted/overview');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(
      result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious'),
    ).toEqual([]);
  });
});
