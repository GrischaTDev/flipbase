import { signal } from '@angular/core';
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
    resetBindings = await prepareMarketplaceRendering([
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
    TestBed.configureTestingModule({
      imports: [EbayAccountComponent],
      providers: [
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
    expect(element.textContent).toContain('weder deine Flipbase-Verkäufe noch deinen Lagerbestand');
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
  it('bietet während fehlender Serverkonfiguration keinen scheinbaren Login an', async () => {
    api.loadStatus.mockResolvedValueOnce({ configured: false, connection: null });
    const fixture = await render(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('wird noch eingerichtet');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Mit eBay verbinden');
    expect(api.loadListings).not.toHaveBeenCalled();
  });
});
