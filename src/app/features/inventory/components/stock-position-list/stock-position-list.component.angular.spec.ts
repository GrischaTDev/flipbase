import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideRouter } from '@angular/router';
import localeDe from '@angular/common/locales/de';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InventoryItem,
  ItemStatus,
  Purchase,
  Sale,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { INVENTORY_TABLE_CONFIG } from '../../../../core/config/table-defaults.config';
import { StockPositionListComponent } from './stock-position-list.component';
import { ProductThumbnailComponent } from '../../../../shared/components/product-thumbnail/product-thumbnail.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import { TableSortHeaderComponent } from '../../../../shared/components/table-sort-header/table-sort-header.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
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
}

beforeAll(async () => {
  registerLocaleData(localeDe);
  const resources: Record<string, string> = {
    './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
    './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
    './button.component.html': 'src/app/shared/components/button/button.component.html',
    './button.component.scss': 'src/app/shared/components/button/button.component.scss',
    './table-action-button.component.html':
      'src/app/shared/components/table-action-button/table-action-button.component.html',
    './product-thumbnail.component.html':
      'src/app/shared/components/product-thumbnail/product-thumbnail.component.html',
    './stock-position-list.component.html':
      'src/app/features/inventory/components/stock-position-list/stock-position-list.component.html',
    './cost-state.component.html': 'src/app/shared/components/cost-state/cost-state.component.html',
    './custom-select.component.html':
      'src/app/shared/components/custom-select/custom-select.component.html',
    './custom-select.component.scss':
      'src/app/shared/components/custom-select/custom-select.component.scss',
    './custom-checkbox.component.html':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.html',
    './custom-checkbox.component.scss':
      'src/app/shared/components/custom-checkbox/custom-checkbox.component.scss',
    './table-sort-header.component.html':
      'src/app/shared/components/table-sort-header/table-sort-header.component.html',
  };
  await ɵresolveComponentResources((url) => {
    const resource = resources[url];
    if (!resource) throw new Error(`Unbekannte Test-Ressource: ${url}`);
    return readFile(resolve(resource), 'utf8');
  });
  registerSignalInputs(BadgeComponent, ['tone', 'size', 'mono']);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'tone',
    'size',
    'icon',
    'iconPosition',
    'iconOnly',
    'fullWidth',
    'type',
    'link',
    'href',
    'target',
    'queryParams',
    'ariaLabel',
    'title',
    'ariaExpanded',
    'ariaPressed',
    'ariaControls',
    'ariaHaspopup',
    'loading',
    'disabled',
  ]);
  registerSignalInputs(TableActionButtonComponent, [
    'icon',
    'label',
    'tone',
    'disabled',
    'loading',
    'link',
    'href',
    'queryParams',
  ]);
  const tableActionMetadata = (
    TableActionButtonComponent as unknown as {
      ɵcmp: { outputs: Record<string, string> };
    }
  ).ɵcmp;
  tableActionMetadata.outputs = { ...tableActionMetadata.outputs, clicked: 'clicked' };
  registerSignalInputs(ProductThumbnailComponent, ['src', 'alt', 'size']);
  registerSignalInputs(CustomSelectComponent, [
    'options',
    'value',
    'placeholder',
    'variant',
    'size',
    'disabled',
    'widthClass',
    'openDirection',
    'ariaLabel',
    'triggerId',
  ]);
  registerSignalInputs(CustomCheckboxComponent, [
    'checked',
    'indeterminate',
    'label',
    'disabled',
    'size',
    'color',
    'ariaLabel',
    'id',
  ]);
  registerSignalInputs(CostStateComponent, ['state']);
  registerSignalInputs(TableSortHeaderComponent, [
    'label',
    'sortField',
    'currentSort',
    'description',
  ]);
  const buttonMetadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  buttonMetadata.outputs = { ...buttonMetadata.outputs, clicked: 'clicked' };
  const checkboxMetadata = (CustomCheckboxComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  checkboxMetadata.outputs = { ...checkboxMetadata.outputs, checkedChange: 'checked' };
});
afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
});
beforeEach(async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      StockPositionListComponent,
      CustomSelectComponent,
      CostStateComponent,
      TableSortHeaderComponent,
    ],
    providers: [provideRouter([])],
  });
  await TestBed.compileComponents();
});

function createList(
  positions: readonly StockPosition[],
  individualItems: readonly InventoryItem[] = [],
  lots: readonly StockLot[] = [],
  movements: readonly StockMovement[] = [],
  purchases: readonly Purchase[] = [],
  sales: readonly Sale[] = [],
  sourceOverrides: {
    readonly purchaseState?: 'known' | 'loading' | 'error';
    readonly compact?: boolean;
  } = {},
) {
  const fixture = TestBed.createComponent(StockPositionListComponent);

  Object.assign(fixture.componentInstance, {
    visibleColumns: signal(INVENTORY_TABLE_CONFIG.defaultColumns.map((column) => column.id)),
    tableColumns: signal(sourceOverrides.compact ? INVENTORY_TABLE_CONFIG.defaultColumns : []),
    positions: signal(positions),
    individualItems: signal(individualItems),
    lots: signal(lots),
    movements: signal(movements),
    purchases: signal(purchases),
    sales: signal(sales),
    purchaseState: signal(sourceOverrides.purchaseState ?? 'known'),
    workspaceId: signal('workspace-1'),
    selectedItemIds: signal<ReadonlySet<string>>(new Set()),
  });
  fixture.detectChanges();
  return fixture;
}

const ledLampe: StockPosition = {
  catalog_product_id: 'catalog-led-lamp',
  title: 'LED Schreibtischlampe',
  available_quantity: 3,
  reserved_quantity: 0,
  on_hand_quantity: 3,
  oldest_available_unit_cost: 4.5,
  is_public_store: true,
};

const einzelstueck: InventoryItem = {
  id: 'inventory-mystery-1',
  workspace_id: 'workspace-1',
  title: 'Mystery-Fundstück',
  condition: 'used',
  status: 'ready',
  sale_state: 'no_active_sale',
  allocated_purchase_cost: 12,
  total_item_cost: 12,
  is_public_store: false,
};

const lot = (id: string, receivedAt: string, unitCost: number): StockLot => ({
  id,
  workspace_id: 'workspace-1',
  purchase_id: `purchase-${id}`,
  purchase_line_id: `line-${id}`,
  catalog_product_id: ledLampe.catalog_product_id,
  received_quantity: 1,
  remaining_quantity: 1,
  unit_cost: unitCost,
  received_at: receivedAt,
});

const finalizedPurchase = (id: string): Purchase => ({
  id,
  workspace_id: 'workspace-1',
  type: 'single',
  title: `Einkauf ${id}`,
  purchase_date: '2026-08-01',
  purchase_price: 10,
  cost_allocation_mode: 'manual',
  entry_status: 'finalized',
  finalized_at: '2026-08-01T08:00:00.000Z',
});

describe('StockPositionListComponent', () => {
  it('zeigt kompakte Standardspalten mit echten Detail-Links und aufklappbaren Fachangaben', () => {
    const fixture = createList([ledLampe], [einzelstueck], [], [], [], [], { compact: true });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(Array.from(host.querySelectorAll('th')).map((cell) => cell.textContent?.trim())).toEqual(
      ['Auswahl', 'Artikel', 'Auf Lager', 'Verfügbar', 'Reserviert', 'Aktionen'],
    );
    expect(host.querySelector('[data-catalog-stock-link]')?.getAttribute('href')).toBe(
      '/catalog/catalog-led-lamp?view=stock',
    );
    expect(host.querySelector('[data-item-details]')?.getAttribute('href')).toBe(
      '/inventory/inventory-mystery-1',
    );
    expect(host.textContent).not.toContain('Kosten pro Stück');
    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-stock-origin-toggle="inventory-mystery-1"] button',
    )!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#stock-origins-inventory-mystery-1')?.textContent).toContain(
      'Kosten pro Stück',
    );
    expect(
      host.querySelector('#stock-origins-inventory-mystery-1 [data-item-status]'),
    ).not.toBeNull();
    toggle.click();
    fixture.detectChanges();
    expect(host.querySelector('#stock-origins-inventory-mystery-1')).toBeNull();
  });

  it('hält einen Konflikt auch ohne Statusspalte sichtbar und zeigt keine Nullmengen', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, sale_state: 'sale_status_conflict' }],
      [],
      [],
      [],
      [],
      { compact: true },
    );
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;
    expect(row.textContent).toContain('Prüfung erforderlich');
    const quantities = [...row.querySelectorAll('[data-stock-quantity]')];
    expect(quantities.map((cell) => cell.textContent?.trim())).toEqual(['—', '—', '—']);
    expect(
      quantities.every((cell) => cell.querySelector('[aria-label="Bestand muss geklärt werden"]')),
    ).toBe(true);
    expect(row.querySelector('[data-item-sell]')).toBeNull();
  });

  it('beschriftet verkaufte Stücke mit null auf Lager statt historisch einem Stück', () => {
    const fixture = createList([], [{ ...einzelstueck, status: 'sold', sale_state: 'sold' }]);
    expect(
      fixture.nativeElement.querySelector('[data-stock-quantity="quantity"]')?.textContent.trim(),
    ).toBe('0');
    expect(fixture.componentInstance.rows()[0].quantity.total).toBe(1);
  });

  it('besteht AXE mit kompakter Konfliktansicht und geöffneten Details', async () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, sale_state: 'legacy_sold_unverified', status: 'sold' }],
      [],
      [],
      [],
      [],
      { compact: true },
    );
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-stock-origin-toggle] button')
      ?.click();
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('zeigt Mengenposition fünf und Einzelstück eins in derselben Inventartabelle', () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 5, on_hand_quantity: 5 }],
      [einzelstueck],
    );
    const table = fixture.nativeElement.querySelector('[data-unified-inventory-table]');

    expect(table).not.toBeNull();
    expect(
      table.querySelector('[data-stock-row] [data-stock-quantity="quantity"]')?.textContent.trim(),
    ).toBe('5');
    expect(
      table
        .querySelector('[data-individual-row] [data-stock-quantity="quantity"]')
        ?.textContent.trim(),
    ).toBe('1');
    expect(table.textContent).not.toContain('Einzelstück');
    expect(table.textContent).not.toContain('Mengenposition');
    expect(
      Array.from((table as HTMLElement).querySelectorAll('th')).map((cell) =>
        cell.textContent?.trim(),
      ),
    ).not.toContain('Art');
  });

  it('zeigt aggregierte Stückzahlen statt der Anzahl von Datenzeilen', () => {
    const fixture = createList(
      [
        ledLampe,
        {
          ...ledLampe,
          available_quantity: 5,
          on_hand_quantity: 5,
          oldest_available_unit_cost: 5.2,
        },
      ],
      [einzelstueck],
    );

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-unified-inventory-table] [data-stock-row]'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('LED Schreibtischlampe');
    expect(rows[0].querySelector('[data-stock-quantity="quantity"]')?.textContent?.trim()).toBe(
      '8',
    );
    expect(rows[0].querySelector('[data-stock-quantity="available"]')?.textContent?.trim()).toBe(
      '8',
    );
  });

  it('erhält Details, Verkauf, Auswahl, Etiketten, Store und Status für Einzelstücke', () => {
    const fixture = createList([], [einzelstueck]);

    const host = fixture.nativeElement as HTMLElement;
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>('[data-unified-inventory-table] [data-individual-row]'),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Mystery-Fundstück');
    expect(rows[0].querySelector('[data-stock-quantity="quantity"]')?.textContent?.trim()).toBe(
      '1',
    );
    expect(rows[0].querySelector('[data-stock-quantity="available"]')?.textContent?.trim()).toBe(
      '1',
    );
    expect(rows[0].querySelector('[data-item-details]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-select]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-label]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-store-toggle]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-status]')).not.toBeNull();
    expect(rows[0].querySelector('[data-item-sell]')).not.toBeNull();
  });

  it('zeigt bei mehreren Losen den gewichteten aktuellen Stückwert', () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 2, on_hand_quantity: 2, oldest_available_unit_cost: 5 }],
      [],
      [lot('old', '2026-08-01T09:00:00.000Z', 10), lot('new', '2026-08-20T09:00:00.000Z', 5)],
      [],
      [finalizedPurchase('purchase-old'), finalizedPurchase('purchase-new')],
    );

    if (import.meta.url.includes('/out-tsc/')) {
      expect(fixture.nativeElement.querySelector('[data-stock-row]')?.textContent).toContain(
        '7,50 €',
      );
    } else {
      // Der Source-Vitest-Lauf kompiliert verschachtelte Signal-Inputs nicht;
      // der echte AOT-Lauf oberhalb prüft deshalb zusätzlich die DOM-Bindung.
      expect(fixture.componentInstance.rows()[0].costPerUnit).toEqual({
        kind: 'known',
        amount: 7.5,
      });
    }
  });

  it('zeigt die Herkunft mit einem Link zum zugehörigen Einkauf', () => {
    const fixture = createList(
      [ledLampe],
      [],
      [lot('old', '2026-08-01T09:00:00.000Z', 10)],
      [],
      [finalizedPurchase('purchase-old')],
    );

    const toggle = fixture.nativeElement.querySelector(
      '[data-stock-origin-toggle="catalog-led-lamp"] button',
    );

    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Details');
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toMatch(/\bLose\b/);
    toggle.click();
    fixture.detectChanges();
    if (import.meta.url.includes('/out-tsc/')) {
      expect(
        fixture.nativeElement.querySelector('[data-stock-origin="old"]')?.textContent,
      ).toContain('10,00 €');
    } else {
      expect(fixture.componentInstance.rows()[0].lots[0].costPerUnit).toEqual({
        kind: 'known',
        amount: 10,
      });
    }
    const originLink = fixture.nativeElement.querySelector(
      '[data-inventory-origin-link]',
    ) as HTMLAnchorElement;
    expect(originLink.textContent).toContain('Einkauf purchase-old');
    expect(originLink.getAttribute('href')).toBe('/purchases/purchase-old');
  });

  it('zeigt auch in der Herkunftsaufschlüsselung vorläufige Nullkosten als offen', () => {
    const draftPurchase: Purchase = {
      ...finalizedPurchase('purchase-draft'),
      entry_status: 'capturing',
      finalized_at: undefined,
    };
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 1, on_hand_quantity: 1 }],
      [],
      [lot('draft', '2026-08-01T09:00:00.000Z', 0)],
      [],
      [draftPurchase],
    );

    const toggle = fixture.nativeElement.querySelector(
      '[data-stock-origin-toggle="catalog-led-lamp"] button',
    ) as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    const breakdown = fixture.nativeElement.querySelector(
      '[data-stock-origin="draft"]',
    ) as HTMLElement;

    if (import.meta.url.includes('/out-tsc/')) {
      expect(breakdown.textContent).toContain('Kosten noch offen');
      expect(breakdown.textContent).not.toContain('0,00');
    } else {
      expect(fixture.componentInstance.rows()[0].lots[0].costPerUnit).toEqual({ kind: 'open' });
    }
  });

  it('zeigt einen gebuchten Verkauf fest als verkauft und niemals als leere Statusauswahl', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'sold', active_sale_count: 1 }],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    const badge = row.querySelector('[data-sold-badge]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Verkauft');
    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.textContent).not.toContain('Status bitte wählen');
    expect(row.querySelector('[data-item-sell]')).toBeNull();
    expect(badge?.tagName).toBe('APP-BADGE');
  });

  it('zeigt Zustände deutsch und verwendet für veränderbare Status ausschließlich die gemeinsame Auswahl', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, condition: 'like_new', status: 'needs_review' }],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;
    const statusSelect = fixture.debugElement.query(By.directive(CustomSelectComponent))
      .componentInstance as CustomSelectComponent<ItemStatus>;

    expect(row.textContent).toContain('Wie neu');
    expect(row.textContent).not.toContain('like_new');
    expect(row.querySelector('app-custom-select')).not.toBeNull();
    expect(row.querySelector('select')).toBeNull();
    if (import.meta.url.includes('/out-tsc/')) {
      expect(statusSelect.value()).toBe('needs_review');
    } else {
      expect(fixture.componentInstance.rows()[0].status).toMatchObject({
        kind: 'editable',
        value: 'needs_review',
      });
    }
    expect(fixture.componentInstance.statusOptions.map((option) => option.value)).toContain(
      'researched',
    );
  });

  it.each([
    ['loading', 'Herkunft wird geladen'],
    ['error', 'Herkunft nicht verfügbar'],
  ] as const)('zeigt die Herkunft bei %s nicht als nicht verknüpft', (state, text) => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, purchase_id: 'missing-purchase' }],
      [],
      [],
      [],
      [],
      { purchaseState: state },
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.textContent).toContain(text);
    expect(row.textContent).not.toContain('Nicht verknüpft');
  });

  it('zeigt unbekannte vorläufige Kosten als offen statt als Nullbetrag', () => {
    const fixture = createList(
      [],
      [
        {
          ...einzelstueck,
          purchase: {
            ...({} as InventoryItem['purchase']),
            id: 'draft',
            workspace_id: 'workspace-1',
            type: 'single',
            title: 'Entwurf',
            purchase_date: '2026-08-01',
            purchase_price: null,
            cost_allocation_mode: 'manual',
            entry_status: 'draft',
          },
          allocated_purchase_cost: 0,
          total_item_cost: 0,
        },
      ],
    );

    expect(fixture.nativeElement.querySelector('[data-individual-row]')?.textContent).toContain(
      'Kosten noch offen',
    );
  });

  it('zeigt einen Mehrfachverkauf als Integritätskonflikt vor dem sold-Fallback', () => {
    const fixture = createList(
      [],
      [
        {
          ...einzelstueck,
          status: 'sold',
          sale_state: 'multiple_active_sales',
          active_sale_count: 2,
        },
      ],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.querySelector('[data-integrity-conflict]')?.textContent).toContain(
      'Prüfung erforderlich',
    );
    expect(row.querySelector('[data-sold-badge]')).toBeNull();
    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.querySelector('[data-item-store-toggle]')).toBeNull();
    expect(row.querySelector('[data-item-sell]')).toBeNull();
    expect(row.textContent).not.toContain('0 verfügbar');
    expect(row.textContent).not.toContain('0 reserviert');
    expect(row.textContent).not.toContain('0 verkauft');
  });

  it.each([
    ['sold', 'sold'],
    ['legacy sold', 'legacy_sold_unverified'],
    ['header without line', 'legacy_sale_header_without_line'],
    ['status conflict', 'sale_status_conflict'],
    ['multiple sales', 'multiple_active_sales'],
  ] as const)('blendet direkte Mutationen für %s aus', (_label, saleState) => {
    const fixture = createList([], [{ ...einzelstueck, status: 'sold', sale_state: saleState }]);
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.querySelector('[data-item-status]')).toBeNull();
    expect(row.querySelector('[data-item-store-toggle]')).toBeNull();
    expect(row.querySelector('[data-item-sell]')).toBeNull();
  });

  it('bietet bei ungeklärtem Verkauf beide Klärungswege ohne manuelle Grundangabe an', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'legacy_sold_unverified' }],
    );
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector('[data-individual-row]') as HTMLElement;
    const restoreLegacy = vi.fn();
    fixture.componentInstance.restoreLegacy.subscribe(restoreLegacy);

    expect(row.textContent).toContain('Verkaufsstatus klären');
    expect(row.textContent).toContain('Artikel ist noch vorhanden');
    expect(row.querySelector('[data-reconcile-sale]')?.textContent).toContain('Verkauf nachtragen');
    expect(row.textContent).not.toContain('Altdaten prüfen');
    expect(row.textContent).not.toContain('Prüfgrund');
    expect(host.querySelector('input[id*="legacy-reason"]')).toBeNull();

    row.querySelector<HTMLElement>('[data-restore-stock]')?.click();

    expect(restoreLegacy).toHaveBeenCalledWith({
      ...einzelstueck,
      status: 'sold',
      sale_state: 'legacy_sold_unverified',
    });
  });

  it('zeigt beim Legacy-Verkaufskopf nur Korrektur erforderlich und keinen neuen Verkauf', () => {
    const fixture = createList(
      [],
      [{ ...einzelstueck, status: 'sold', sale_state: 'legacy_sale_header_without_line' }],
    );
    const row = fixture.nativeElement.querySelector('[data-individual-row]') as HTMLElement;

    expect(row.textContent).toContain('Korrektur erforderlich');
    expect(row.querySelector('[data-item-sell]')).toBeNull();
    expect(row.querySelector('[data-restore-stock]')).toBeNull();
    expect(row.querySelector('[data-reconcile-sale]')).toBeNull();
  });

  it('gibt die vollständigen Einzelstückaktionen als typisierte Ereignisse aus', () => {
    const fixture = createList([], [einzelstueck]);
    const selectionChanged = vi.fn();
    const storeToggle = vi.fn();
    const statusChange = vi.fn();
    const sellIndividual = vi.fn();
    expect(fixture.componentInstance.selectionChanged).toBeDefined();
    expect(fixture.componentInstance.storeToggle).toBeDefined();
    expect(fixture.componentInstance.statusChange).toBeDefined();
    expect(fixture.componentInstance.sellIndividual).toBeDefined();
    fixture.componentInstance.selectionChanged.subscribe(selectionChanged);
    fixture.componentInstance.storeToggle.subscribe(storeToggle);
    fixture.componentInstance.statusChange.subscribe(statusChange);
    fixture.componentInstance.sellIndividual.subscribe(sellIndividual);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-item-select] [role="checkbox"]')
      ?.click();
    fixture.nativeElement.querySelector('[data-item-store-toggle] button')?.click();
    fixture.nativeElement.querySelector('[data-item-sell] button')?.click();
    fixture.detectChanges();

    expect(selectionChanged).toHaveBeenCalledWith(einzelstueck.id);
    expect(storeToggle).toHaveBeenCalledWith(einzelstueck);
    expect(sellIndividual).toHaveBeenCalledWith(einzelstueck);
    expect(statusChange).not.toHaveBeenCalled();
  });

  it('besteht den strukturellen AXE-Check; Farbkontrast bleibt im DOM-Test ungeprüft', async () => {
    const fixture = createList(
      [{ ...ledLampe, available_quantity: 5, on_hand_quantity: 5 }],
      [einzelstueck],
      [lot('old', '2026-08-01T09:00:00.000Z', 10)],
    );

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('zeigt die vollständige Bewegungshistorie auch für ein ausverkauftes Los zugänglich an', () => {
    const soldLot = {
      ...lot('sold', '2026-08-01T09:00:00.000Z', 10),
      remaining_quantity: 0,
      catalog_product: {
        id: ledLampe.catalog_product_id,
        title: ledLampe.title,
        is_public_store: true,
      },
    };
    const movements: StockMovement[] = [
      {
        id: 'movement-receipt',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        direction: 'in',
        quantity: 2,
        reason: 'receipt',
        created_at: '2026-08-01T09:00:00.000Z',
      },
      {
        id: 'movement-sale',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'out',
        quantity: 2,
        reason: 'sale',
        created_at: '2026-08-20T09:00:00.000Z',
      },
      {
        id: 'movement-correction',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        direction: 'in',
        quantity: 1,
        reason: 'correction',
        created_at: '2026-08-21T09:00:00.000Z',
      },
      {
        id: 'movement-return',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        sale_line_id: 'sale-line-1',
        direction: 'in',
        quantity: 1,
        reason: 'return',
        created_at: '2026-08-22T09:00:00.000Z',
      },
      {
        id: 'movement-loss',
        workspace_id: 'workspace-1',
        stock_lot_id: soldLot.id,
        direction: 'out',
        quantity: 1,
        reason: 'loss',
        created_at: '2026-08-23T09:00:00.000Z',
      },
    ];
    const fixture = createList([], [], [soldLot], movements);
    fixture.componentInstance.showMovements.set(true);
    fixture.detectChanges();
    const history = fixture.nativeElement.querySelector('[data-stock-movement-history]');

    expect(history).not.toBeNull();
    expect(history.getAttribute('aria-labelledby')).toBe('stock-movement-history-title');
    expect(history.textContent).toContain('LED Schreibtischlampe');
    expect(history.textContent).toContain('Wareneingang');
    expect(history.textContent).toContain('Verkauf');
    expect(history.textContent).toContain('Korrektur');
    expect(history.textContent).toContain('Rückgabe');
    expect(history.textContent).toContain('Verlust');
    expect(history.querySelector('caption')?.textContent).toContain(
      'vollständige Bewegungshistorie',
    );
    expect(history.querySelector('caption')?.textContent).not.toContain('Lose');
  });
});
