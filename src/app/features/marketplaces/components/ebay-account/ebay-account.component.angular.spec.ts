import { EbayArticleMappingComponent } from '../ebay-article-mapping/ebay-article-mapping.component';
import { ArticlePickerComponent } from '../../../../shared/components/article-picker/article-picker.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { signal, ɵɵqueryAdvance, ɵɵviewQuerySignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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
  };
  beforeAll(async () => {
    const restoreBindings = await prepareMarketplaceRendering([
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
        provideRouter([]),
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
  async function render(showData = true) {
    const fixture = TestBed.createComponent(EbayAccountComponent);
    fixture.componentRef.setInput('showData', showData);
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
    await fixture.componentInstance.store.selectSection('orders');
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
