import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  OPERATING_EXPENSE_INTERVAL_LABELS,
  OperatingExpense,
  OperatingExpenseInterval,
  OperatingExpenseStatus,
  OperatingExpenseVatRate,
} from '../../core/models/operating-expense.models';
import { OperatingExpenseService } from '../../core/services/operating-expense.service';
import { ExpenseDocumentsComponent } from './components/expense-documents/expense-documents.component';

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

type ExpenseTab = 'expenses' | 'recurring';
type ExpenseStatusFilter = 'all' | 'open' | 'paid';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [ReactiveFormsModule, ExpenseDocumentsComponent],
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
        <div class="mt-3 flex flex-wrap gap-2 sm:mt-0">
          <button
            type="button"
            class="fb-button linear-btn-secondary h-8 rounded-lg border border-fb-border px-3 text-[13px] font-semibold text-fb-text-secondary"
            (click)="showCategoryManager.set(true)"
          >
            Kategorien verwalten
          </button>
          <button
            type="button"
            class="fb-button linear-btn-primary h-8 rounded-lg px-4 text-[13px] font-semibold text-fb-on-accent"
            (click)="openExpenseForm()"
          >
            Ausgabe hinzufügen
          </button>
        </div>
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
                      <td class="px-4 py-3">
                        <button
                          type="button"
                          class="h-7 rounded-lg border border-fb-line px-2 text-xs text-fb-text-secondary"
                          (click)="documentExpenseId.set(expense.id)"
                        >
                          Belege
                        </button>
                      </td>
                      <td class="px-4 py-3 text-right">
                        @if (expense.status === 'open') {
                          <button
                            type="button"
                            class="h-7 rounded-lg border border-fb-line px-2 text-xs text-fb-text-secondary"
                            (click)="markPaid(expense)"
                          >
                            Als bezahlt
                          </button>
                        }
                      </td>
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
          <div class="flex flex-col gap-3 border-b border-fb-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-sm font-semibold text-fb-text-primary">Wiederkehrende Ausgaben</h2>
              <p class="mt-1 text-xs text-fb-text-muted">
                Fixkosten werden erst bei Fälligkeit als echte Ausgabe erzeugt.
              </p>
            </div>
            <button
              type="button"
              class="fb-button linear-btn-primary h-8 rounded-lg px-3 text-[13px] font-semibold text-fb-on-accent"
              (click)="openRecurringForm()"
            >
              Wiederkehrende Ausgabe hinzufügen
            </button>
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
      @if (documentExpenseId(); as expenseId) {
        <app-expense-documents
          [expenseId]="expenseId"
          (closed)="documentExpenseId.set(null)"
        />
      }

      @if (showExpenseForm()) {
        <div
          data-expense-form
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-form-title"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <form
            class="linear-surface w-full max-w-xl space-y-4 rounded-xl border border-fb-line p-5 shadow-xl"
            [formGroup]="expenseForm"
            (ngSubmit)="saveExpense()"
          >
            <div>
              <h2 id="expense-form-title" class="text-base font-semibold text-fb-text-primary">
                Ausgabe hinzufügen
              </h2>
              <p class="mt-1 text-xs text-fb-text-muted">
                Erfasse allgemeine Betriebskosten – keine Ware zum Weiterverkauf.
              </p>
            </div>

            @if (formError()) {
              <p role="alert" class="text-xs font-medium text-fb-critical">{{ formError() }}</p>
            }

            <label class="block text-xs font-medium text-fb-text-secondary">
              Beschreibung
              <input
                data-expense-title
                formControlName="title"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              />
            </label>

            <label class="block text-xs font-medium text-fb-text-secondary">
              Kategorie
              <select
                formControlName="categoryId"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              >
                <option value="">Kategorie auswählen</option>
                @for (category of activeCategories(); track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </label>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-xs font-medium text-fb-text-secondary">
                Bruttobetrag
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  formControlName="grossAmount"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
                />
              </label>
              <label class="block text-xs font-medium text-fb-text-secondary">
                MwSt.
                <select
                  formControlName="vatRate"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
                >
                  <option value="">Keine Angabe</option>
                  <option value="0">0 %</option>
                  <option value="7">7 %</option>
                  <option value="19">19 %</option>
                </select>
              </label>
            </div>

            <label class="block text-xs font-medium text-fb-text-secondary">
              Ausgabedatum / Rechnungsdatum
              <input
                type="date"
                formControlName="expenseDate"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              />
            </label>

            <div class="flex gap-2" role="group" aria-label="Zahlungsstatus">
              <button
                data-expense-paid
                type="button"
                class="h-8 rounded-lg border border-fb-line px-3 text-[13px]"
                [attr.aria-pressed]="expenseForm.controls.status.value === 'paid'"
                (click)="setExpenseStatus('paid')"
              >
                Bezahlt
              </button>
              <button
                type="button"
                class="h-8 rounded-lg border border-fb-line px-3 text-[13px]"
                [attr.aria-pressed]="expenseForm.controls.status.value === 'open'"
                (click)="setExpenseStatus('open')"
              >
                Offen
              </button>
            </div>

            @if (expenseForm.controls.status.value === 'paid') {
              <label class="block text-xs font-medium text-fb-text-secondary">
                Bezahlt am
                <input
                  type="date"
                  formControlName="paidAt"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
                />
              </label>
            } @else {
              <label class="block text-xs font-medium text-fb-text-secondary">
                Fällig am
                <input
                  type="date"
                  formControlName="dueDate"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
                />
              </label>
            }

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="h-8 rounded-lg border border-fb-line px-3 text-[13px] text-fb-text-secondary"
                (click)="showExpenseForm.set(false)"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                class="linear-btn-primary h-8 rounded-lg px-4 text-[13px] font-semibold text-fb-on-accent"
              >
                Speichern
              </button>
            </div>
          </form>
        </div>
      }

      @if (showRecurringForm()) {
        <div
          data-recurring-form
          role="dialog"
          aria-modal="true"
          aria-labelledby="recurring-form-title"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <form
            class="linear-surface w-full max-w-xl space-y-4 rounded-xl border border-fb-line p-5 shadow-xl"
            [formGroup]="recurringForm"
            (ngSubmit)="saveRecurringRule()"
          >
            <h2 id="recurring-form-title" class="text-base font-semibold text-fb-text-primary">
              Wiederkehrende Ausgabe hinzufügen
            </h2>
            <label class="block text-xs font-medium text-fb-text-secondary">
              Beschreibung
              <input
                formControlName="title"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              />
            </label>
            <label class="block text-xs font-medium text-fb-text-secondary">
              Kategorie
              <select
                formControlName="categoryId"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              >
                <option value="">Kategorie auswählen</option>
                @for (category of activeCategories(); track category.id) {
                  <option [value]="category.id">{{ category.name }}</option>
                }
              </select>
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-xs font-medium text-fb-text-secondary">
                Bruttobetrag
                <input type="number" min="0.01" step="0.01" formControlName="grossAmount"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary" />
              </label>
              <label class="block text-xs font-medium text-fb-text-secondary">
                MwSt.
                <select formControlName="vatRate"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary">
                  <option value="">Keine Angabe</option>
                  <option value="0">0 %</option>
                  <option value="7">7 %</option>
                  <option value="19">19 %</option>
                </select>
              </label>
            </div>
            <label class="block text-xs font-medium text-fb-text-secondary">
              Intervall
              <select formControlName="interval"
                class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary">
                <option value="monthly">Monatlich</option>
                <option value="quarterly">Quartalsweise</option>
                <option value="yearly">Jährlich</option>
              </select>
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-xs font-medium text-fb-text-secondary">
                Startdatum
                <input type="date" formControlName="startDate"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary" />
              </label>
              <label class="block text-xs font-medium text-fb-text-secondary">
                Enddatum (optional)
                <input type="date" formControlName="endDate"
                  class="mt-1 h-9 w-full rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary" />
              </label>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" class="h-8 rounded-lg border border-fb-line px-3 text-[13px]"
                (click)="showRecurringForm.set(false)">Abbrechen</button>
              <button type="submit" class="linear-btn-primary h-8 rounded-lg px-4 text-[13px] font-semibold text-fb-on-accent">
                Speichern
              </button>
            </div>
          </form>
        </div>
      }

      @if (showCategoryManager()) {
        <div
          data-category-manager
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-manager-title"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <div class="linear-surface w-full max-w-xl space-y-4 rounded-xl border border-fb-line p-5 shadow-xl">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 id="category-manager-title" class="text-base font-semibold text-fb-text-primary">
                  Kategorien verwalten
                </h2>
                <p class="mt-1 text-xs text-fb-text-muted">
                  Eigene Kategorien anlegen oder bestehende umbenennen und archivieren.
                </p>
              </div>
              <button type="button" class="text-sm text-fb-text-muted" (click)="showCategoryManager.set(false)">✕</button>
            </div>

            <form class="flex gap-2" (ngSubmit)="createCategory()">
              <input
                [formControl]="newCategoryName"
                placeholder="Neue Kategorie"
                aria-label="Neue Kategorie"
                class="h-9 flex-1 rounded-lg border border-fb-line bg-fb-surface px-3 text-[13px] text-fb-text-primary"
              />
              <button type="submit" class="linear-btn-primary h-9 rounded-lg px-3 text-[13px] font-semibold text-fb-on-accent">
                Kategorie hinzufügen
              </button>
            </form>

            <div class="max-h-80 space-y-2 overflow-y-auto">
              @for (category of expenseService.categories(); track category.id) {
                <div class="flex items-center gap-2 rounded-lg border border-fb-line p-2">
                  <input
                    [value]="category.name"
                    [disabled]="!!category.archived_at"
                    aria-label="Kategoriename"
                    class="h-8 flex-1 rounded-md border border-fb-line bg-fb-surface px-2 text-[13px] text-fb-text-primary disabled:opacity-50"
                    (change)="renameCategory(category.id, $event)"
                  />
                  @if (!category.archived_at) {
                    <button type="button" class="h-8 rounded-md px-2 text-xs text-fb-text-secondary"
                      (click)="archiveCategory(category.id)">Archivieren</button>
                  }
                </div>
              }
            </div>
          </div>
        </div>
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
  readonly showExpenseForm = signal(false);
  readonly showRecurringForm = signal(false);
  readonly showCategoryManager = signal(false);
  readonly formError = signal<string | null>(null);
  readonly documentExpenseId = signal<string | null>(null);

  readonly expenseForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    grossAmount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vatRate: new FormControl<string>(''),
    expenseDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl<OperatingExpenseStatus>('paid', { nonNullable: true }),
    dueDate: new FormControl<string | null>(null),
    paidAt: new FormControl<string | null>(this.today()),
  });

  readonly recurringForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    grossAmount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vatRate: new FormControl<string>(''),
    interval: new FormControl<OperatingExpenseInterval>('monthly', { nonNullable: true }),
    startDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl<string | null>(null),
  });

  readonly newCategoryName = new FormControl('', { nonNullable: true });

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

  async markPaid(expense: OperatingExpense): Promise<void> {
    await this.expenseService.markPaid(expense, this.today());
  }

  openExpenseForm(): void {
    const today = this.today();
    this.formError.set(null);
    this.expenseForm.reset({
      title: '',
      categoryId: '',
      grossAmount: null,
      vatRate: '',
      expenseDate: today,
      status: 'paid',
      dueDate: null,
      paidAt: today,
    });
    this.showExpenseForm.set(true);
  }

  setExpenseStatus(status: OperatingExpenseStatus): void {
    this.expenseForm.controls.status.setValue(status);
    if (status === 'paid') {
      this.expenseForm.controls.dueDate.setValue(null);
      this.expenseForm.controls.paidAt.setValue(
        this.expenseForm.controls.paidAt.value ?? this.expenseForm.controls.expenseDate.value,
      );
    } else {
      this.expenseForm.controls.paidAt.setValue(null);
    }
  }

  async saveExpense(): Promise<void> {
    if (this.expenseForm.invalid || this.expenseForm.controls.grossAmount.value === null) {
      this.formError.set('Bitte fülle die Pflichtfelder aus.');
      return;
    }
    const value = this.expenseForm.getRawValue();
    const result = await this.expenseService.createExpense({
      categoryId: value.categoryId,
      title: value.title,
      grossAmount: value.grossAmount,
      vatRate: this.vatRate(value.vatRate),
      expenseDate: value.expenseDate,
      status: value.status,
      dueDate: value.status === 'open' ? value.dueDate : null,
      paidAt: value.status === 'paid' ? value.paidAt : null,
    });
    if (result.error) {
      this.formError.set(result.error.message);
      return;
    }
    this.showExpenseForm.set(false);
  }

  openRecurringForm(): void {
    this.recurringForm.reset({
      title: '',
      categoryId: '',
      grossAmount: null,
      vatRate: '',
      interval: 'monthly',
      startDate: this.today(),
      endDate: null,
    });
    this.showRecurringForm.set(true);
  }

  async saveRecurringRule(): Promise<void> {
    if (this.recurringForm.invalid || this.recurringForm.controls.grossAmount.value === null) return;
    const value = this.recurringForm.getRawValue();
    const result = await this.expenseService.createRecurringRule({
      categoryId: value.categoryId,
      title: value.title,
      grossAmount: value.grossAmount,
      vatRate: this.vatRate(value.vatRate),
      interval: value.interval,
      startDate: value.startDate,
      endDate: value.endDate || null,
    });
    if (!result.error) this.showRecurringForm.set(false);
  }

  async createCategory(): Promise<void> {
    const name = this.newCategoryName.value.trim();
    if (!name) return;
    const result = await this.expenseService.createCategory(name);
    if (!result.error) this.newCategoryName.setValue('');
  }

  async renameCategory(categoryId: string, event: Event): Promise<void> {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) return;
    await this.expenseService.renameCategory(categoryId, name);
  }

  async archiveCategory(categoryId: string): Promise<void> {
    await this.expenseService.archiveCategory(categoryId);
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

  private vatRate(value: string): OperatingExpenseVatRate {
    if (value === '') return null;
    const parsed = Number(value);
    return parsed === 0 || parsed === 7 || parsed === 19 ? parsed : null;
  }

  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }

  formatDate(value: string | null): string {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
  }
}
