import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Expense } from '../../../../core/models/expense.models';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ExpenseService } from '../../../../core/services/expense.service';
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
  workspace_id: 'ws-1',
  category_id: 'cat-1',
  recurring_rule_id: null,
  occurrence_date: null,
  title: 'Paketband',
  vendor_name: null,
  quantity: 2,
  gross_amount: 25,
  vat_rate: null,
  expense_date: '2026-09-18',
  due_date: null,
  status: 'paid',
  payment_date: '2026-09-18',
  notes: null,
  deleted_at: null,
  created_at: '2026-09-18T00:00:00Z',
  created_by: 'user-1',
  updated_at: '2026-09-18T00:00:00Z',
};

function createFixture(
  create = vi.fn(),
  update = vi.fn(),
  upload = vi.fn().mockResolvedValue({ data: null, error: null }),
) {
  return TestBed.configureTestingModule({
    imports: [ExpenseDialogComponent],
    providers: [
      { provide: ExpenseService, useValue: { create, update } },
      { provide: ExpenseDocumentService, useValue: { upload } },
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
  });
}

describe('ExpenseDialogComponent', () => {
  it('startet eine neue Ausgabe bezahlt, mit Menge 1 und 19 Prozent MwSt.', () => {
    const fixture = createFixture()
      .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseDialogComponent);

    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.form.controls.status.value).toBe('paid');
    expect(component.form.controls.payment_date.value).toBeTruthy();
    expect(component.form.controls.quantity.value).toBe(1);
    expect(component.form.controls.vat_rate.value).toBe(19);

    component.onStatusChanged('open');

    expect(component.form.controls.status.value).toBe('open');
    expect(component.form.controls.payment_date.value).toBeNull();
  });

  it('bewahrt eine bestehende unbekannte MwSt-Angabe beim Bearbeiten', () => {
    const fixture = createFixture()
      .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseDialogComponent);
    fixture.componentRef.setInput('expense', existingExpense);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.vat_rate.value).toBeNull();
    expect(fixture.componentInstance.form.controls.quantity.value).toBe(2);
  });

  it('speichert Händler bereinigt, Menge separat und Gesamtbetrag unverändert', async () => {
    const create = vi.fn().mockResolvedValue({
      data: existingExpense,
      error: null,
    });
    const fixture = createFixture(create)
      .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      title: 'Versandkartons',
      vendor_name: '  Büromarkt  ',
      category_id: 'cat-1',
      quantity: 10,
      gross_amount: 25,
      vat_rate: 19,
    });
    await fixture.componentInstance.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Versandkartons',
        vendor_name: 'Büromarkt',
        quantity: 10,
        gross_amount: 25,
        vat_rate: 19,
      }),
    );
  });

  it('lädt einen vorgemerkten Beleg erst nach erfolgreicher Neuanlage hoch', async () => {
    const createdExpense = { ...existingExpense, id: 'created-expense' };
    const create = vi.fn().mockResolvedValue({ data: createdExpense, error: null });
    const upload = vi.fn().mockResolvedValue({
      data: { id: 'document-1' },
      error: null,
    });
    const fixture = createFixture(create, vi.fn(), upload)
      .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      title: 'Versandkartons',
      category_id: 'cat-1',
      quantity: 10,
      gross_amount: 25,
    });
    const document = new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' });
    fixture.componentInstance.selectPendingDocument(document);

    expect(upload).not.toHaveBeenCalled();

    await fixture.componentInstance.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith('created-expense', document, 'invoice');
  });

  it('erstellt bei erneutem Speichern nach Belegfehler keine doppelte Ausgabe', async () => {
    const createdExpense = { ...existingExpense, id: 'created-expense' };
    const create = vi.fn().mockResolvedValue({ data: createdExpense, error: null });
    const update = vi.fn().mockResolvedValue({ data: createdExpense, error: null });
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('Storage nicht erreichbar') })
      .mockResolvedValueOnce({ data: { id: 'document-1' }, error: null });
    const fixture = createFixture(create, update, upload)
      .overrideComponent(ExpenseDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseDialogComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({
      title: 'Versandkartons',
      category_id: 'cat-1',
      quantity: 10,
      gross_amount: 25,
    });
    fixture.componentInstance.selectPendingDocument(
      new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' }),
    );

    await fixture.componentInstance.save();
    expect(fixture.componentInstance.errorMessage()).toContain('Ausgabe wurde gespeichert');
    expect(create).toHaveBeenCalledTimes(1);

    await fixture.componentInstance.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('benennt den Betrag als Gesamtbetrag und hält Steuerdetails sekundär', async () => {
    const template = await readFile(
      new URL('./expense-dialog.component.html', import.meta.url),
      'utf8',
    );

    expect(template).toContain('Gesamtbetrag');
    expect(template).toContain('Steuerdetails ändern');
    expect(template).not.toContain('>Bruttobetrag<');
  });
});
