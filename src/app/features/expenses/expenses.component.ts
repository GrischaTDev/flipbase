import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  OPERATING_EXPENSE_INTERVAL_LABELS,
  OperatingExpense,
} from '../../core/models/operating-expense.models';
import { OperatingExpenseService } from '../../core/services/operating-expense.service';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

type ExpenseTab = 'expenses' | 'recurring';
type ExpenseStatusFilter = 'all' | 'open' | 'paid';

@Component({
  selector: 'app-expenses',
  standalone: true,
  template: `
    <div class="space-y-4 animate-fade-in">
      <header
        class="linear-surface rounded-xl border border-fb-line px-5 py-4 sm:flex sm:items-end sm:justify-between sm:gap-4"
      >
        <div>
          <p class="text-xs font-medium text-fb-text-muted">Finanzen</p>
          <h1 class="mt-1 text-lg font-semibold tracking-tight text-fb-text-primary">Ausgaben</h1>
          <p class="mt-1 text-xs text-fb-text-muted">
            Betriebskosten und wiederkehrende Fixkosten im Blick.
          </p>
        </div>
        <button
          type="button"
          class="fb-button linear-btn-primary mt-3 h-8 rounded-lg px-4 text-[13px] font-semibold text-fb-on-accent sm:mt-0"
        >
          Ausgabe hinzufügen
        </button>
      </header>

      <div
        class="inline-flex rounded-lg border border-fb-line bg-fb-well p-1"
        role="tablist"
        aria-label="Ausgabenansicht"
      >
        <button
          type="button"
          role="tab"
          class="h-7 rounded-lg px-3 text-[13px] font-medium"
          [class.bg-fb-surface]="activeTab() === 'expenses'"
          [class.text-fb-text-primary]="activeTab() === 'expenses'"
          [class.text-fb-text-muted]="activeTab() !== 'expenses'"
          [attr.aria-selected]="activeTab() === 'expenses'"
          (click)="activeTab.set('expenses')"
        >
          Ausgaben
        </button>
        <button
          type="button"
          role="tab"
          class="h-7 rounded-lg px-3 text-[13px] font-medium"
          [class.bg-fb-surface]="activeTab() === 'recurring'"
          [class.text-fb-text-primary]="activeTab() === 'recurring'"
          [class.text-fb-text-muted]="activeTab() !== 'recurring'"
          [attr.aria-selected]="activeTab() === 'recurring'"
          (click)="activeTab.set('recurring')"
        >
          Wiederkehrend
        </button>
      </div>

      @if (activeTab() === 'expenses') {
        <section aria-label="Ausgaben im aktuellen Monat">
          <div class="grid gap-3 sm:grid-cols-3">
            @for (summary of summaries(); track summary.label) {
              <div class="linear-kpi rounded-xl border border-fb-line bg-fb-surface p-4 shadow-sm">
                <p class="text-xs font-medium text-fb-text-muted">{{ summary.label }}</p>
                <p class="mt-2 font-mono text-xl font-semibold text-fb-text-primary">
                  {{ formatMoney(summary.value) }}
                </p>
              </div>
            }
          </div>
        </section>

        <section class="linear-surface rounded-xl border border-fb-line">
          <div class="grid gap-2 border-b border-fb-line p-3 md:grid-cols-[1fr_180px_220px]">
            <input
              data-expense-search
              type="search"
              aria-label="Ausgaben durchsuchen"
              placeholder="Ausgaben durchsuchen"
              class="h-9 rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary outline-none"
              [value]="search()"
              (input)="setSearch($event)"
            />
            <select
              data-expense-status-filter
              aria-label="Status filtern"
              class="h-9 rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              [value]="statusFilter()"
              (change)="setStatus($event)"
            >
              <option value="all">Alle Status</option>
              <option value="paid">Bezahlt</option>
              <option value="open">Offen</option>
            </select>
            <select
              data-expense-category-filter
              aria-label="Kategorie filtern"
              class="h-9 rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              [value]="categoryFilter()"
              (change)="setCategory($event)"
            >
              <option value="all">Alle Kategorien</option>
              @for (category of activeCategories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </div>

          @if (visibleExpenses().length > 0) {
            <div class="overflow-x-auto">
              <table class="linear-table w-full min-w-[1000px] text-[13px] tabular-nums">
                <thead class="bg-fb-well/60 font-semibold text-fb-text-secondary">
                  <tr>
                    <th scope="col" class="px-4 py-3">Datum</th>
                    <th scope="col" class="px-4 py-3">Beschreibung</th>
                    <th scope="col" class="px-4 py-3">Kategorie</th>
                    <th scope="col" class="px-4 py-3 text-right">Betrag</th>
                    <th scope="col" class="px-4 py-3">Status</th>
                    <th scope="col" class="px-4 py-3">Fällig / bezahlt</th>
                    <th scope="col" class="px-4 py-3">Wiederholung</th>
                    <th scope="col" class="px-4 py-3">Beleg</th>
                    <th scope="col" class="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-fb-line">
                  @for (expense of visibleExpenses(); track expense.id) {
                    <tr class="hover:bg-fb-surface-alt/60">
                      <td class="px-4 py-3 font-mono text-fb-text-secondary">
                        {{ formatDate(expense.expense_date) }}
                      </td>
                      <td class="px-4 py-3 font-semibold text-fb-text-primary">
                        {{ expense.title }}
                      </td>
                      <td class="px-4 py-3 text-fb-text-secondary">
                        {{ categoryName(expense.category_id) }}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-fb-text-primary">
                        {{ formatMoney(expense.gross_amount) }}
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class="rounded-full px-2 py-1 text-xs font-medium"
                          [class.text-fb-success]="expense.status === 'paid'"
                          [class.text-fb-text-secondary]="expense.status === 'open'"
                        >
                          {{ expense.status === 'paid' ? 'Bezahlt' : 'Offen' }}
                        </span>
                      </td>
                      <td class="px-4 py-3 font-mono text-fb-text-secondary">
                        {{
                          formatDate(
                            expense.status === 'paid' ? expense.paid_at : expense.due_date
                          ) || '–'
                        }}
                      </td>
                      <td class="px-4 py-3 text-fb-text-secondary">
                        {{ expense.recurring_rule_id ? 'Wiederkehrend' : 'Einmalig' }}
                      </td>
                      <td class="px-4 py-3 text-fb-text-secondary">–</td>
                      <td class="px-4 py-3 text-right text-fb-text-secondary">•••</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="px-4 py-10 text-center text-sm text-fb-text-muted">
              Keine Ausgaben für diese Auswahl.
            </p>
          }
        </section>
      } @else {
        <section class="linear-surface rounded-xl border border-fb-line">
          <div class="border-b border-fb-line px-4 py-3">
            <h2 class="text-sm font-semibold text-fb-text-primary">Wiederkehrende Ausgaben</h2>
            <p class="mt-1 text-xs text-fb-text-muted">
              Fixkosten werden erst bei Fälligkeit als echte Ausgabe erzeugt.
            </p>
          </div>
          @if (expenseService.recurringRules().length > 0) {
            <div class="overflow-x-auto">
              <table class="linear-table w-full min-w-[720px] text-[13px] tabular-nums">
                <thead class="bg-fb-well/60 font-semibold text-fb-text-secondary">
                  <tr>
                    <th class="px-4 py-3">Beschreibung</th>
                    <th class="px-4 py-3">Kategorie</th>
                    <th class="px-4 py-3 text-right">Betrag</th>
                    <th class="px-4 py-3">Intervall</th>
                    <th class="px-4 py-3">Nächste Fälligkeit</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-fb-line">
                  @for (rule of expenseService.recurringRules(); track rule.id) {
                    <tr>
                      <td class="px-4 py-3 font-semibold text-fb-text-primary">{{ rule.title }}</td>
                      <td class="px-4 py-3 text-fb-text-secondary">
                        {{ categoryName(rule.category_id) }}
                      </td>
                      <td class="px-4 py-3 text-right font-mono text-fb-text-primary">
                        {{ formatMoney(rule.gross_amount) }}
                      </td>
                      <td class="px-4 py-3 text-fb-text-secondary">
                        {{ intervalLabel(rule.interval) }}
                      </td>
                      <td class="px-4 py-3 font-mono text-fb-text-secondary">
                        {{ formatDate(rule.next_due_date) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="px-4 py-10 text-center text-sm text-fb-text-muted">
              Noch keine wiederkehrenden Ausgaben.
            </p>
          }
        </section>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent implements OnInit {
  readonly expenseService = inject(OperatingExpenseService);

  readonly activeTab = signal<ExpenseTab>('expenses');
  readonly search = signal('');
  readonly statusFilter = signal<ExpenseStatusFilter>('all');
  readonly categoryFilter = signal('all');

  readonly activeCategories = computed(() =>
    this.expenseService.categories().filter((category) => !category.archived_at),
  );

  readonly monthExpenses = computed(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
    return this.expenseService.expenses().filter((expense) => expense.expense_date.startsWith(prefix));
  });

  readonly summaries = computed(() => {
    const current = this.monthExpenses();
    const sum = (items: readonly OperatingExpense[]) =>
      items.reduce((total, expense) => total + Number(expense.gross_amount), 0);
    return [
      { label: 'Gesamt', value: sum(current) },
      { label: 'Bezahlt', value: sum(current.filter((expense) => expense.status === 'paid')) },
      { label: 'Offen', value: sum(current.filter((expense) => expense.status === 'open')) },
    ];
  });

  readonly visibleExpenses = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('de');
    return this.monthExpenses().filter((expense) => {
      if (this.statusFilter() !== 'all' && expense.status !== this.statusFilter()) return false;
      if (this.categoryFilter() !== 'all' && expense.category_id !== this.categoryFilter()) {
        return false;
      }
      return !query || expense.title.toLocaleLowerCase('de').includes(query);
    });
  });

  ngOnInit(): void {
    void this.expenseService.loadCurrentWorkspace();
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as ExpenseStatusFilter);
  }

  setCategory(event: Event): void {
    this.categoryFilter.set((event.target as HTMLSelectElement).value);
  }

  categoryName(categoryId: string): string {
    return this.expenseService.categories().find((category) => category.id === categoryId)?.name ?? '–';
  }

  intervalLabel(interval: keyof typeof OPERATING_EXPENSE_INTERVAL_LABELS): string {
    return OPERATING_EXPENSE_INTERVAL_LABELS[interval];
  }

  formatMoney(value: number): string {
    return euro.format(Number(value));
  }

  formatDate(value: string | null): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
  }
}
