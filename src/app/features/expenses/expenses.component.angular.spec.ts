import '@angular/compiler';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Expense, ExpenseCategory, ExpenseRecurringRule } from '../../core/models/expense.models';
import { ExpenseCategoryService } from '../../core/services/expense-category.service';
import { ExpenseRecurringService } from '../../core/services/expense-recurring.service';
import { ExpenseService } from '../../core/services/expense.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
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
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });

  registerInputs(PageHeaderComponent, ['title', 'subtitle', 'icon']);
  registerInputs(ButtonComponent, ['variant', 'size', 'icon', 'ariaPressed']);
  registerInputs(CardComponent, ['padding', 'rounded']);
  registerInputs(BadgeComponent, ['tone', 'mono']);
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

  const fixture = TestBed.configureTestingModule({
    imports: [ExpensesComponent],
    providers: [
      { provide: ExpenseService, useValue: expenseService },
      { provide: ExpenseCategoryService, useValue: categoryService },
      { provide: ExpenseRecurringService, useValue: recurringService },
    ],
  }).createComponent(ExpensesComponent);
  fixture.detectChanges();

  return { fixture, expenseService, categoryService, recurringService };
}

describe('ExpensesComponent', () => {
  it('zeigt Summen, Filter und die Ausgabentabelle verständlich', () => {
    const { fixture } = render();
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
    expect(headings).toEqual([
      'Datum',
      'Bezeichnung',
      'Kategorie',
      'Brutto',
      'MwSt.',
      'Status',
      'Fällig / bezahlt am',
      'Wiederholung',
      'Beleg',
      'Aktionen',
    ]);
  });

  it('filtert die konkrete Tabelle nach Status', () => {
    const { fixture } = render();
    const selects = fixture.debugElement.queryAll(By.directive(CustomSelectComponent));
    const statusSelect = selects
      .map((entry) => entry.componentInstance as CustomSelectComponent<string>)
      .find((select) => select.ariaLabel() === 'Status filtern');

    (statusSelect as unknown as { valueChange: EventEmitter<string | null> }).valueChange.emit(
      'open',
    );
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Server');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Versandkartons');
  });

  it('wechselt zur Ansicht der wiederkehrenden Ausgaben und zeigt die nächste Fälligkeit', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const recurringButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Wiederkehrend'),
    );

    recurringButton?.click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Server');
    expect(host.textContent).toContain('monatlich');
    expect(host.textContent).toContain('18.10.2026');
  });

  it('besteht die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = render();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
  });
});
