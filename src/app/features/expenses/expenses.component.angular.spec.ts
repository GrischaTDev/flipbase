import '@angular/compiler';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXPENSES_TABLE_CONFIG } from '../../core/config/table-defaults.config';
import { Expense, ExpenseCategory, ExpenseRecurringRule } from '../../core/models/expense.models';
import { ExpenseCategoryService } from '../../core/services/expense-category.service';
import { ExpenseDocumentService } from '../../core/services/expense-document.service';
import { ExpenseRecurringService } from '../../core/services/expense-recurring.service';
import { ExpenseService } from '../../core/services/expense.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
import { ExpensesComponent } from './expenses.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs?: Record<string, string>;
}

const snapshots = new Map<unknown, AngularInputMetadata>();
let selectOutputs: Record<string, string> | undefined;
let selectValueChangeDescriptor: PropertyDescriptor | undefined;

function registerInputs(component: unknown, names: readonly string[]) {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  snapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
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
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });

  registerInputs(PageHeaderComponent, ['title', 'subtitle', 'icon']);
  registerInputs(ButtonComponent, [
    'variant',
    'size',
    'icon',
    'iconOnly',
    'ariaPressed',
    'ariaLabel',
    'title',
  ]);
  registerInputs(CardComponent, ['padding', 'rounded']);
  registerInputs(BadgeComponent, ['tone', 'mono']);
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
  registerInputs(TableSortHeaderComponent, ['label', 'sortField', 'currentSort', 'align']);
  registerInputs(CustomSelectComponent, [
    'options',
    'value',
    'variant',
    'size',
    'widthClass',
    'ariaLabel',
    'triggerId',
  ]);

  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  selectOutputs = metadata.outputs;
  metadata.outputs = { ...metadata.outputs, valueChange: 'valueChange' };
  selectValueChangeDescriptor = Object.getOwnPropertyDescriptor(
    CustomSelectComponent.prototype,
    'valueChange',
  );
  Object.defineProperty(CustomSelectComponent.prototype, 'valueChange', {
    configurable: true,
    value: new EventEmitter<string | null>(),
  });
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  for (const [component, snapshot] of snapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    if (snapshot.outputs) metadata.outputs = snapshot.outputs;
  }
  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.outputs = selectOutputs;
  if (selectValueChangeDescriptor) {
    Object.defineProperty(
      CustomSelectComponent.prototype,
      'valueChange',
      selectValueChangeDescriptor,
    );
  }
});

const categories: ExpenseCategory[] = [
  {
    id: 'cat-pack',
    workspace_id: 'ws-1',
    name: 'Versandmaterial',
    sort_order: 10,
    is_default: true,
    is_archived: false,
    created_at: '2026-09-01T00:00:00Z',
    created_by: null,
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'cat-host',
    workspace_id: 'ws-1',
    name: 'Hosting & Server',
    sort_order: 20,
    is_default: true,
    is_archived: false,
    created_at: '2026-09-01T00:00:00Z',
    created_by: null,
    updated_at: '2026-09-01T00:00:00Z',
  },
];

const expenses: Expense[] = [
  {
    id: 'expense-paid',
    workspace_id: 'ws-1',
    category_id: 'cat-pack',
    recurring_rule_id: null,
    occurrence_date: null,
    title: 'Versandkartons',
    vendor_name: 'Amazon',
    quantity: 10,
    gross_amount: 35,
    vat_rate: 19,
    expense_date: '2026-09-10',
    due_date: null,
    status: 'paid',
    payment_date: '2026-09-10',
    notes: null,
    deleted_at: null,
    created_at: '2026-09-10T00:00:00Z',
    created_by: 'user-1',
    updated_at: '2026-09-10T00:00:00Z',
  },
  {
    id: 'expense-open',
    workspace_id: 'ws-1',
    category_id: 'cat-host',
    recurring_rule_id: 'rule-server',
    occurrence_date: '2026-09-18',
    title: 'Server',
    vendor_name: 'Netcup',
    quantity: 1,
    gross_amount: 29.9,
    vat_rate: 19,
    expense_date: '2026-09-18',
    due_date: '2026-09-18',
    status: 'open',
    payment_date: null,
    notes: null,
    deleted_at: null,
    created_at: '2026-09-18T00:00:00Z',
    created_by: 'user-1',
    updated_at: '2026-09-18T00:00:00Z',
  },
];

const rules: ExpenseRecurringRule[] = [
  {
    id: 'rule-server',
    workspace_id: 'ws-1',
    category_id: 'cat-host',
    title: 'Server',
    vendor_name: 'Netcup',
    quantity: 1,
    gross_amount: 29.9,
    vat_rate: 19,
    frequency: 'monthly',
    start_date: '2026-09-18',
    end_date: null,
    is_active: true,
    notes: null,
    created_at: '2026-09-18T00:00:00Z',
    created_by: 'user-1',
    updated_at: '2026-09-18T00:00:00Z',
  },
];

function render() {
  const expenseService = {
    expenses: signal(expenses),
    isLoading: signal(false),
    loadError: signal(null),
    load: vi.fn().mockResolvedValue(undefined),
    ensureCurrentWorkspaceLoaded: vi.fn().mockResolvedValue(undefined),
    markPaid: vi.fn().mockResolvedValue({ data: expenses[1], error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  const categoryService = {
    categories: signal(categories),
    allCategories: signal(categories),
    load: vi.fn().mockResolvedValue(undefined),
  };
  const recurringService = {
    rules: signal(rules),
    load: vi.fn().mockResolvedValue(undefined),
    materializeDue: vi.fn().mockResolvedValue({ count: 0, error: null }),
    upcoming: vi.fn(() => [
      {
        ruleId: 'rule-server',
        title: 'Server',
        categoryId: 'cat-host',
        grossAmount: 29.9,
        occurrenceDate: '2026-10-18',
      },
    ]),
  };
  const tableState = signal({
    columns: [...EXPENSES_TABLE_CONFIG.defaultColumns],
    sort: { ...EXPENSES_TABLE_CONFIG.defaultSort },
  });
  const tablePreferences = {
    getTableConfig: vi.fn(() => EXPENSES_TABLE_CONFIG),
    getTablePreferences: vi.fn(() => tableState.asReadonly()),
    toggleColumnVisibility: vi.fn(),
    reorderColumns: vi.fn(),
    setSort: vi.fn(),
    resetToDefaults: vi.fn(),
  };
  const workspaceService = {
    currentWorkspace: signal({ id: 'ws-1' }),
  };
  const documentService = {
    loadSummaryForExpenses: vi.fn().mockResolvedValue(undefined),
    hasDocuments: vi.fn((expenseId: string) => expenseId === 'expense-paid'),
  };
  const dialog = {
    frage: vi.fn().mockResolvedValue(true),
  };

  const fixture = TestBed.configureTestingModule({
    imports: [ExpensesComponent],
    providers: [
      { provide: ExpenseService, useValue: expenseService },
      { provide: ExpenseCategoryService, useValue: categoryService },
      { provide: ExpenseRecurringService, useValue: recurringService },
      { provide: TablePreferencesService, useValue: tablePreferences },
      { provide: WorkspaceService, useValue: workspaceService },
      { provide: ExpenseDocumentService, useValue: documentService },
      { provide: ConfirmDialogService, useValue: dialog },
    ],
  }).createComponent(ExpensesComponent);
  fixture.detectChanges();

  return { fixture, expenseService, categoryService, recurringService, documentService, dialog };
}

describe('ExpensesComponent', () => {
  it('zeigt Summen, Filter und die Ausgabentabelle verständlich', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const headings = [...host.querySelectorAll('thead th')].map((entry) =>
      entry.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(host.querySelector('h1')?.textContent).toContain('Ausgaben');
    expect(host.textContent).toContain('64,90');
    expect(host.textContent).toContain('35,00');
    expect(host.textContent).toContain('29,90');
    expect(host.textContent).toContain('Ausgabe hinzufügen');
    expect(host.textContent).toContain('Kategorien verwalten');
    expect(host.querySelector('app-data-table')).toBeTruthy();
    expect(host.querySelector('[data-data-table-toolbar]')).toBeTruthy();
    expect(host.querySelector('[data-data-table-settings]')).toBeTruthy();
    expect(headings).toEqual([
      'Datum',
      'Bezeichnung',
      'Anbieter',
      'Kategorie',
      'Menge',
      'Gesamtbetrag',
      'Status',
      'Beleg',
      'Aktionen',
    ]);
  });

  it('findet Ausgaben auch über den Anbieter', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.search.set('netcup');
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleExpenses().map((entry) => entry.id)).toEqual([
      'expense-open',
    ]);
  });

  it(
    'initialisiert Ausgaben nur über den deduplizierten Service-Pfad und lädt danach Belegstatus',
    async () => {
      const { fixture, expenseService, recurringService, documentService } = render();
      await fixture.whenStable();

      expect(expenseService.ensureCurrentWorkspaceLoaded).toHaveBeenCalledTimes(1);
      expect(recurringService.load).not.toHaveBeenCalled();
      expect(recurringService.materializeDue).not.toHaveBeenCalled();
      expect(documentService.loadSummaryForExpenses).toHaveBeenCalledWith([
        'expense-paid',
        'expense-open',
      ]);
    },
  );

  it('verwendet den gemeinsamen Bestätigungsdialog zum Löschen', async () => {
    const { fixture, expenseService, dialog } = render();
    await fixture.whenStable();

    await fixture.componentInstance.removeExpense(expenses[0]);

    expect(dialog.frage).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Ausgabe löschen?', gefahr: true }),
    );
    expect(expenseService.remove).toHaveBeenCalledWith('expense-paid');
  });

  it('filtert die konkrete Tabelle nach Status', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.setStatus('open');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Server');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Versandkartons');
  });

  it('wechselt zur Ansicht der wiederkehrenden Ausgaben und zeigt die nächste Fälligkeit', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.setTab('recurring');
    fixture.detectChanges();

    expect(host.textContent).toContain('Server');
    expect(host.textContent).toContain('monatlich');
    expect(host.textContent).toContain('18.10.2026');
    expect(host.querySelector('app-data-table')).toBeTruthy();
  });

  it('besteht die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = render();
    await fixture.whenStable();
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
