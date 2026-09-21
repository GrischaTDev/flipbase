import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from '../../core/models/flipbase.models';
import { InvoiceService } from '../../core/services/invoice.service';
import { ReturnService } from '../../core/services/return.service';
import { SalesService } from '../../core/services/sales.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { CostStateComponent } from '../../shared/components/cost-state/cost-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../shared/components/button/button.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});
import { PurchaseDetailTableComponent } from '../purchases/components/purchase-detail-table/purchase-detail-table.component';
import type { PurchaseDetailRow } from '../purchases/models/purchase-presentation.models';
import { SalesComponent } from './sales.component';

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(PageHeaderComponent, ['icon']);
  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'searchEnabled',
    'toolbarVisible',
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
    'loading',
    'errorMessage',
    'hasRows',
    'loadingText',
    'emptyTitle',
    'emptyText',
  ]);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'size',
    'icon',
    'disabled',
    'ariaLabel',
    'ariaPressed',
  ]);
  registerSignalInputs(TableColumnMenuComponent, [
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
  ]);
  registerSignalInputs(TableSortHeaderComponent, [
    'label',
    'sortField',
    'currentSort',
    'description',
  ]);
});

const workspace = { id: 'workspace-1' };
const linkedSale: Sale = {
  id: 'sale-1',
  workspace_id: workspace.id,
  platform: 'ebay',
  sale_price: 33,
  sale_date: '2026-08-25',
  platform_fee: 3,
  shipping_cost: 5,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 13,
  roi: 65,
  holding_duration_days: 4,
  has_persisted_lines: true,
  lines: [
    {
      id: 'sale-line-1',
      sale_id: 'sale-1',
      inventory_item_id: 'item-1',
      title_snapshot: 'Tasse',
      quantity: 1,
      unit_sale_price: 33,
      line_total: 33,
      cost_of_goods_sold: 20,
      tax_mode: 'diff_25a',
    },
  ],
};

const purchaseRow: PurchaseDetailRow = {
  kind: 'normal',
  id: 'line-1',
  title: 'Tasse',
  orderedQuantity: 1,
  receivedQuantity: 1,
  inventoryItemId: 'item-1',
  inventoryItemLinks: [{ id: 'item-1', label: 'Artikel 1' }],
  recordedSales: [{ id: linkedSale.id, status: 'active', revenue: 33, directResult: 13 }],
  salesState: 'loaded',
  quantityState: 'loaded',
  captureRemaining: 0,
  unitPurchasePrice: { kind: 'known', amount: 20 },
  lineTotal: { kind: 'known', amount: 20 },
  availableUnits: 0,
  soldUnits: 1,
};

let sales = signal<Sale[]>([]);
let loadedWorkspaceId = signal<string | null>(null);
let loadError = signal<Error | null>(null);
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalFocus = HTMLElement.prototype.focus;
const originalMatchMedia = globalThis.matchMedia;

afterEach(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  HTMLElement.prototype.focus = originalFocus;
  globalThis.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  sales = signal<Sale[]>([]);
  loadedWorkspaceId = signal<string | null>(null);
  loadError = signal<Error | null>(null);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      SalesComponent,
      PurchaseDetailTableComponent,
      CostStateComponent,
      PageHeaderComponent,
      TableColumnMenuComponent,
      TableSortHeaderComponent,
      DataTableComponent,
    ],
    providers: [
      provideRouter([{ path: 'sales', component: SalesComponent }]),
      provideTranslateService({ lang: 'de' }),
      {
        provide: SalesService,
        useValue: {
          sales,
          loadedWorkspaceId,
          loadError,
          isLoading: signal(false),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspace) } },
      {
        provide: ReturnService,
        useValue: { returns: signal([]), processReturn: vi.fn() },
      },
      { provide: InvoiceService, useValue: { generateInvoiceForSale: vi.fn() } },
      {
        provide: ToastService,
        useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
      },
      {
        provide: SyncStatusService,
        useValue: {
          istZentralGemeldet: () => false,
          beiSitzungsverdacht: () => undefined,
        },
      },
    ],
  });
});

describe('SalesComponent – verlinkter Verkauf', () => {
  it('verwendet im Verkaufsjournal klare Kennzahlen und keine ROI-Dominanz', async () => {
    sales.set([linkedSale]);
    loadedWorkspaceId.set(workspace.id);

    const harness = await RouterTestingHarness.create('/sales');
    const host = harness.routeNativeElement as HTMLElement;
    const headers = [...host.querySelectorAll('thead th')].map((header) =>
      header.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(headers).toEqual([
      'Verkaufter Artikel',
      'Menge',
      'Plattform',
      'Datum',
      'Verkaufserlös',
      'Wareneinsatz',
      'Verkaufskosten',
      'Ergebnis',
      'Marge',
      'Haltedauer',
      'Aktionen',
    ]);
    expect(host.querySelector('thead abbr')?.getAttribute('title')).toBe(
      'Verkaufserlös abzüglich Wareneinsatz und Verkaufskosten',
    );
    expect(host.textContent).toContain('Durchschnittliche Marge');
    expect(host.textContent).not.toContain('ROI');
    expect(host.textContent).not.toContain('Nettogewinn');
  });

  it('verlinkt jede Verkaufszeile in Desktop- und Mobilansicht direkt zum Einzelbeleg', async () => {
    sales.set([linkedSale]);
    loadedWorkspaceId.set(workspace.id);

    const harness = await RouterTestingHarness.create('/sales');
    const links = Array.from(
      harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>(
        '[data-sale-audit-print-link]',
      ) ?? [],
    );

    expect(links).toHaveLength(2);
    expect(links.every((link) => link.textContent?.includes('Prüfbeleg'))).toBe(true);
    expect(
      links.every(
        (link) =>
          link.getAttribute('href') === '/settings/data/print?entityType=sale&entityId=sale-1',
      ),
    ).toBe(true);
    expect(links.every((link) => link.getAttribute('aria-label')?.includes('Tasse'))).toBe(true);
  });

  it('kennzeichnet einen Altverkauf ohne belegbaren Wareneinsatz als offen', async () => {
    sales.set([
      {
        ...linkedSale,
        id: 'sale-without-cost-basis',
        lines: [],
        has_persisted_lines: false,
        inventory_item: undefined,
      },
    ]);
    loadedWorkspaceId.set(workspace.id);

    const harness = await RouterTestingHarness.create('/sales');
    expect(harness.routeNativeElement?.textContent).toContain('Kosten noch offen');
    expect(
      harness.routeNativeElement?.querySelector('[data-testid="sales-result-kpi"]')?.textContent,
    ).toContain('Kosten noch offen');
  });

  it('navigiert vom Einkaufsdetail und markiert den Verkauf erst nach autoritativem Laden', async () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    HTMLElement.prototype.focus = focus;
    const harness = await RouterTestingHarness.create();
    const tableFixture = TestBed.createComponent(PurchaseDetailTableComponent);
    Object.assign(tableFixture.componentInstance, {
      purchaseId: signal('purchase-1'),
      rows: signal([purchaseRow]),
    });
    tableFixture.detectChanges();

    (tableFixture.nativeElement as HTMLElement)
      .querySelector<HTMLAnchorElement>('[data-purchase-sale-link]')
      ?.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/sales?saleId=sale-1'));
    expect(harness.routeNativeElement?.querySelector('[data-sale-highlighted="true"]')).toBeNull();

    sales.set([linkedSale]);
    loadedWorkspaceId.set(workspace.id);
    await vi.waitFor(() => {
      const highlighted = harness.routeNativeElement?.querySelectorAll<HTMLElement>(
        '[data-sale-highlighted="true"]',
      );
      expect(highlighted).toHaveLength(2);
      expect(new Set(Array.from(highlighted ?? []).map((element) => element.id)).size).toBe(2);
      expect(focus).toHaveBeenCalledOnce();
      expect((focus.mock.instances[0] as HTMLElement).id).toMatch(/^sale-(desktop|mobile)-sale-1$/);
      expect(scrollIntoView).toHaveBeenCalledOnce();
    });
  });

  it.each(['/sales?saleId=https://evil.example', '/sales?saleId=sale-foreign'])(
    'ignoriert einen ungültigen oder workspacefremden Zielverkauf: %s',
    async (url) => {
      sales.set([{ ...linkedSale, id: 'sale-foreign', workspace_id: 'workspace-foreign' }]);
      loadedWorkspaceId.set(workspace.id);
      const harness = await RouterTestingHarness.create(url);

      expect(
        harness.routeNativeElement?.querySelector('[data-sale-highlighted="true"]'),
      ).toBeNull();
    },
  );

  it.each([
    { matches: true, expectedTarget: 'sale-desktop-sale-1' },
    { matches: false, expectedTarget: 'sale-mobile-sale-1' },
  ])(
    'fokussiert beim direkten Reload für matchMedia=$matches genau das sichtbare Ziel',
    async ({ matches, expectedTarget }) => {
      const focus = vi.fn();
      const scrollIntoView = vi.fn();
      HTMLElement.prototype.focus = focus;
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      globalThis.matchMedia = vi.fn().mockReturnValue({ matches }) as typeof matchMedia;
      sales.set([linkedSale]);
      loadedWorkspaceId.set(workspace.id);

      const harness = await RouterTestingHarness.create('/sales?saleId=sale-1');

      await vi.waitFor(() => {
        expect(focus).toHaveBeenCalledOnce();
        expect((focus.mock.instances[0] as HTMLElement).id).toBe(expectedTarget);
        expect(scrollIntoView).toHaveBeenCalledOnce();
        expect(harness.routeNativeElement?.querySelectorAll(`#${expectedTarget}`)).toHaveLength(1);
      });
    },
  );

  it('fokussiert den Verkauf nach einem echten Komponenten-Neustart erneut', async () => {
    const focus = vi.fn();
    HTMLElement.prototype.focus = focus;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof matchMedia;
    sales.set([linkedSale]);
    loadedWorkspaceId.set(workspace.id);
    const harness = await RouterTestingHarness.create('/sales?saleId=sale-1');
    await vi.waitFor(() => expect(focus).toHaveBeenCalledTimes(1));

    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/sales?saleId=sale-1', SalesComponent);

    await vi.waitFor(() => expect(focus).toHaveBeenCalledTimes(2));
    expect((focus.mock.instances[1] as HTMLElement).id).toBe('sale-desktop-sale-1');
  });

  it('passt sichtbare Spalten dynamisch an wenn eine Spalte ausgeblendet wird', async () => {
    sales.set([linkedSale]);
    loadedWorkspaceId.set(workspace.id);

    const harness = await RouterTestingHarness.create();
    const comp = await harness.navigateByUrl('/sales', SalesComponent);

    expect(comp.isColumnVisible('quantity')).toBe(true);
    comp.toggleColumnVisibility('quantity');
    harness.detectChanges();

    expect(comp.isColumnVisible('quantity')).toBe(false);

    const host = harness.routeNativeElement as HTMLElement;
    const headers = [...host.querySelectorAll('thead th')].map((header) =>
      header.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(headers).not.toContain('Menge');
  });
});
