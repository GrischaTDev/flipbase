import { EbayArticleMappingComponent } from '../ebay-article-mapping/ebay-article-mapping.component';
import { ArticlePickerComponent } from '../../../../shared/components/article-picker/article-picker.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { signal, ɵɵqueryAdvance, ɵɵviewQuerySignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { EbayWorkspaceComponent } from '../../ebay-workspace.component';
import { MARKETPLACES_ROUTES } from '../../marketplaces.routes';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import { TableColumnPickerComponent } from '../../../../shared/components/table-column-picker/table-column-picker.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { EbayAccountApiService } from '../../services/ebay-account-api.service';
import { EbayOrderImportApiService } from '../../services/ebay-order-import-api.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { StockService } from '../../../../core/services/stock.service';
import { EbayAccountComponent } from './ebay-account.component';
import { EbayTrafficOverviewComponent } from '../ebay-traffic-overview/ebay-traffic-overview.component';
import { EbayListingPerformanceComponent } from '../ebay-listing-performance/ebay-listing-performance.component';

describe('Persönliche eBay-Oberfläche', () => {
  let resetBindings: (() => void) | undefined;
  const workspace = signal<{ id: string; archived_at: null } | null>({
    id: 'workspace-a',
    archived_at: null,
  });
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const connection = {
    workspaceId: 'workspace-a',
    connectionId: 'connection-a',
    environment: 'production',
    status: 'connected',
    username: 'seller-a',
    lastReadAt: null,
  };
  let api: {
    loadStatus: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    loadListings: ReturnType<typeof vi.fn>;
    loadOrders: ReturnType<typeof vi.fn>;
    loadTraffic: ReturnType<typeof vi.fn>;
    loadTrafficOverview: ReturnType<typeof vi.fn>;
    loadListingPerformance: ReturnType<typeof vi.fn>;
    loadAdvertisingReport: ReturnType<typeof vi.fn>;
  };
  beforeAll(async () => {
    const restoreBindings = await prepareMarketplaceRendering([
      {
        type: EbayListingPerformanceComponent,
        path: 'src/app/features/marketplaces/components/ebay-listing-performance/ebay-listing-performance.component.ts',
      },
      {
        type: EbayTrafficOverviewComponent,
        path: 'src/app/features/marketplaces/components/ebay-traffic-overview/ebay-traffic-overview.component.ts',
      },
      {
        type: EbayWorkspaceComponent,
        path: 'src/app/features/marketplaces/ebay-workspace.component.ts',
      },
      {
        type: EbayArticleMappingComponent,
        path: 'src/app/features/marketplaces/components/ebay-article-mapping/ebay-article-mapping.component.ts',
      },
      {
        type: ArticlePickerComponent,
        path: 'src/app/shared/components/article-picker/article-picker.component.ts',
      },
      {
        type: ModalShellComponent,
        path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
      },
      {
        type: TextFieldComponent,
        path: 'src/app/shared/components/text-field/text-field.component.ts',
      },
      {
        type: ProductThumbnailComponent,
        path: 'src/app/shared/components/product-thumbnail/product-thumbnail.component.ts',
      },
      {
        type: CustomSelectComponent,
        path: 'src/app/shared/components/custom-select/custom-select.component.ts',
      },

      {
        type: EbayAccountComponent,
        path: 'src/app/features/marketplaces/components/ebay-account/ebay-account.component.ts',
      },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
      { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
      { type: CardComponent, path: 'src/app/shared/components/card/card.component.ts' },
      {
        type: DataTableComponent,
        path: 'src/app/shared/components/data-table/data-table.component.ts',
      },
      {
        type: PageHeaderComponent,
        path: 'src/app/shared/components/page-header/page-header.component.ts',
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
        type: TableColumnPickerComponent,
        path: 'src/app/shared/components/table-column-picker/table-column-picker.component.ts',
      },
      {
        type: CustomCheckboxComponent,
        path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
      },
    ]);
    // Der Vitest-JIT-Lauf liefert Signal-Abfragen nicht aus dem Angular-Compiler.
    const metadata = (
      EbayAccountComponent as unknown as {
        ɵcmp: { viewQuery?: (flags: number, context: unknown) => void };
      }
    ).ɵcmp;
    const previousQuery = metadata.viewQuery;
    metadata.viewQuery = (flags, context) => {
      const component = context as { mappingPanel: Parameters<typeof ɵɵviewQuerySignal>[0] };
      if (flags & 1) ɵɵviewQuerySignal(component.mappingPanel, ['mappingPanel'], 5);
      if (flags & 2) ɵɵqueryAdvance();
    };
    resetBindings = () => {
      metadata.viewQuery = previousQuery;
      restoreBindings();
    };
  });
  afterAll(() => resetBindings?.());
  beforeEach(() => {
    workspace.set({ id: 'workspace-a', archived_at: null });
    user.set({ id: 'user-a' });
    api = {
      loadListingPerformance: vi.fn(async () => ({
        ...connection,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        lastUpdatedDate: null,
        limit: 200,
        items: [
          {
            listingId: '123',
            title: 'Eigene Auktion',
            imageUrl: null,
            watchCount: 3,
            impressions: 1250,
            views: 25,
            transactions: 1,
            searchImpressions: 1000,
            searchViews: 20,
            clickThroughRate: 0.02,
            conversionRate: 0.04,
          },
        ],
      })),
      loadAdvertisingReport: vi.fn(async () => ({
        ...connection,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        status: 'pending',
        generatedAt: null,
        days: [],
        items: [],
      })),
      loadTrafficOverview: vi.fn(async () => ({
        ...connection,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        lastUpdatedDate: null,
        days: Array.from({ length: 30 }, (_, index) => ({
          date: `2026-09-${String(index + 1).padStart(2, '0')}`,
          impressions: 100,
          views: 8,
          transactions: 1,
          searchImpressions: 80,
          searchViews: 4,
          clickThroughRate: 0.05,
          conversionRate: 0.125,
        })),
      })),
      loadTraffic: vi.fn(async () => ({
        ...connection,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        lastUpdatedDate: null,
        items: [{ listingId: '123', views: 8, transactions: 1, conversionRate: 0.125 }],
      })),
      loadStatus: vi.fn(async () => ({ configured: true, connection })),
      connect: vi.fn(),
      disconnect: vi.fn(async () => undefined),
      loadListings: vi.fn(async () => ({
        ...connection,
        items: [
          {
            id: '123',
            title: 'Eigene Auktion',
            price: 0,
            currency: 'EUR',
            quantity: 1,
            listingType: 'Chinese',
            url: 'https://www.ebay.de/itm/123',
          },
        ],
        total: 1,
        nextPage: null,
      })),
      loadOrders: vi.fn(async () => ({
        ...connection,
        items: [
          {
            id: 'order-a',
            createdAt: '2026-10-01T00:00:00Z',
            total: 0,
            currency: 'EUR',
            paymentStatus: 'FULLY_REFUNDED',
            fulfillmentStatus: 'NOT_STARTED',
            cancelStatus: 'CANCELED',
            items: [{ title: 'Stornierter Artikel', quantity: 1 }],
          },
        ],
        total: 1,
        nextPage: null,
      })),
    };
    const sourceState = { loadedWorkspaceId: signal('workspace-a'), loadError: signal(null) };
    TestBed.configureTestingModule({
      imports: [EbayAccountComponent],
      providers: [
        { provide: EbayOrderImportApiService, useValue: { loadMappings: vi.fn(async () => []) } },
        {
          provide: CatalogService,
          useValue: {
            ...sourceState,
            products: signal([]),
            loadProducts: vi.fn(async () => undefined),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            ...sourceState,
            items: signal([]),
            loadInventory: vi.fn(async () => undefined),
          },
        },
        {
          provide: PurchaseService,
          useValue: {
            ...sourceState,
            purchases: signal([]),
            loadPurchases: vi.fn(async () => undefined),
          },
        },
        {
          provide: StockService,
          useValue: {
            ...sourceState,
            positions: signal([]),
            loadPositions: vi.fn(async () => undefined),
          },
        },
        provideRouter([], withComponentInputBinding()),
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: EbayAccountApiService, useValue: api },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function render(
    showData = true,
    page: 'listings' | 'orders' | 'statistics' | 'connection' = 'listings',
  ) {
    const fixture = TestBed.createComponent(EbayAccountComponent);
    fixture.componentRef.setInput('showData', showData);
    fixture.componentRef.setInput('page', page);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.store.isReading()).toBe(false));
    fixture.detectChanges();
    return fixture;
  }
  it('zeigt normalen Nutzern Konto, aktive Inserate und getrennte Bestellzustände', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('seller-a');
    expect(element.textContent).toContain('Eigene Auktion');
    expect(element.textContent).not.toContain('App-ID');
    fixture.componentRef.setInput('page', 'orders');
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.store.hasRead()).toBe(true));
    fixture.detectChanges();
    expect(element.textContent).toContain('Stornierter Artikel');
    expect(element.textContent).toContain('Storniert');
    expect(element.textContent).toContain('Erstattet');
    expect(element.textContent).toContain('Prüfe Artikel und Kosten');
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
  it('entfernt angezeigte Daten unmittelbar bei Abmeldung', async () => {
    const fixture = await render();
    user.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Eigene Auktion');
    expect(fixture.componentInstance.store.connection()).toBeNull();
  });
  it('trennt Inserate, Statistiken, Bestellungen und Verbindung über echte Seitenrouten', async () => {
    api.loadStatus.mockResolvedValue({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'marketplaces', children: MARKETPLACES_ROUTES }]);
    const fixture = TestBed.createComponent(EbayWorkspaceComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/marketplaces/ebay?ebay_result=connected&workspace=workspace-a');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(router.url).toContain('/marketplaces/ebay/listings?');
    expect(element.textContent).toContain('eBay-Inserate');
    expect(element.textContent).toContain('Deine eBay-Anmeldung wurde abgeschlossen');
    expect(element.textContent).not.toContain('Erneut mit eBay verbinden');
    expect(element.textContent).not.toContain('Käufe / Aufrufe');
    expect(element.textContent).toContain('Aufrufe (30 Tage)');
    api.loadListings.mockClear();
    await router.navigateByUrl('/marketplaces/ebay/statistics');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('eBay-Statistiken');
    expect(element.textContent).toContain('12.5%');
    expect(element.textContent).not.toContain('Aktueller Preis');
    expect(element.textContent).toContain('Impressionen');
    expect(element.textContent).toContain('Klickrate');
    expect(api.loadTrafficOverview).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'connection-a' }),
      30,
    );
    expect(api.loadListings).not.toHaveBeenCalled();
    api.loadListings.mockClear();
    api.loadOrders.mockClear();
    await router.navigateByUrl('/marketplaces/ebay/orders');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('eBay-Bestellungen');
    expect(element.textContent).toContain('Stornierter Artikel');
    expect(api.loadOrders).toHaveBeenCalledOnce();
    expect(api.loadListings).not.toHaveBeenCalled();
    api.loadOrders.mockClear();
    await router.navigateByUrl('/marketplaces/ebay/connection');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('eBay-Kontoverbindung');
    expect(element.textContent).toContain('Erneut mit eBay verbinden');
    expect(element.querySelector('app-data-table')).toBeNull();
    expect(api.loadOrders).not.toHaveBeenCalled();
    expect(api.loadListings).not.toHaveBeenCalled();
  });
  it('filtert geladene Inserate und Bestellungen und löscht die Suche beim Workspacewechsel', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const search = element.querySelector<HTMLInputElement>('input');
    if (!search) throw new Error('Missing table search');
    search.value = 'Nicht vorhanden';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Keine Treffer für Deine Suche');
    search.value = 'AUKTION';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(element.textContent).toContain('Eigene Auktion');
    fixture.componentRef.setInput('page', 'orders');
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.store.hasRead()).toBe(true));
    fixture.componentInstance.searchText.set('order-a');
    fixture.detectChanges();
    expect(element.textContent).toContain('Stornierter Artikel');
    workspace.set({ id: 'workspace-b', archived_at: null });
    fixture.detectChanges();
    expect(fixture.componentInstance.searchText()).toBe('');
  });
  it('wechselt den Trafficzeitraum und zeigt einen Abruffehler ohne veraltete Kennzahlen', async () => {
    api.loadStatus.mockResolvedValue({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    const fixture = await render(true, 'statistics');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Conversion Rate');
    const sevenDays = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '7 Tage',
    );
    expect(sevenDays).toBeDefined();
    api.loadTrafficOverview.mockRejectedValueOnce(new Error('eBay ist gerade nicht erreichbar.'));
    sevenDays?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.loadTrafficOverview).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectionId: 'connection-a' }),
      7,
    );
    expect(element.textContent).toContain('eBay ist gerade nicht erreichbar.');
    expect(element.textContent).not.toContain('Conversion Rate');
    user.set(null);
    fixture.detectChanges();
    expect(element.querySelector('app-ebay-traffic-overview')).toBeNull();
  });
  it('zeigt Artikelwerte und echte Werbedaten erst nach erfolgreicher Berichtserstellung', async () => {
    api.loadStatus.mockResolvedValue({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    const fixture = await render(true, 'statistics');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(api.loadListingPerformance).toHaveBeenCalled();
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const table = element.querySelector('[aria-label="eBay-Artikelauswertung"]');
    expect(table?.textContent).toContain('Eigene Auktion');
    expect(table?.textContent).toContain('1,250');
    expect(table?.textContent).toContain('4.0%');
    expect(table?.textContent).toContain('Nicht geladen');
    const button = () =>
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        /Werbeberichte laden|Berichtstatus prüfen/.test(candidate.textContent ?? ''),
      );
    button()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('eBay erstellt Deine Werbeberichte');
    expect(table?.textContent).toContain('Nicht geladen');
    api.loadAdvertisingReport.mockResolvedValueOnce({
      ...connection,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'ready',
      generatedAt: null,
      days: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-09-${String(index + 1).padStart(2, '0')}`,
        impressions: 20,
        clicks: 1,
      })),
      items: [{ listingId: '123', impressions: 600, clicks: 30 }],
    });
    button()?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(table?.textContent).toContain('600');
    expect(table?.textContent).not.toContain('Nicht geladen');
    expect(element.textContent).toContain('Werbeklicks');
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
    user.set(null);
    fixture.detectChanges();
    expect(element.querySelector('app-ebay-listing-performance')).toBeNull();
  });
  it('zeigt Bild, Bearbeitungslink, Beobachter und Aufrufe direkt bei Inseraten', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    const fixture = await render();
    fixture.componentInstance.store.listings.update((items) =>
      items.map((item) => ({
        ...item,
        imageUrl: 'https://i.ebayimg.com/photo.jpg',
        watchCount: 0,
      })),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('img')?.getAttribute('src')).toBe(
      'https://i.ebayimg.com/photo.jpg',
    );
    expect(
      element
        .querySelector('[aria-label="Inserat bearbeiten: Eigene Auktion"]')
        ?.getAttribute('href'),
    ).toBe('/marketplaces/ebay/listings/123/edit?connection=connection-a');
    expect(element.textContent).toContain('Aufrufe (30 Tage)');
    expect(element.querySelector('tbody')?.textContent).toContain('8');
    expect(element.textContent).toContain('Beobachter');
    const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
  it('öffnet beim Klick auf Bearbeiten den Angebotspfad mit separater Kontoverbindung', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    const fixture = await render();
    const editorRoute = MARKETPLACES_ROUTES.find((route) => route.path === 'ebay')?.children?.find(
      (route) => route.path?.endsWith(':listingId/edit'),
    );
    if (!editorRoute) throw new Error('Missing eBay editor route');
    const router = TestBed.inject(Router);
    router.resetConfig([
      {
        path: 'marketplaces',
        children: [
          { path: 'ebay', children: [{ path: editorRoute.path, component: EbayAccountComponent }] },
        ],
      },
      { path: 'dashboard', component: EbayAccountComponent },
      { path: '**', redirectTo: 'dashboard' },
    ]);
    const editLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[aria-label="Inserat bearbeiten: Eigene Auktion"]',
    );
    expect(editLink).not.toBeNull();
    editLink?.click();
    await fixture.whenStable();
    expect(router.url).toBe('/marketplaces/ebay/listings/123/edit?connection=connection-a');
    expect(router.parseUrl(router.url).queryParams['connection']).toBe('connection-a');
  });
  it('unterscheidet fehlende Statistikwerte von einem fehlgeschlagenen Abruf', async () => {
    api.loadStatus.mockResolvedValueOnce({
      configured: true,
      listingManagementAvailable: true,
      connection,
    });
    api.loadTraffic.mockResolvedValueOnce({
      ...connection,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      lastUpdatedDate: null,
      items: [{ listingId: '123', views: null, transactions: null, conversionRate: null }],
    });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Keine Daten');
    api.loadTraffic.mockRejectedValueOnce(
      new Error('Die Statistikantwort konnte nicht ausgewertet werden.'),
    );
    await fixture.componentInstance.store.readTraffic();
    fixture.detectChanges();
    expect(element.textContent).toContain('Abruf fehlgeschlagen');
    expect(element.textContent).toContain('Die Statistikantwort konnte nicht ausgewertet werden.');
    expect(element.textContent).toContain('Eigene Auktion');
  });
  it('bietet Zuordnung erst bei bestätigter Serverfähigkeit an', async () => {
    const disabled = await render();
    expect(
      (disabled.nativeElement as HTMLElement).querySelector(
        '[aria-label="Artikel zuordnen: Eigene Auktion"]',
      ),
    ).toBeNull();
    disabled.destroy();
    api.loadStatus.mockResolvedValueOnce({ configured: true, importAvailable: true, connection });
    const enabled = await render();
    expect(
      (enabled.nativeElement as HTMLElement).querySelector(
        '[aria-label="Artikel zuordnen: Eigene Auktion"]',
      ),
    ).not.toBeNull();
  });
  it('bietet während fehlender Serverkonfiguration keinen scheinbaren Login an', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: false, connection: null });
    const fixture = await render(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('wird noch eingerichtet');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Mit eBay verbinden');
    expect(api.loadListings).not.toHaveBeenCalled();
  });
  it('zeigt eine fehlende Anbindung auch bei einer noch gespeicherten Kontoverbindung', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: false, connection });
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('wird noch eingerichtet');
    expect(api.loadListings).not.toHaveBeenCalled();
  });
  it('führt den Fokus zur Artikelzuordnung und nach dem Schließen zurück zum Inserat', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: true, importAvailable: true, connection });
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>(
      '[aria-label="Artikel zuordnen: Eigene Auktion"]',
    )!;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = element.querySelector<HTMLElement>('[aria-label="Artikelzuordnung"]');
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(panel);
    fixture.componentInstance.closeMapping();
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
  });
});
