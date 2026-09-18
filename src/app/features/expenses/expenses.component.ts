import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  LucideCircleDollarSign as CircleDollarSign,
  LucidePlus as Plus,
  LucideSettings2 as Settings2,
} from '@lucide/angular';
import { ExpenseStatus } from '../../core/models/expense.models';
import { ExpenseCategoryService } from '../../core/services/expense-category.service';
import { ExpenseRecurringService } from '../../core/services/expense-recurring.service';
import { ExpenseService } from '../../core/services/expense.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

type ExpenseTab = 'expenses' | 'recurring';
type ExpenseStatusFilter = 'all' | ExpenseStatus;

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

@Component({
  selector: 'app-expenses',
  imports: [
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    BadgeComponent,
    CustomSelectComponent,
  ],
  templateUrl: './expenses.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent implements OnInit {
  readonly expenseService = inject(ExpenseService);
  readonly categoryService = inject(ExpenseCategoryService);
  readonly recurringService = inject(ExpenseRecurringService);

  readonly activeTab = signal<ExpenseTab>('expenses');
  readonly statusFilter = signal<ExpenseStatusFilter>('all');
  readonly categoryFilter = signal<string>('all');
  readonly search = signal('');

  readonly pageIcon = CircleDollarSign;
  readonly addIcon = Plus;
  readonly settingsIcon = Settings2;

  readonly statusOptions: readonly SelectOption<ExpenseStatusFilter>[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'paid', label: 'Bezahlt' },
    { value: 'open', label: 'Offen' },
  ];

  readonly categoryOptions = computed<readonly SelectOption<string>[]>(() => [
    { value: 'all', label: 'Alle Kategorien' },
    ...this.categoryService.categories().map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ]);

  readonly visibleExpenses = computed(() => {
    const status = this.statusFilter();
    const category = this.categoryFilter();
    const query = this.search().trim().toLocaleLowerCase('de-DE');

    return this.expenseService
      .expenses()
      .filter((expense) => status === 'all' || expense.status === status)
      .filter((expense) => category === 'all' || expense.category_id === category)
      .filter((expense) => !query || expense.title.toLocaleLowerCase('de-DE').includes(query));
  });

  readonly summary = computed(() => {
    const expenses = this.expenseService.expenses();
    const total = expenses.reduce((sum, expense) => sum + Number(expense.gross_amount), 0);
    const paid = expenses
      .filter((expense) => expense.status === 'paid')
      .reduce((sum, expense) => sum + Number(expense.gross_amount), 0);
    const open = expenses
      .filter((expense) => expense.status === 'open')
      .reduce((sum, expense) => sum + Number(expense.gross_amount), 0);

    return { total, paid, open };
  });

  readonly upcoming = computed(() => this.recurringService.upcoming(localDateKey(), 30));

  async ngOnInit(): Promise<void> {
    await this.categoryService.load();
    await this.recurringService.load();
    await this.recurringService.materializeDue(localDateKey());
    await this.expenseService.load();
  }

  setTab(tab: ExpenseTab): void {
    this.activeTab.set(tab);
  }

  setStatus(value: string | null): void {
    this.statusFilter.set(
      value === 'open' || value === 'paid' ? value : 'all',
    );
  }

  setCategory(value: string | null): void {
    this.categoryFilter.set(value ?? 'all');
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  categoryName(categoryId: string): string {
    return (
      this.categoryService.allCategories().find((category) => category.id === categoryId)?.name ??
      'Kategorie'
    );
  }

  frequencyLabel(frequency: 'monthly' | 'quarterly' | 'yearly'): string {
    switch (frequency) {
      case 'monthly':
        return 'monatlich';
      case 'quarterly':
        return 'quartalsweise';
      case 'yearly':
        return 'jährlich';
    }
  }

  nextOccurrence(ruleId: string): string | null {
    return this.upcoming().find((entry) => entry.ruleId === ruleId)?.occurrenceDate ?? null;
  }

  statusTone(status: ExpenseStatus): 'success' | 'caution' {
    return status === 'paid' ? 'success' : 'caution';
  }
}
