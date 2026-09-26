import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, Purchase } from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { InboundTrackingService } from '../../core/services/inbound-tracking.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { CatalogService } from '../../core/services/catalog.service';
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
import { ProductThumbnailComponent } from '../../shared/components/product-thumbnail/product-thumbnail.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(
  component: unknown,
  inputNames: readonly string[],
  outputNames: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputNames.map((name) => [name, name])),
  };
}

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
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
  registerSignalInputs(
    ButtonComponent,
    [
      'icon',
      'iconOnly',
      'ariaExpanded',
      'ariaControls',
      'ariaHaspopup',
      'ariaLabel',
      'ariaPressed',
      'variant',
      'size',
    ],
    ['clicked'],
  );
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
  registerSignalInputs(ProductThumbnailComponent, ['src', 'alt', 'size']);
});

const workspaceId = 'workspace-1';

const purchases: Purchase[] = [
  {
    id: 'purchase-normal',
    workspace_id: workspaceId,
    record_number: '#E1',
    type: 'single',
    title: 'Haushaltswaren',
    notes: 'Haushaltswaren',
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
        catalog_product_id: 'catalog-1',
        title_snapshot: 'Tasse',
        ean_snapshot: '1234567890123',
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
const purchaseLoading = signal(false);
const purchaseLoadError = signal<Error | null>(null);
const loadedPurchaseWorkspaceId = signal<string | null>(workspaceId);
const currentWorkspace = signal({ id: workspaceId });
const loadedCatalogWorkspaceId = signal<string | null>(workspaceId);
const loadCatalogProducts = vi.fn(async (requestedWorkspaceId: string) => {
  loadedCatalogWorkspaceId.set(requestedWorkspaceId);
});
const loadPurchases = vi.fn<PurchaseService['loadPurchases']>(async () => {
  purchaseLoading.set(true);
  purchaseLoadError.set(null);
});

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
  purchaseLoading.set(false);
  purchaseLoadError.set(null);
  loadPurchases.mockClear();
  loadedPurchaseWorkspaceId.set(workspaceId);
  currentWorkspace.set({ id: workspaceId });
  loadedCatalogWorkspaceId.set(workspaceId);
  loadCatalogProducts.mockClear();
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
        useValue: {
          purchases: purchaseState,
          isLoading: purchaseLoading,
          loadError: purchaseLoadError,
          loadPurchases,
          loadedWorkspaceId: loadedPurchaseWorkspaceId,
        },
      },
      {
        provide: CatalogService,
        useValue: {
          loadedWorkspaceId: loadedCatalogWorkspaceId,
          imageUrls: () => ({ 'catalog-1': 'https://example.test/tasse.webp' }),
          loadProducts: loadCatalogProducts,
          invalidateProductImage: vi.fn(),
        },
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
        useValue: { currentWorkspace },
      },
      {
        provide: InboundTrackingService,
        useValue: { getTrackingInfo: vi.fn(), statusConfig: {} },
      },
    ],
  });
});

describe('PurchasesComponent – responsive Einkaufsübersicht', () => {
  it('zeigt die freigegebene Spaltenfolge mit Beschreibung', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();

    const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('thead th')].map(
      (heading) => heading.textContent?.trim(),
    );
    expect(headings).toEqual([
      'Einkauf',
      'Kaufdatum',
      'Verkäufer',
      'Status',
      'Erhalten',
      'Beschreibung',
      'Gesamt',
    ]);
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
    expect(headers).toContain('Beschreibung');
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
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
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
    expect(preview?.textContent).toContain('1 / 1');
    expect(preview?.textContent).toContain('EAN 1234567890123');
    expect(preview?.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/tasse.webp',
    );
    expect(preview?.querySelector('h2')?.textContent).toBe('Artikel im Einkauf');
    expect(preview?.querySelector('h2')?.textContent).not.toContain('1 von 1');
    expect(loadCatalogProducts).not.toHaveBeenCalled();
    preview?.querySelector('li')?.click();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('schließt die bisherige Vorschau beim Öffnen einer anderen Einkaufszeile', () => {
    const secondPurchase: Purchase = {
      ...purchases[0],
      id: 'purchase-second',
      record_number: '#E2',
      purchase_lines: purchases[0].purchase_lines?.map((line) => ({
        ...line,
        id: 'line-second',
        purchase_id: 'purchase-second',
      })),
    };
    purchaseState.set([...purchases, secondPurchase]);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const triggers = [
      ...host.querySelectorAll<HTMLButtonElement>('app-purchase-receipt-preview button'),
    ];
    expect(triggers).toHaveLength(2);

    triggers[0].click();
    fixture.detectChanges();
    expect(triggers.map((trigger) => trigger.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
    ]);
    expect(host.querySelectorAll('[data-purchase-receipt-preview]')).toHaveLength(1);

    triggers[1].click();
    fixture.detectChanges();
    expect(triggers.map((trigger) => trigger.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
    ]);
    expect(host.querySelectorAll('[data-purchase-receipt-preview]')).toHaveLength(1);

    triggers[1].click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-purchase-receipt-preview]')).toHaveLength(0);
  });

  it('öffnet die Vorschau in der unteren Bildschirmhälfte nach oben', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>('app-purchase-receipt-preview button');
    if (!trigger) throw new Error('Erhalten-Trigger fehlt');
    const anchor = trigger.closest('app-button');
    if (!anchor) throw new Error('Anker der Vorschau fehlt');
    const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      top: 510,
      bottom: 538,
      left: 700,
      right: 800,
    } as DOMRect);

    try {
      trigger.click();
      fixture.detectChanges();
      const panel = host.querySelector<HTMLElement>('[data-purchase-receipt-preview]');
      expect(panel?.style.top).toBe('');
      expect(panel?.style.bottom).toBe('494px');
      expect(panel?.style.maxHeight).toBe('498px');
    } finally {
      if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
    }
  });

  it('lädt Artikelbilder beim Öffnen und zeigt lange Artikelnamen vollständig', () => {
    purchaseState.set([
      {
        ...purchases[0],
        purchase_lines: [
          {
            ...purchases[0].purchase_lines![0],
            title_snapshot:
              'Besonders lange Artikelbezeichnung für eine gut lesbare Positionsvorschau',
          },
        ],
      },
    ]);
    loadedCatalogWorkspaceId.set(null);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    expect(loadCatalogProducts).not.toHaveBeenCalled();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'app-purchase-receipt-preview button',
    );
    trigger?.click();
    fixture.detectChanges();

    const preview = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-purchase-receipt-preview]',
    );
    expect(loadCatalogProducts).toHaveBeenCalledWith(workspaceId);
    expect(preview?.textContent).toContain(
      'Besonders lange Artikelbezeichnung für eine gut lesbare Positionsvorschau',
    );
    expect(preview?.querySelector('p')?.classList.contains('break-words')).toBe(true);
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

  it('öffnet eine Zeile auch bei einer Textauswahl außerhalb der Tabelle', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector('[data-purchase-row="purchase-normal"]')?.closest('tr');
    const target = row?.querySelector('td');
    if (!row || !target) throw new Error('Einkaufszeile fehlt');
    const outside = document.createTextNode('Ausgewählter Text');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const getSelection = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Ausgewählter Text',
      anchorNode: outside,
      focusNode: outside,
    } as unknown as Selection);
    try {
      fixture.componentInstance.openPurchase(
        {
          target,
          currentTarget: row,
          button: 0,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          altKey: false,
        } as unknown as MouseEvent,
        'purchase-normal',
      );
      expect(navigate).toHaveBeenCalledWith(['/purchases', 'purchase-normal']);
    } finally {
      getSelection.mockRestore();
      navigate.mockRestore();
    }
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
    expect(host.textContent).toContain('Ändere die Suche oder die Filter.');
    expect(reset).not.toBeNull();

    reset.triggerEventHandler('clicked', new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.searchQuery()).toBe('');
    expect(host.querySelectorAll('[data-purchase-table-row]')).toHaveLength(2);
  });

  it('zeigt im Suchfeld nur die eigene Zurücksetzen-Aktion', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    fixture.componentInstance.searchQuery.set('Tasse');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('app-custom-search-input input');
    const clear = host.querySelector<HTMLButtonElement>(
      'app-custom-search-input button[title="Suche zurücksetzen"]',
    );

    expect(search?.type).toBe('text');
    expect(search?.getAttribute('role')).toBe('searchbox');
    expect(search?.getAttribute('inputmode')).toBe('search');
    expect(clear).not.toBeNull();
  });

  it('zeigt bei einem leeren Workspace den echten Leerzustand mit Anlegen-Aktion', () => {
    purchaseState.set([]);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Keine Einkäufe vorhanden');
    expect(host.textContent).toContain('Erstelle deinen ersten Einkauf.');
    expect(host.querySelector('[data-create-first-purchase]')).not.toBeNull();
    expect(host.querySelector('[data-reset-purchase-view]')).toBeNull();
  });

  it('zeigt beim ersten Laden und Workspacewechsel nur den Ladezustand', () => {
    purchaseState.set([]);
    purchaseLoading.set(true);
    loadedPurchaseWorkspaceId.set(null);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-data-table-loading]')).not.toBeNull();
    expect(host.textContent).not.toContain('Keine Einkäufe vorhanden');
    expect(host.textContent).not.toContain('Keine passenden Einkäufe');
    expect(host.querySelector('[data-create-first-purchase]')).toBeNull();

    purchaseState.set(purchases);
    purchaseLoading.set(false);
    loadedPurchaseWorkspaceId.set(workspaceId);
    currentWorkspace.set({ id: 'workspace-2' });
    fixture.detectChanges();

    expect(host.querySelector('[data-data-table-loading]')).not.toBeNull();
    expect(host.textContent).not.toContain('Keine Einkäufe vorhanden');
    expect(host.textContent).not.toContain('Keine passenden Einkäufe');
    expect(host.querySelector('[data-create-first-purchase]')).toBeNull();
    expect(host.querySelector('[data-purchase-table-row]')).toBeNull();
  });

  it.each([
    { context: 'beim ersten Laden', activeWorkspaceId: workspaceId },
    { context: 'nach einem Workspacewechsel', activeWorkspaceId: 'workspace-2' },
  ])(
    'zeigt $context den Ladefehler und erlaubt einen erneuten Versuch',
    ({ activeWorkspaceId }) => {
      if (activeWorkspaceId === workspaceId) {
        purchaseState.set([]);
        loadedPurchaseWorkspaceId.set(null);
        purchaseLoading.set(true);
      }
      const fixture = TestBed.createComponent(PurchasesComponent);
      fixture.detectChanges();
      currentWorkspace.set({ id: activeWorkspaceId });
      purchaseState.set([]);
      loadedPurchaseWorkspaceId.set(null);
      purchaseLoading.set(true);
      purchaseLoadError.set(new Error('Einkäufe konnten nicht geladen werden.'));
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-data-table-loading]')).not.toBeNull();
      expect(host.querySelector('[data-data-table-error]')).toBeNull();
      expect(host.querySelector('[data-data-table-empty]')).toBeNull();

      purchaseLoading.set(false);
      fixture.detectChanges();

      expect(fixture.componentInstance.isPurchaseListLoading()).toBe(false);
      expect(host.querySelector('[data-data-table-loading]')).toBeNull();
      expect(host.querySelector('[data-data-table-error][role="alert"]')?.textContent).toContain(
        'Einkäufe konnten nicht geladen werden.',
      );
      expect(host.querySelector('[data-data-table-empty]')).toBeNull();
      expect(host.querySelector('[data-purchase-table-row]')).toBeNull();
      const retry = host.querySelector<HTMLButtonElement>('[table-error-action] button');
      expect(retry?.textContent?.trim()).toBe('Erneut versuchen');

      retry?.click();
      fixture.detectChanges();

      expect(loadPurchases).toHaveBeenCalledExactlyOnceWith(activeWorkspaceId);
      expect(host.querySelector('[data-data-table-loading]')).not.toBeNull();
      expect(host.querySelector('[data-data-table-error]')).toBeNull();
      expect(host.querySelector('[data-data-table-empty]')).toBeNull();
    },
  );

  it('begrenzt lange Beschreibungen auf eine Zeile und hält den Volltext bereit', () => {
    const longText = 'Sehr lange Beschreibung '.repeat(20).trim();
    purchaseState.set([{ ...purchases[0], notes: longText, title: longText }]);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const description = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-purchase-description] span',
    );

    expect(description).not.toBeNull();
    expect(description?.classList).toContain('truncate');
    expect(description?.getAttribute('title')).toBe(longText);
    expect(description?.textContent?.trim()).toBe(longText);
  });

  it('bietet bei ausschließlich archivierten Einkäufen direkt das Archiv an', () => {
    purchaseState.set(purchases.map((purchase) => ({ ...purchase, receiving_status: 'archived' })));
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const showArchive = fixture.debugElement.query(By.css('[data-show-purchase-archive]'));

    expect(host.querySelectorAll('[data-purchase-table-row]')).toHaveLength(0);
    expect(showArchive).not.toBeNull();

    showArchive.triggerEventHandler('clicked', new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeStatus()).toBe('archived');
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

  it('zeigt Verkäuferfilter ohne technische ID und behält die ID intern für die Auswahl', () => {
    purchaseState.set([
      {
        ...purchases[0],
        supplier_id: 'seller-12CEAF',
        supplier: {
          id: 'seller-12CEAF',
          workspace_id: workspaceId,
          name: 'Mein Verkäufer',
        },
      },
    ]);
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    const sellerSelect = host.querySelector<HTMLElement>('app-custom-select[table-filters]');
    const trigger = sellerSelect?.querySelector<HTMLButtonElement>('button[role="combobox"]');

    expect(component.sellerSelectOptions()).toEqual([
      { value: '', label: 'Nach Verkäufer filtern' },
      { value: 'seller-12CEAF', label: 'Mein Verkäufer' },
    ]);
    expect(trigger?.getAttribute('aria-label')).toBe('Nach Verkäufer filtern');
    expect(trigger?.textContent).toContain('Nach Verkäufer filtern');

    component.sellerId.set('seller-12CEAF');
    fixture.detectChanges();

    expect(trigger?.textContent).toContain('Mein Verkäufer');
    expect(trigger?.textContent).not.toContain('12CEAF');
    const activeFilter = host.querySelector<HTMLElement>('[table-filter-panel]');
    expect(activeFilter?.textContent?.trim()).toBe('Filter aktiv');
    expect(activeFilter?.querySelector('button')).toBeNull();
    expect(activeFilter?.querySelector('app-badge > span')?.classList).toContain(
      'bg-fb-badge-warning',
    );
    expect(component.purchaseRows()).toHaveLength(1);

    component.sellerId.set('');
    fixture.detectChanges();
    expect(host.querySelector('[table-filter-panel]')).toBeNull();
  });

  it('zeigt den Filterhinweis für Status und Suche, aber nicht für reine Tabellenanpassungen', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[table-filter-panel]')).toBeNull();

    component.activeStatus.set('draft');
    fixture.detectChanges();
    expect(host.querySelector('[table-filter-panel]')?.textContent?.trim()).toBe('Filter aktiv');

    component.activeStatus.set('all');
    fixture.detectChanges();
    expect(host.querySelector('[table-filter-panel]')).toBeNull();

    component.searchQuery.set('Tasse');
    fixture.detectChanges();
    expect(host.querySelector('[table-filter-panel]')?.textContent?.trim()).toBe('Filter aktiv');

    component.searchQuery.set('  ');
    component.onSortChanged({ field: 'title', direction: 'asc' });
    fixture.detectChanges();
    expect(component.viewModified()).toBe(true);
    expect(host.querySelector('[table-filter-panel]')).toBeNull();
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

  it('besteht für die Einkaufsliste und die geöffnete Artikelvorschau den strukturellen AXE-Check', async () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const list = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-purchase-list]',
    ) as HTMLElement;

    const result = await axe.run(list, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);

    list.querySelector<HTMLButtonElement>('app-purchase-receipt-preview button')?.click();
    fixture.detectChanges();
    const openedResult = await axe.run(list, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(openedResult.violations).toEqual([]);
  });
});
