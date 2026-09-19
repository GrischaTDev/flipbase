import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, Purchase } from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { InboundTrackingService } from '../../core/services/inbound-tracking.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PurchasesComponent } from './purchases.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CostStateComponent } from '../../shared/components/cost-state/cost-state.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PurchaseReceiptPreviewComponent } from './components/purchase-receipt-preview/purchase-receipt-preview.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';

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

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
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
  registerSignalInputs(BadgeComponent, ['tone', 'marker', 'mono']);
  registerSignalInputs(ButtonComponent, [
    'icon',
    'iconOnly',
    'ariaExpanded',
    'ariaControls',
    'ariaHaspopup',
    'ariaLabel',
    'ariaPressed',
    'variant',
    'size',
  ]);
  registerSignalInputs(CostStateComponent, ['state']);
  registerSignalInputs(CustomSearchInputComponent, [
    'value',
    'placeholder',
    'ariaLabel',
    'variant',
    'size',
  ]);
  registerSignalInputs(CustomSelectComponent, [
    'options',
    'value',
    'variant',
    'widthClass',
    'ariaLabel',
  ]);
  registerSignalInputs(PurchaseReceiptPreviewComponent, ['purchaseId', 'receipt']);
});

const workspaceId = 'workspace-1';

const purchases: Purchase[] = [
  {
    id: 'purchase-normal',
    workspace_id: workspaceId,
    record_number: '#E1',
    type: 'single',
    title: 'Haushaltswaren',
    purchase_date: '2026-08-20',
    purchase_price: 40,
    total_purchase_cost: 45,
    cost_allocation_mode: 'even',
    entry_status: 'finalized',
    receiving_status: 'received',
    supplier: { id: 'supplier-1', workspace_id: workspaceId, name: 'Beispiel GmbH' },
    purchase_lines: [
      {
        id: 'line-1',
        workspace_id: workspaceId,
        purchase_id: 'purchase-normal',
        catalog_product_id: null,
        title_snapshot: 'Tasse',
        line_kind: 'individual',
        ordered_quantity: 1,
        received_quantity: 1,
        unit_purchase_price: 40,
        line_total: 40,
        allocated_additional_cost: 5,
        allocated_total_cost: 45,
      },
    ],
  },
  {
    id: 'purchase-mystery',
    workspace_id: workspaceId,
    type: 'mystery_pack',
    title: 'Mystery Box',
    purchase_date: '2026-08-22',
    purchase_price: null,
    total_purchase_cost: null,
    cost_allocation_mode: 'even',
    entry_status: 'capturing',
    receiving_status: 'received',
    purchase_lines: [],
  },
];

const purchaseState = signal(purchases);

const inventoryItem: InventoryItem = {
  id: 'item-1',
  workspace_id: workspaceId,
  purchase_id: 'purchase-normal',
  purchase_line_id: 'line-1',
  title: 'Tasse',
  condition: 'very_good',
  status: 'ready',
  sale_state: 'no_active_sale',
  allocated_purchase_cost: 45,
};

beforeEach(() => {
  localStorage.clear();
  purchaseState.set(purchases);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      PurchasesComponent,
      PageHeaderComponent,
      TableColumnMenuComponent,
      TableSortHeaderComponent,
      DataTableComponent,
    ],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'de' }),
      {
        provide: PurchaseService,
        useValue: { purchases: purchaseState },
      },
      {
        provide: InventoryService,
        useValue: {
          items: signal([inventoryItem]),
          istGeladen: signal(true),
          loadedWorkspaceId: signal<string | null>(workspaceId),
          loadError: signal<Error | null>(null),
        },
      },
      {
        provide: StockService,
        useValue: {
          lots: signal([]),
          movements: signal([]),
          isLoading: signal(false),
          loadError: signal(null),
          loadedWorkspaceId: signal(workspaceId),
          loadPositions: vi.fn(async () => undefined),
        },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: workspaceId }) },
      },
      {
        provide: InboundTrackingService,
        useValue: { getTrackingInfo: vi.fn(), statusConfig: {} },
      },
    ],
  });
});

describe('PurchasesComponent – responsive Einkaufsübersicht', () => {
  it('zeigt Verkäufer vor der optionalen Bezeichnung', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();

    const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('thead th')].map(
      (heading) => heading.textContent?.trim(),
    );
    expect(headings.slice(0, 3)).toEqual(['Einkauf', 'Verkäufer', 'Bezeichnung']);
  });

  it('trennt Einkaufsnummer und Bezeichnung und zeigt den Wareneingang statt Erfassungsbestand', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const headers = Array.from(host.querySelectorAll('thead th')).map((header) =>
      header.textContent?.replace(/\s+/g, ' ').trim(),
    );
    const normalRow = host.querySelector('[data-purchase-row="purchase-normal"]')?.closest('tr');

    expect(headers).toContain('Einkauf');
    expect(headers).toContain('Bezeichnung');
    expect(headers).toContain('Erhalten');
    expect(headers).toContain('Gesamt');
    expect(headers).not.toContain('Erfassung');
    expect(headers).not.toContain('Stückzahl und Bestand');
    expect(headers).not.toContain('Gesamtkosten');
    expect(normalRow?.querySelector('[data-purchase-reference]')?.textContent?.trim()).toBe('#E1');
    expect(normalRow?.querySelector('[data-purchase-description]')?.textContent?.trim()).toBe(
      'Haushaltswaren',
    );
    expect(normalRow?.querySelector('app-purchase-receipt-preview button')?.textContent).toContain(
      '1 von 1',
    );
  });

  it('öffnet zur erhaltenen Menge eine Positionsvorschau', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const normalRow = host.querySelector('[data-purchase-row="purchase-normal"]')?.closest('tr');
    const trigger = normalRow?.querySelector<HTMLButtonElement>(
      'app-purchase-receipt-preview button',
    );

    expect(trigger).not.toBeNull();
    if (!trigger) throw new Error('Erhalten-Trigger fehlt');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const preview = normalRow?.querySelector('[data-purchase-receipt-preview]');
    expect(preview?.textContent).toContain('Tasse');
    expect(preview?.textContent).toContain('1 von 1');
  });

  it('rendert eine semantische Tabelle mit einem Eintrag pro Einkauf', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const list = host.querySelector('[data-purchase-list]');
    const rows = Array.from(
      host.querySelectorAll<HTMLTableRowElement>('[data-purchase-table-row]'),
    );
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('[data-purchase-row]'));

    expect(list).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(links.map((row) => row.getAttribute('href'))).toEqual([
      '/purchases/purchase-mystery',
      '/purchases/purchase-normal',
    ]);
    const normalRow = host.querySelector('[data-purchase-row="purchase-normal"]')?.closest('tr');
    const mysteryRow = host.querySelector('[data-purchase-row="purchase-mystery"]')?.closest('tr');
    expect(normalRow?.textContent).toContain('1 von 1');
    expect(mysteryRow?.textContent).toContain('Inhalt offen');
    expect(mysteryRow?.textContent).toContain('Kosten noch offen');
  });

  it('zeigt weder Kostenstatus- noch Aktionsspalte und nutzt gemeinsame Status-Badges', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const mystery = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-purchase-row="purchase-mystery"]')
      ?.closest('tr');

    expect(host.textContent).not.toContain('Kostenstatus');
    expect(host.textContent).not.toContain('Aktionen');
    expect(mystery?.querySelector('[data-allocation-open]')).toBeNull();
    expect(mystery?.querySelector('app-badge')).not.toBeNull();
    expect(mystery?.querySelector('app-badge [data-badge-marker]')).toBeNull();
  });

  it('behält Suche und Rücksetzung bei einer Suche ohne Treffer sichtbar', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    fixture.componentInstance.searchQuery.set('zzznichtvorhanden');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('app-custom-search-input input');
    const reset = fixture.debugElement.query(By.css('[data-reset-purchase-view]'));

    expect(search).not.toBeNull();
    expect(search?.value).toBe('zzznichtvorhanden');
    expect(host.textContent).toContain('Keine passenden Einkäufe');
    expect(reset).not.toBeNull();

    reset.triggerEventHandler('clicked', new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.searchQuery()).toBe('');
    expect(host.querySelectorAll('[data-purchase-table-row]')).toHaveLength(2);
  });

  it('kombiniert Nummernsuche, Status und Verkäufer-ID und trennt Filter- von Layout-Rücksetzung', () => {
    const list = purchaseState;
    list.set([
      {
        ...purchases[0],
        record_number: 'EK-104',
        supplier_reference: 'Rechnung-777',
        supplier_id: 'seller-a',
        supplier: { id: 'seller-a', workspace_id: workspaceId, name: 'Alex' },
      },
      {
        ...purchases[0],
        id: 'other',
        record_number: 'EK-105',
        supplier_id: 'seller-b',
        supplier: { id: 'seller-b', workspace_id: workspaceId, name: 'Alex' },
      },
      { ...purchases[0], id: 'archive', receiving_status: 'archived' },
    ]);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.purchaseRows()).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Normale Einkäufe');
    component.activeStatus.set('received');
    component.searchQuery.set('EK-104');
    component.sellerId.set('seller-a');
    fixture.detectChanges();
    expect(component.purchaseRows().map((row) => row.reference)).toEqual(['#EK-104']);
    component.searchQuery.set('Rechnung-777');
    expect(component.purchaseRows().map((row) => row.reference)).toEqual(['#EK-104']);
    component.sellerId.set('seller-b');
    expect(component.purchaseRows()).toHaveLength(0);
    component.clearFilters();
    fixture.detectChanges();
    expect(component.purchaseRows()).toHaveLength(2);
    expect(component.viewModified()).toBe(false);
    component.activeStatus.set('archived');
    expect(component.purchaseRows().map((row) => row.id)).toEqual(['archive']);
    list.set(purchases);
  });

  it('stellt gespeicherte Suchfilter wieder her und speichert deren Rücksetzung', () => {
    localStorage.setItem(
      `flipbase_purchase_filters_v2_${workspaceId}`,
      JSON.stringify({
        status: 'ordered',
        query: 'keine Treffer',
        sellerId: 'supplier-1',
        activeTab: 'mystery_pack',
      }),
    );
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.activeStatus()).toBe('ordered');
    expect(fixture.componentInstance.searchQuery()).toBe('keine Treffer');
    fixture.componentInstance.clearFilters();
    fixture.detectChanges();
    const stored = JSON.parse(
      localStorage.getItem(`flipbase_purchase_filters_v2_${workspaceId}`) ?? '{}',
    );
    expect(stored).toEqual({ status: 'all', query: '', sellerId: '' });
    expect(fixture.componentInstance.purchaseRows()).toHaveLength(2);
  });

  it('besteht für die neue Einkaufsliste den strukturellen AXE-Check', async () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const list = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-purchase-list]',
    ) as HTMLElement;

    const result = await axe.run(list, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
