import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Expense } from '../../../../core/models/expense.models';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ExpenseService } from '../../../../core/services/expense.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ExpenseDialogComponent } from './expense-dialog.component';

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

const existingExpense: Expense = {
  id: 'expense-1',
  workspace_id: 'workspace-1',
  category_id: 'cat-1',
  recurring_rule_id: null,
  occurrence_date: null,
  title: 'Paketband',
  vendor_name: null,
  quantity: 1,
  gross_amount: 12.5,
  vat_rate: null,
  expense_date: '2026-09-19',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-19',
  notes: null,
  deleted_at: null,
  created_at: '2026-09-19T06:00:00.000Z',
  created_by: 'user-1',
  updated_at: '2026-09-19T06:00:00.000Z',
};

function createFixture(options: {
  expense?: Expense | null;
  createResult?: { data: Expense | null; error: Error | null };
  uploadResult?: { data: null; error: Error | null };
} = {}) {
  const create = vi.fn(async () => options.createResult ?? { data: existingExpense, error: null });
  const update = vi.fn(async (id: string, changes: Partial<Expense>) => ({
    data: { ...existingExpense, ...changes, id },
    error: null,
  }));
  const upload = vi.fn(async () => options.uploadResult ?? { data: null, error: null });

  const fixture = TestBed.configureTestingModule({
    imports: [ExpenseDialogComponent],
    providers: [
      { provide: ExpenseService, useValue: { create, update } },
      { provide: ExpenseDocumentService, useValue: { upload } },
      { provide: ToastService, useValue: { warning: vi.fn() } },
      {
        provide: ExpenseCategoryService,
        useValue: {
          categories: signal([
            {
              id: 'cat-1',
              name: 'Versandmaterial',
              is_archived: false,
            },
          ]),
        },
      },
    ],
  })
    .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
    .createComponent(ExpenseDialogComponent);

  if (options.expense !== undefined) fixture.componentRef.setInput('expense', options.expense);
  fixture.detectChanges();

  return { fixture, component: fixture.componentInstance, create, update, upload };
}

function fillRequiredFields(component: ExpenseDialogComponent): void {
  component.form.patchValue({
    title: 'Versandkartons',
    vendor_name: '  Amazon  ',
    category_id: 'cat-1',
    quantity: 10,
    gross_amount: 25,
    expense_date: '2026-09-19',
    status: 'paid',
    payment_date: '2026-09-19',
  });
}

describe('ExpenseDialogComponent', () => {
  it('startet neue Ausgaben mit Menge 1, 19 % MwSt. und bezahlt', () => {
    const { component } = createFixture();

    expect(component.form.controls.quantity.value).toBe(1);
    expect(component.form.controls.vat_rate.value).toBe(19);
    expect(component.form.controls.status.value).toBe('paid');
    expect(component.form.controls.payment_date.value).toBeTruthy();

    component.onStatusChanged('open');

    expect(component.form.controls.status.value).toBe('open');
    expect(component.form.controls.payment_date.value).toBeNull();
  });

  it('bewahrt bei bestehenden Ausgaben eine unbekannte MwSt. unverändert', () => {
    const { component } = createFixture({ expense: existingExpense });

    expect(component.form.controls.vat_rate.value).toBeNull();
    expect(component.form.controls.quantity.value).toBe(1);
  });

  it('speichert Anbieter, Menge und Gesamtbetrag', async () => {
    const { component, create } = createFixture();
    fillRequiredFields(component);

    await component.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_name: 'Amazon',
        quantity: 10,
        gross_amount: 25,
        vat_rate: 19,
      }),
    );
  });

  it('speichert zuerst die Ausgabe und lädt danach den optionalen Beleg hoch', async () => {
    const created = { ...existingExpense, id: 'created-expense', vendor_name: 'Amazon', quantity: 10 };
    const { component, create, update, upload } = createFixture({
      createResult: { data: created, error: null },
      uploadResult: { data: null, error: new Error('Storage nicht erreichbar') },
    });
    fillRequiredFields(component);
    component.pendingDocument.set(
      new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' }),
    );

    await component.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith('created-expense', expect.any(File), 'invoice');
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(component.persistedExpense()?.id).toBe('created-expense');
    expect(component.errorMessage()).toContain('Ausgabe wurde gespeichert');
    expect(update).not.toHaveBeenCalled();

    upload.mockResolvedValueOnce({ data: null, error: null });
    await component.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('created-expense', expect.any(Object));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith('created-expense', expect.any(File), 'invoice');
  });

  it('akzeptiert keine Menge kleiner als 1', () => {
    const { component } = createFixture();
    component.form.controls.quantity.setValue(0);

    expect(component.form.controls.quantity.invalid).toBe(true);
  });
});
