import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  LucideCheck as Check,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
  LucideCircleDollarSign as CircleDollarSign,
  LucideFileText as FileText,
  LucidePencil as Pencil,
  LucidePlus as Plus,
  LucideSettings2 as Settings2,
  LucideTrash2 as Trash2,
} from '@lucide/angular';
import { ExpensesColumnId, ExpensesSortField } from '../../core/config/table-defaults.config';
import { Expense, ExpenseRecurringRule, ExpenseStatus } from '../../core/models/expense.models';
import {
  TableSortState,
  tableStateDiffersFromDefaults,
} from '../../core/models/table-preferences.models';
import { ExpenseCategoryService } from '../../core/services/expense-category.service';
import { ExpenseDocumentService } from '../../core/services/expense-document.service';
import { ExpenseRecurringService } from '../../core/services/expense-recurring.service';
import { ExpenseService } from '../../core/services/expense.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { nextOccurrence as nextExpenseOccurrence } from '../../core/utils/expense-recurrence';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../shared/components/table-action-button/table-action-button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableSortHeaderComponent } from '../../shared/components/table-sort-header/table-sort-header.component';
import { ExpenseCategoryDialogComponent } from './components/expense-category-dialog/expense-category-dialog.component';
import { ExpenseDialogComponent } from './components/expense-dialog/expense-dialog.component';
import { ExpenseDocumentsComponent } from './components/expense-documents/expense-documents.component';
import { RecurringExpenseDialogComponent } from './components/recurring-expense-dialog/recurring-expense-dialog.component';

type ExpenseTab = 'expenses' | 'recurring';
type ExpenseStatusFilter = 'all' | ExpenseStatus;
type ExpensePeriod = string | null;

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function localMonthKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0')].join('-');
}

function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  return localMonthKey(new Date(year, month - 1 + offset, 1));
}

@Component({
  selector: 'app-expenses',
  imports: [
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    ButtonComponent,
    TableActionButtonComponent,
    CardComponent,
    BadgeComponent,
    CustomSelectComponent,
    DataTableComponent,
    TableSortHeaderComponent,
    ModalShellComponent,
    ExpenseCategoryDialogComponent,
    ExpenseDialogComponent,
    ExpenseDocumentsComponent,
    RecurringExpenseDialogComponent,
  ],
  templateUrl: './expenses.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent {
  readonly expenseService = inject(ExpenseService);
  readonly categoryService = inject(ExpenseCategoryService);
  readonly recurringService = inject(ExpenseRecurringService);
  readonly documentService = inject(ExpenseDocumentService);
  private readonly tablePreferences = inject(TablePreferencesService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private initializationSequence = 0;

  readonly activeTab = signal<ExpenseTab>('expenses');
  readonly expensePeriod = signal<ExpensePeriod>(localMonthKey());
  readonly statusFilter = signal<ExpenseStatusFilter>('all');
  readonly categoryFilter = signal<string>('all');
  readonly search = signal('');
  readonly expenseDialogOpen = signal(false);
  readonly editingExpense = signal<Expense | null>(null);
  readonly recurringDialogOpen = signal(false);
  readonly editingRule = signal<ExpenseRecurringRule | null>(null);
  readonly categoryDialogOpen = signal(false);
  readonly documentExpense = signal<Expense | null>(null);
  readonly isInitializing = signal(true);

  readonly pageIcon = CircleDollarSign;
  readonly addIcon = Plus;
  readonly settingsIcon = Settings2;
  readonly paidIcon = Check;
  readonly previousMonthIcon = ChevronLeft;
  readonly nextMonthIcon = ChevronRight;
  readonly editIcon = Pencil;
  readonly deleteIcon = Trash2;
  readonly addDocumentIcon = Plus;
  readonly viewDocumentIcon = FileText;

  readonly workspaceId = computed(() => this.workspaceService.currentWorkspace()?.id ?? 'default');
  readonly expensesTableConfig = this.tablePreferences.getTableConfig<
    ExpensesColumnId,
    ExpensesSortField
  >('expenses');
  readonly tablePrefs = computed(() =>
    this.tablePreferences.getTablePreferences<ExpensesColumnId, ExpensesSortField>(
      'expenses',
      this.workspaceId(),
    )(),
  );
  readonly orderedVisibleColumns = computed(() =>
    this.tablePrefs().columns.filter((column) => column.visible),
  );

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

  readonly expensePeriodLabel = computed(() => {
    const period = this.expensePeriod();
    if (period === null) return 'Alle Zeiträume';
    const [year, month] = period.split('-').map(Number);
    return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
      new Date(year, month - 1, 1),
    );
  });

  readonly visibleExpenses = computed(() => {
    const period = this.expensePeriod();
    const status = this.statusFilter();
    const category = this.categoryFilter();
    const query = this.search().trim().toLocaleLowerCase('de-DE');
    const sort = this.tablePrefs().sort;
    const rows = this.expenseService
      .expenses()
      .filter((expense) => expense.deleted_at === null)
      .filter((expense) => period === null || expense.expense_date.startsWith(`${period}-`))
      .filter((expense) => status === 'all' || expense.status === status)
      .filter((expense) => category === 'all' || expense.category_id === category)
      .filter((expense) => {
        if (!query) return true;
        return (
          expense.title.toLocaleLowerCase('de-DE').includes(query) ||
          (expense.vendor_name ?? '').toLocaleLowerCase('de-DE').includes(query)
        );
      });

    return [...rows].sort((left, right) => {
      const comparison =
        sort.field === 'gross_amount'
          ? Number(left.gross_amount) - Number(right.gross_amount)
          : sort.field === 'title'
            ? left.title.localeCompare(right.title, 'de', { sensitivity: 'base' })
            : sort.field === 'status'
              ? left.status.localeCompare(right.status, 'de', { sensitivity: 'base' })
              : left.expense_date.localeCompare(right.expense_date);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  readonly viewModified = computed(
    () =>
      this.search().trim() !== '' ||
      this.expensePeriod() !== localMonthKey() ||
      this.statusFilter() !== 'all' ||
      this.categoryFilter() !== 'all' ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.expensesTableConfig),
  );

  readonly summary = computed(() => {
    const expenses = this.visibleExpenses();
    const total = expenses.reduce((sum, expense) => sum + Number(expense.gross_amount), 0);
    const paid = expenses
      .filter((expense) => expense.status === 'paid')
      .reduce((sum, expense) => sum + Number(expense.gross_amount), 0);
    const open = expenses
      .filter((expense) => expense.status === 'open')
      .reduce((sum, expense) => sum + Number(expense.gross_amount), 0);

    return { total, paid, open };
  });

  readonly dataLoadError = computed(() => {
    if (this.expenseService.loadError()) return 'Die Ausgaben konnten nicht geladen werden.';
    if (this.categoryService.loadError())
      return 'Die Ausgabenkategorien konnten nicht geladen werden.';
    return null;
  });

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      void this.initializeWorkspace(workspaceId);
    });
  }

  private async initializeWorkspace(workspaceId: string | null): Promise<void> {
    const sequence = ++this.initializationSequence;
    this.isInitializing.set(true);
    if (!workspaceId) {
      this.isInitializing.set(false);
      return;
    }

    try {
      await Promise.all([
        this.categoryService.load(),
        this.expenseService.ensureCurrentWorkspaceLoaded(),
      ]);
      if (!this.isCurrentInitialization(workspaceId, sequence)) return;
      await this.loadDocumentSummary();
    } finally {
      if (this.isCurrentInitialization(workspaceId, sequence)) {
        this.isInitializing.set(false);
      }
    }
  }

  openNewExpense(): void {
    this.editingExpense.set(null);
    this.expenseDialogOpen.set(true);
  }

  editExpense(expense: Expense): void {
    this.editingExpense.set(expense);
    this.expenseDialogOpen.set(true);
  }

  closeExpenseDialog(): void {
    this.expenseDialogOpen.set(false);
    this.editingExpense.set(null);
  }

  async onExpenseSaved(expense: Expense): Promise<void> {
    await this.documentService.loadSummaryForExpenses([expense.id]);
  }

  openNewRecurring(): void {
    this.editingRule.set(null);
    this.recurringDialogOpen.set(true);
  }

  editRecurring(rule: ExpenseRecurringRule): void {
    this.editingRule.set(rule);
    this.recurringDialogOpen.set(true);
  }

  closeRecurringDialog(): void {
    this.recurringDialogOpen.set(false);
    this.editingRule.set(null);
  }

  async refreshAfterRecurringSave(): Promise<void> {
    await this.expenseService.load();
    await this.loadDocumentSummary();
  }

  async markPaid(expense: Expense): Promise<void> {
    await this.expenseService.markPaid(expense.id, localDateKey());
  }

  async removeExpense(expense: Expense): Promise<void> {
    const confirmed = await this.dialog.frage({
      titel: 'Ausgabe löschen?',
      text: `„${expense.title}“ wird aus der aktiven Ausgabenliste entfernt.`,
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (!confirmed) return;
    await this.expenseService.remove(expense.id);
  }

  setTab(tab: ExpenseTab): void {
    this.activeTab.set(tab);
  }

  setStatus(value: string | null): void {
    this.statusFilter.set(value === 'open' || value === 'paid' ? value : 'all');
  }

  setCategory(value: string | null): void {
    this.categoryFilter.set(value ?? 'all');
  }

  moveExpensePeriod(offset: number): void {
    this.expensePeriod.set(shiftMonthKey(this.expensePeriod() ?? localMonthKey(), offset));
  }

  showAllExpensePeriods(): void {
    this.expensePeriod.set(null);
  }

  toggleColumnVisibility(columnId: ExpensesColumnId): void {
    this.tablePreferences.toggleColumnVisibility('expenses', columnId, this.workspaceId());
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'expenses',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  onSortChanged(sort: TableSortState<ExpensesSortField>): void {
    this.tablePreferences.setSort('expenses', sort, this.workspaceId());
  }

  resetView(): void {
    this.search.set('');
    this.expensePeriod.set(localMonthKey());
    this.statusFilter.set('all');
    this.categoryFilter.set('all');
    this.tablePreferences.resetToDefaults('expenses', this.workspaceId());
  }

  ariaSort(field: ExpensesSortField): 'ascending' | 'descending' | null {
    const sort = this.tablePrefs().sort;
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
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
    const rule = this.recurringService.rules().find((entry) => entry.id === ruleId);
    return rule ? nextExpenseOccurrence(rule, localDateKey()) : null;
  }

  statusTone(status: ExpenseStatus): 'success' | 'caution' {
    return status === 'paid' ? 'success' : 'caution';
  }

  private async loadDocumentSummary(): Promise<void> {
    await this.documentService.loadSummaryForExpenses(
      this.expenseService.expenses().map((expense) => expense.id),
    );
  }

  private isCurrentInitialization(workspaceId: string, sequence: number): boolean {
    return (
      this.initializationSequence === sequence &&
      this.workspaceService.currentWorkspace()?.id === workspaceId
    );
  }
}
