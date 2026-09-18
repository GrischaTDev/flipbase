import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  OperatingExpense,
  OperatingExpenseCategory,
  RecurringOperatingExpense,
} from '../../core/models/operating-expense.models';
import { OperatingExpenseService } from '../../core/services/operating-expense.service';
import { ExpensesComponent } from './expenses.component';

const category: OperatingExpenseCategory = {
  id: 'category-1',
  workspace_id: 'workspace-1',
  name: 'Hosting & Server',
  default_key: 'hosting_server',
  archived_at: null,
  created_at: '2026-09-01T08:00:00.000Z',
  created_by: null,
};

const expenses = signal<readonly OperatingExpense[]>([
  {
    id: 'expense-paid',
    workspace_id: 'workspace-1',
    category_id: category.id,
    recurring_rule_id: null,
    recurrence_date: null,
    title: 'Server',
    gross_amount: 29.9,
    vat_rate: 19,
    expense_date: '2026-09-03',
    status: 'paid',
    due_date: null,
    paid_at: '2026-09-03',
    created_at: '2026-09-03T08:00:00.000Z',
    updated_at: '2026-09-03T08:00:00.000Z',
    created_by: 'user-1',
  },
  {
    id: 'expense-open',
    workspace_id: 'workspace-1',
    category_id: category.id,
    recurring_rule_id: 'rule-1',
    recurrence_date: '2026-09-20',
    title: 'Hosting Oktober',
    gross_amount: 20,
    vat_rate: null,
    expense_date: '2026-09-20',
    status: 'open',
    due_date: '2026-09-30',
    paid_at: null,
    created_at: '2026-09-20T08:00:00.000Z',
    updated_at: '2026-09-20T08:00:00.000Z',
    created_by: 'user-1',
  },
]);

const recurringRules = signal<readonly RecurringOperatingExpense[]>([
  {
    id: 'rule-1',
    workspace_id: 'workspace-1',
    category_id: category.id,
    title: 'Hosting',
    gross_amount: 20,
    vat_rate: null,
    interval: 'monthly',
    start_date: '2026-09-20',
    end_date: null,
    next_due_date: '2026-10-20',
    archived_at: null,
    created_at: '2026-09-01T08:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z',
    created_by: 'user-1',
  },
]);

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ExpensesComponent],
    providers: [
      {
        provide: OperatingExpenseService,
        useValue: {
          expenses,
          categories: signal<readonly OperatingExpenseCategory[]>([category]),
          recurringRules,
          isLoading: signal(false),
          loadError: signal<string | null>(null),
          loadCurrentWorkspace: async () => undefined,
        },
      },
    ],
  });
});

function createPage() {
  const fixture = TestBed.createComponent(ExpensesComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ExpensesComponent', () => {
  it('zeigt die einfache Ausgabenübersicht mit den wichtigsten Summen', () => {
    const fixture = createPage();
    const host = fixture.nativeElement as HTMLElement;
    const text = host.textContent?.replace(/\s+/g, ' ') ?? '';

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Ausgaben');
    expect(text).toContain('Ausgabe hinzufügen');
    expect(text).toContain('Gesamt');
    expect(text).toContain('49,90 €');
    expect(text).toContain('Bezahlt');
    expect(text).toContain('29,90 €');
    expect(text).toContain('Offen');
    expect(text).toContain('20,00 €');
  });

  it('benennt die Tabelle ohne Buchhaltungsjargon', () => {
    const fixture = createPage();
    const headers = [...(fixture.nativeElement as HTMLElement).querySelectorAll('thead th')].map(
      (header) => header.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(headers).toEqual([
      'Datum',
      'Beschreibung',
      'Kategorie',
      'Betrag',
      'Status',
      'Fällig / bezahlt',
      'Wiederholung',
      'Beleg',
      'Aktionen',
    ]);
  });

  it('wechselt zwischen Ausgaben und wiederkehrenden Kosten', () => {
    const fixture = createPage();
    const host = fixture.nativeElement as HTMLElement;
    const recurringButton = [...host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Wiederkehrend',
    );

    expect(recurringButton).toBeDefined();
    recurringButton!.click();
    fixture.detectChanges();

    const text = host.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Hosting');
    expect(text).toContain('Monatlich');
    expect(text).toContain('20,00 €');
    expect(text).toContain('20.10.2026');
  });

  it('bietet Suche, Status- und Kategorieauswahl an', () => {
    const fixture = createPage();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-expense-search]')).not.toBeNull();
    expect(host.querySelector('[data-expense-status-filter]')).not.toBeNull();
    expect(host.querySelector('[data-expense-category-filter]')).not.toBeNull();
  });
});
