import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingComponent } from './accounting.component';
import { TaxCalculationResult } from '../../core/models/flipbase.models';
import { TaxEngineService } from '../../core/services/tax-engine.service';
import { TaxAdvisorService } from '../../core/services/tax-advisor.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { SalesService } from '../../core/services/sales.service';
import { BankReconciliationService } from '../../core/services/bank-reconciliation.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { ACCOUNTING_TABLE_CONFIG } from '../../core/config/table-defaults.config';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../shared/components/button/button.component';

interface InputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}
const snapshots = new Map<unknown, InputMetadata>();
function registerInputs(component: unknown, names: string[]) {
  const metadata = (component as { ɵcmp: InputMetadata }).ɵcmp;
  snapshots.set(component, { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  registerLocaleData(localeDe);
  await ɵresolveComponentResources(async (url) => {
    const matches = [];
    for await (const path of glob(`src/app/**/${url.replace(/^\.\//, '')}`)) matches.push(path);
    if (matches.length !== 1) throw new Error(`Uneindeutige Ressource: ${url}`);
    return readFile(matches[0], 'utf8');
  });
  registerInputs(DataTableComponent, [
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
  registerInputs(ButtonComponent, [
    'variant',
    'size',
    'icon',
    'disabled',
    'ariaLabel',
    'ariaPressed',
  ]);
  registerInputs(CustomSelectComponent, [
    'options',
    'value',
    'variant',
    'widthClass',
    'ariaLabel',
    'size',
  ]);
  registerInputs(CustomSearchInputComponent, [
    'value',
    'placeholder',
    'ariaLabel',
    'variant',
    'size',
  ]);
  registerInputs(TableColumnMenuComponent, [
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
  ]);
  registerInputs(TableSortHeaderComponent, ['label', 'sortField', 'currentSort', 'description']);
  registerInputs(BadgeComponent, ['tone', 'marker', 'mono']);
});
afterAll(() => {
  TestBed.resetTestingModule();
  for (const [component, snapshot] of snapshots) {
    const metadata = (component as { ɵcmp: InputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

const complete: TaxCalculationResult = {
  calculation_status: 'complete',
  tax_purchase_cost: 100,
  tax_margin: 20,
  sale_id: 'sale-1',
  item_title: 'Artikel A',
  sale_date: '2026-08-20',
  tax_mode: 'diff_25a',
  gross_revenue: 120,
  shipping_revenue: 0,
  shipping_cost: 0,
  total_purchase_cost: 110,
  gross_margin: 10,
  tax_base: 16.81,
  vat_amount: 3.19,
  input_tax_deductible: 0,
  net_tax_liability: 3.19,
  net_profit_after_tax: 6.81,
  invoice_clause: '§ 25a',
};

describe('Steuerjournal – ungeklärte Kosten', () => {
  const results = signal<TaxCalculationResult[]>([]);
  beforeEach(() => {
    TestBed.resetTestingModule();
    results.set([]);
    TestBed.configureTestingModule({
      imports: [AccountingComponent],
      providers: [
        {
          provide: TaxEngineService,
          useValue: {
            allTaxCalculations: results,
            summarizePeriod: () => ({
              gross_revenue: 120,
              total_cost_of_goods_sold: 0,
              total_gross_margin: 0,
              total_vat_due: 0,
            }),
          },
        },
        {
          provide: TaxAdvisorService,
          useValue: {
            advisorConfig: () => ({
              firmName: '',
              advisorEmail: '',
              clientNumber: '',
              consultantNumber: '',
              skrStandard: 'SKR03',
            }),
            isPreparingReport: signal(false),
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal({ id: 'w', name: 'Test' }) },
        },
        { provide: PurchaseService, useValue: { purchases: signal([]) } },
        { provide: SalesService, useValue: { sales: signal([]) } },
        { provide: BankReconciliationService, useValue: { summary: () => ({ matchedCount: 0 }) } },
        {
          provide: TablePreferencesService,
          useValue: { getTableConfig: () => ACCOUNTING_TABLE_CONFIG },
        },
      ],
    });
  });

  it('zeigt Prüfen statt unbekannter Nullbeträge und sperrt Export und Druck', () => {
    results.set([
      {
        ...complete,
        calculation_status: 'needs_review',
        tax_purchase_cost: null,
        tax_margin: null,
        tax_base: 0,
        vat_amount: 0,
        net_tax_liability: 0,
        net_profit_after_tax: 0,
      },
    ]);
    const fixture = TestBed.createComponent(AccountingComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="status"]')?.textContent).toContain('1 Position prüfen');
    expect(element.textContent).toContain('Vorsteuer wird noch nicht automatisch berücksichtigt.');
    const cells = Array.from(element.querySelectorAll('tbody td')).map((cell) =>
      cell.textContent?.trim(),
    );
    expect(cells.slice(4, 8)).toEqual(['Prüfen', 'Prüfen', 'Prüfen', 'Prüfen']);
    const marginCell = element.querySelectorAll('tbody td')[5];
    expect(marginCell.classList.contains('text-fb-text-secondary')).toBe(true);
    expect(marginCell.classList.contains('text-fb-profit')).toBe(false);
    expect(element.querySelectorAll('tbody td')[7].classList.contains('text-fb-text-primary')).toBe(
      true,
    );
    const actions = Array.from(element.querySelectorAll('button')).filter((button) =>
      /DATEV EXTF CSV|§ 25a Journal|Berichtspaket vorbereiten/.test(button.textContent ?? ''),
    );
    expect(actions).toHaveLength(3);
    expect(actions.every((button) => button.disabled)).toBe(true);
    expect(
      Array.from(element.querySelectorAll('.kpi-value'))
        .slice(1)
        .every((value) => value.textContent?.trim() === 'Prüfen'),
    ).toBe(true);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fixture.componentInstance.printInvoice();
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it('zeigt die steuerlichen Beträge je Position und zählt einen Mehrpositionsverkauf nur einmal', () => {
    results.set([
      complete,
      {
        ...complete,
        item_title: 'Artikel B',
        tax_purchase_cost: 50,
        tax_margin: -10,
        gross_revenue: 40,
        tax_base: 0,
        vat_amount: 0,
      },
    ]);
    const fixture = TestBed.createComponent(AccountingComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.salesCount()).toBe(1);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    const cells = Array.from(element.querySelector('tbody tr')!.querySelectorAll('td')).map(
      (cell) => cell.textContent?.trim(),
    );
    expect(cells[4]).toContain('100,00');
    expect(cells[5]).toContain('20,00');
    expect(cells[6]).toContain('16,81');
    expect(cells[7]).toContain('3,19');
    const rows = element.querySelectorAll('tbody tr');
    expect(rows[0].querySelectorAll('td')[5].classList.contains('text-fb-profit')).toBe(true);
    expect(rows[1].querySelectorAll('td')[5].classList.contains('text-fb-loss')).toBe(true);
    expect(rows[1].querySelectorAll('td')[5].classList.contains('text-fb-profit')).toBe(false);
    expect(element.querySelector('[role="status"]')?.textContent).not.toContain(
      'Positionen prüfen',
    );
    expect(
      Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('DATEV EXTF CSV'),
      )?.disabled,
    ).toBe(false);
  });
  it('vertraut Datensätzen ohne Berechnungsstatus nicht', () => {
    const legacyResult = { ...complete };
    Reflect.deleteProperty(legacyResult, 'calculation_status');
    results.set([legacyResult]);
    const fixture = TestBed.createComponent(AccountingComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.reviewCount()).toBe(1);
    const cells = Array.from(element.querySelectorAll('tbody td')).map((cell) =>
      cell.textContent?.trim(),
    );
    expect(cells.slice(6, 8)).toEqual(['Prüfen', 'Prüfen']);
    expect(
      Array.from(element.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('DATEV EXTF CSV'),
      )?.disabled,
    ).toBe(true);
  });
  it('verwendet die Mehrzahl bei mehreren ungeprüften Positionen', () => {
    results.set([
      { ...complete, calculation_status: 'needs_review' },
      { ...complete, item_title: 'Artikel B', calculation_status: 'needs_review' },
    ]);
    const fixture = TestBed.createComponent(AccountingComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="status"]')?.textContent).toContain('2 Positionen prüfen');
  });
});
