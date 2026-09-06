import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem, Purchase } from '../../core/models/flipbase.models';
import { InventoryService } from '../../core/services/inventory.service';
import { InboundTrackingService } from '../../core/services/inbound-tracking.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { StockService } from '../../core/services/stock.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PurchasesComponent } from './purchases.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';

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

const workspaceId = 'workspace-1';

const purchases: Purchase[] = [
  {
    id: 'purchase-normal',
    workspace_id: workspaceId,
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
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      PurchasesComponent,
      PageHeaderComponent,
      TableColumnMenuComponent,
      TableSortHeaderComponent,
    ],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'de' }),
      {
        provide: PurchaseService,
        useValue: { purchases: signal(purchases) },
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
        provide: OfflineSyncService,
        useValue: {
          cashWallet: signal({ startCash: 0, currentCash: 0, locationName: '' }),
          pendingCount: signal(0),
          pendingEntries: signal([]),
          potentialProfitEstimate: signal(0),
          isOnline: signal(true),
          isSyncing: signal(false),
        },
      },
      {
        provide: InboundTrackingService,
        useValue: { getTrackingInfo: vi.fn(), statusConfig: {} },
      },
    ],
  });
});

describe('PurchasesComponent – responsive Einkaufsübersicht', () => {
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
    expect(normalRow?.textContent).toContain('Erfassung abgeschlossen');
    expect(normalRow?.textContent).toContain('1 verfügbar');
    expect(mysteryRow?.textContent).toContain('Inhalt erfassen');
    expect(mysteryRow?.textContent).toContain('Kosten noch offen');
  });

  it('zeigt offene Kostenverteilung als eigenes Badge', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const mystery = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-purchase-row="purchase-mystery"]')
      ?.closest('tr');

    expect(mystery?.querySelector('[data-allocation-open]')?.textContent).toContain(
      'Kostenaufteilung offen',
    );
  });

  it('behält Suche und Rücksetzung bei einer Suche ohne Treffer sichtbar', () => {
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    fixture.componentInstance.searchQuery.set('zzznichtvorhanden');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('input[type="search"]');
    const reset = host.querySelector<HTMLButtonElement>('[data-reset-purchase-view]');

    expect(search).not.toBeNull();
    expect(search?.value).toBe('zzznichtvorhanden');
    expect(host.textContent).toContain('Keine passenden Einkäufe');

    reset?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.searchQuery()).toBe('');
    expect(host.querySelectorAll('[data-purchase-table-row]')).toHaveLength(2);
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
