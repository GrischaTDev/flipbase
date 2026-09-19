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

const storedExpense: Expense = {
  id: 'expense-1',
  workspace_id: 'ws-1',
  category_id: 'cat-1',
  recurring_rule_id: null,
  occurrence_date: null,
  title: 'Versandkartons',
  vendor_name: 'Amazon',
  quantity: 10,
  gross_amount: 25,
  vat_rate: 19,
  expense_date: '2026-09-19',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-19',
  notes: null,
  deleted_at: null,
  created_at: '2026-09-19T06:00:00Z',
  created_by: 'user-1',
  updated_at: '2026-09-19T06:00:00Z',
};

function render(expense: Expense | null = null) {
  const create = vi.fn().mockResolvedValue({ data: storedExpense, error: null });
  const update = vi.fn().mockResolvedValue({ data: storedExpense, error: null });
  const upload = vi.fn().mockResolvedValue({ data: { id: 'document-1' }, error: null });
  const warning = vi.fn();

  const fixture = TestBed.configureTestingModule({
    imports: [ExpenseDialogComponent],
    providers: [
      { provide: ExpenseService, useValue: { create, update } },
      { provide: ExpenseDocumentService, useValue: { upload } },
      { provide: ToastService, useValue: { warning } },
      {
        provide: ExpenseCategoryService,
        useValue: {
          categories: signal([{ id: 'cat-1', name: 'Versandmaterial', is_archived: false }]),
        },
      },
    ],
  })
    .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
    .createComponent(ExpenseDialogComponent);

  fixture.componentRef.setInput('expense', expense);
  fixture.detectChanges();
  return { fixture, create, update, upload, warning };
}

describe('ExpenseDialogComponent', () => {
  it('startet neue Ausgaben mit Menge 1, 19 Prozent und bezahlt', () => {
    const { fixture } = render();
    const component = fixture.componentInstance;

    expect(component.form.controls.quantity.value).toBe(1);
    expect(component.form.controls.vat_rate.value).toBe(19);
    expect(component.form.controls.status.value).toBe('paid');
    expect(component.form.controls.payment_date.value).toBeTruthy();

    component.onStatusChanged('open');
    expect(component.form.controls.payment_date.value).toBeNull();
  });

  it('behält bei bestehenden Ausgaben eine fehlende MwSt-Angabe bei', () => {
    const { fixture } = render({ ...storedExpense, vat_rate: null });
    expect(fixture.componentInstance.form.controls.vat_rate.value).toBeNull();
  });

  it('speichert Anbieter, Menge und Gesamtbetrag und lädt einen vorgemerkten Beleg danach hoch', async () => {
    const { fixture, create, upload } = render();
    const component = fixture.componentInstance;
    const file = { name: 'rechnung.pdf', type: 'application/pdf', size: 1024 } as File;

    component.form.patchValue({
      title: 'Versandkartons',
      vendor_name: ' Amazon ',
      category_id: 'cat-1',
      quantity: 10,
      gross_amount: 25,
      vat_rate: 19,
      expense_date: '2026-09-19',
      status: 'paid',
      payment_date: '2026-09-19',
    });
    component.pendingDocument.set(file);

    await component.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_name: 'Amazon',
        quantity: 10,
        gross_amount: 25,
        vat_rate: 19,
      }),
    );
    expect(upload).toHaveBeenCalledWith(storedExpense.id, file, 'invoice');
  });

  it('schließt eine gespeicherte Ausgabe trotz fehlgeschlagenem optionalen Beleg nicht zurück', async () => {
    const { fixture, create, upload, warning } = render();
    upload.mockResolvedValue({ data: null, error: new Error('storage offline') });
    const component = fixture.componentInstance;
    component.form.patchValue({
      title: 'Versandkartons',
      category_id: 'cat-1',
      quantity: 1,
      gross_amount: 25,
      expense_date: '2026-09-19',
      status: 'paid',
      payment_date: '2026-09-19',
    });
    component.pendingDocument.set({
      name: 'rechnung.pdf',
      type: 'application/pdf',
      size: 1024,
    } as File);

    await component.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Ausgabe gespeichert, Beleg nicht hochgeladen.',
      'storage offline',
    );
  });
});
