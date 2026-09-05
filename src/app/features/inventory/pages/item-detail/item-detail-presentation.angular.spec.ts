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
import type { InventoryItem, Sale } from '../../../../core/models/flipbase.models';
import { InventoryService } from '../../../../core/services/inventory.service';
import { MediaService } from '../../../../core/services/media.service';
import { SalesService } from '../../../../core/services/sales.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { BusinessEventService } from '../../../../core/services/business-event.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { CostStateComponent } from '../../../../shared/components/cost-state/cost-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { RecordHistoryContainer } from '../../../audit/components/record-history/record-history.container';
import { RecordHistoryComponent } from '../../../../shared/components/record-history/record-history.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ItemDetailComponent } from './item-detail.component';

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

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
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
  registerSignalInputs(CostStateComponent, ['state']);
  registerSignalInputs(RecordHistoryContainer, ['entityType', 'entityId', 'heading']);
  registerSignalInputs(RecordHistoryComponent, [
    'heading',
    'events',
    'loading',
    'error',
    'hasMore',
  ]);
  registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'backLink', 'backLabel']);
  registerSignalInputs(TwoColumnLayoutComponent, ['ratio']);
  registerSignalInputs(CardComponent, ['title', 'subtitle', 'variant', 'padding', 'rounded']);
  registerSignalInputs(BadgeComponent, [
    'tone',
    'size',
    'dot',
    'pulse',
    'icon',
    'mono',
    'uppercase',
  ]);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

const workspace = { id: 'workspace-1' };
const item: InventoryItem = {
  id: 'item-sold',
  workspace_id: workspace.id,
  purchase_id: 'purchase-1',
  title: 'Verkaufte Tasse',
  condition: 'like_new',
  status: 'sold',
  sale_state: 'sold',
  active_sale_id: 'sale-active',
  active_sale_count: 1,
  allocated_purchase_cost: 10,
  total_item_cost: 12,
  is_public_store: false,
  purchase: {
    id: 'purchase-1',
    workspace_id: workspace.id,
    type: 'mystery_pack',
    title: 'Mystery Box August',
    purchase_date: '2026-08-01',
    purchase_price: 100,
    cost_allocation_mode: 'even',
    entry_status: 'finalized',
    finalized_at: '2026-08-02T10:00:00.000Z',
  },
};

const sale = (id: string, state: 'active' | 'returned' | 'voided'): Sale => ({
  id,
  workspace_id: workspace.id,
  platform: 'ebay',
  sale_price: 42,
  sale_price_total: 42,
  sale_date: '2026-08-20',
  platform_fee: 5,
  shipping_cost: 2,
  packaging_cost: 0,
  other_costs: 0,
  net_profit: 23,
  returned_at: state === 'returned' ? '2026-08-21T10:00:00.000Z' : null,
  voided_at: state === 'voided' ? '2026-08-22T10:00:00.000Z' : null,
  has_persisted_lines: true,
  lines: [
    {
      id: `line-${id}`,
      sale_id: id,
      inventory_item_id: item.id,
      title_snapshot: item.title,
      quantity: 1,
      unit_sale_price: 42,
      line_total: 42,
      cost_of_goods_sold: 12,
      tax_mode: 'diff_25a',
    },
  ],
});

beforeEach(async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ItemDetailComponent, CostStateComponent, CustomSelectComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'de' }),
      {
        provide: InventoryService,
        useValue: {
          selectedItem: signal<InventoryItem | null>(item),
          itemCosts: signal([]),
          activityLogs: signal([]),
          getItemById: vi.fn(async () => item),
        },
      },
      { provide: MediaService, useValue: { loadItemMedia: vi.fn(async () => []) } },
      {
        provide: SalesService,
        useValue: {
          sales: signal([
            sale('sale-active', 'active'),
            sale('sale-returned', 'returned'),
            sale('sale-voided', 'voided'),
          ]),
          loadedWorkspaceId: signal(workspace.id),
          isLoading: signal(false),
          loadError: signal(null),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: signal(workspace) } },
      {
        provide: BusinessEventService,
        useValue: { listEntityEvents: vi.fn(() => new Promise(() => undefined)) },
      },
      { provide: ConfirmDialogService, useValue: { frage: vi.fn(async () => false) } },
      { provide: SyncStatusService, useValue: { istZentralGemeldet: () => false } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    ],
  });
  await TestBed.compileComponents();
});

describe('ItemDetailComponent – Inventardarstellung', () => {
  it('zeigt deutsche Zustände, echte Kosten, festen Sold-Status und alle Verkaufsbezüge', () => {
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Wie neu');
    expect(host.textContent).toContain('Kostenanteil');
    if (import.meta.url.includes('/out-tsc/')) {
      expect(host.textContent).toContain('12,00 €');
    } else {
      expect(fixture.componentInstance.detailPresentation()?.costPerUnit).toEqual({
        kind: 'known',
        amount: 12,
      });
    }
    expect(host.querySelector('[data-item-status-badge]')?.classList.contains('min-h-7')).toBe(
      true,
    );
    expect(host.querySelector('app-custom-select')).toBeNull();
    const saleLinks = host.querySelectorAll<HTMLAnchorElement>('[data-item-sale-link]');
    expect(saleLinks).toHaveLength(3);
    expect(Array.from(saleLinks).map((link) => link.getAttribute('href'))).toEqual([
      '/sales?saleId=sale-active',
      '/sales?saleId=sale-returned',
      '/sales?saleId=sale-voided',
    ]);
    expect(host.textContent).toContain('Retourniert');
    expect(host.textContent).toContain('Storniert');
    expect(host.querySelector('[data-sale-state="returned"]')?.textContent).toContain(
      'Historischer Verkaufsbetrag',
    );
    expect(host.querySelector('[data-sale-state="active"]')?.textContent).toContain('Ergebnis');
    expect(host.querySelector('[data-sale-state="returned"]')?.textContent).not.toContain(
      'Ergebnis',
    );
    expect(host.querySelector('[data-sale-state="voided"]')?.textContent).not.toContain('Ergebnis');
  });

  it('besteht den strukturellen AXE-Check', async () => {
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });

  it('blendet Bearbeiten, Löschen, Kosten und Medien bei fehlendem Verkaufszustand aus', () => {
    const inventoryService = TestBed.inject(InventoryService);
    inventoryService.selectedItem.set({
      ...item,
      status: 'ready',
      sale_state: undefined,
    });
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const buttonTexts = Array.from(host.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttonTexts).not.toContain('Bearbeiten');
    expect(host.querySelector('[title="Artikel löschen"]')).toBeNull();
    expect(buttonTexts).not.toContain('Kosten erfassen');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('verweist bei einem Mehrpositionsverkauf für das Ergebnis auf den Verkauf', () => {
    const salesService = TestBed.inject(SalesService);
    salesService.sales.set([
      {
        ...sale('sale-multi', 'active'),
        lines: [
          ...sale('sale-multi', 'active').lines!,
          {
            id: 'line-other',
            sale_id: 'sale-multi',
            inventory_item_id: 'item-other',
            title_snapshot: 'Anderer Artikel',
            quantity: 1,
            unit_sale_price: 20,
            line_total: 20,
            cost_of_goods_sold: 5,
            tax_mode: 'diff_25a',
          },
        ],
      },
    ]);
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();
    const activeSale = fixture.nativeElement.querySelector(
      '[data-sale-state="active"]',
    ) as HTMLElement;

    expect(activeSale.textContent).toContain('Ergebnis im Verkauf ansehen');
    expect(activeSale.textContent).not.toContain('23,00');
  });

  it('zeigt eine noch ladende Einkaufsverknüpfung nicht als fehlend an', () => {
    const inventoryService = TestBed.inject(InventoryService);
    inventoryService.selectedItem.set({ ...item, purchase: undefined });
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Herkunft wird geladen');
    expect(fixture.nativeElement.textContent).not.toContain('Kein Einkauf verknüpft');
  });

  it('übernimmt needs_review und researched in die Detail-Statusauswahl', () => {
    const inventoryService = TestBed.inject(InventoryService);
    inventoryService.selectedItem.set({
      ...item,
      status: 'needs_review',
      sale_state: 'no_active_sale',
    });
    const fixture = TestBed.createComponent(ItemDetailComponent);
    Object.assign(fixture.componentInstance, { id: signal(item.id) });
    fixture.detectChanges();

    expect(fixture.componentInstance.detailPresentation()?.status).toMatchObject({
      kind: 'editable',
      value: 'needs_review',
    });
    expect(fixture.componentInstance.statusOptions.map((option) => option.value)).toContain(
      'researched',
    );
  });
});
