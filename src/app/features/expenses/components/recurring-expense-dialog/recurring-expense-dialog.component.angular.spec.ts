import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseRecurringService } from '../../../../core/services/expense-recurring.service';
import { RecurringExpenseDialogComponent } from './recurring-expense-dialog.component';

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

afterEach(() => TestBed.resetTestingModule());

describe('RecurringExpenseDialogComponent', () => {
  it('startet monatlich mit Menge 1 und 19 Prozent und speichert Anbieter und Menge', async () => {
    const create = vi.fn().mockResolvedValue({
      data: { id: 'rule-1' },
      error: null,
    });
    const materializeDue = vi.fn().mockResolvedValue({ count: 1, error: null });

    const fixture = TestBed.configureTestingModule({
      imports: [RecurringExpenseDialogComponent],
      providers: [
        {
          provide: ExpenseRecurringService,
          useValue: { create, update: vi.fn(), materializeDue },
        },
        {
          provide: ExpenseCategoryService,
          useValue: {
            categories: signal([{ id: 'cat-1', name: 'Hosting & Server', is_archived: false }]),
          },
        },
      ],
    })
      .overrideComponent(RecurringExpenseDialogComponent, { set: { template: '' } })
      .createComponent(RecurringExpenseDialogComponent);

    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.form.controls.frequency.value).toBe('monthly');
    expect(component.form.controls.quantity.value).toBe(1);
    expect(component.form.controls.vat_rate.value).toBe(19);

    component.form.patchValue({
      title: 'Server',
      vendor_name: ' Netcup ',
      category_id: 'cat-1',
      quantity: 2,
      gross_amount: 29.9,
      start_date: '2026-09-18',
    });
    await component.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ vendor_name: 'Netcup', quantity: 2, gross_amount: 29.9 }),
    );
    expect(materializeDue).toHaveBeenCalled();
  });

  it('aktualisiert eine bereits gespeicherte Regel nach einem Fehler beim Erzeugen der Fälligkeiten', async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 'rule-1' }, error: null });
    const update = vi.fn().mockResolvedValue({ data: { id: 'rule-1' }, error: null });
    const materializeDue = vi
      .fn()
      .mockResolvedValueOnce({
        count: 0,
        error: { message: 'Die Fälligkeiten konnten nicht erzeugt werden.' },
      })
      .mockResolvedValueOnce({ count: 1, error: null });

    const fixture = TestBed.configureTestingModule({
      imports: [RecurringExpenseDialogComponent],
      providers: [
        {
          provide: ExpenseRecurringService,
          useValue: { create, update, materializeDue },
        },
        {
          provide: ExpenseCategoryService,
          useValue: {
            categories: signal([{ id: 'cat-1', name: 'Hosting & Server', is_archived: false }]),
          },
        },
      ],
    })
      .overrideComponent(RecurringExpenseDialogComponent, { set: { template: '' } })
      .createComponent(RecurringExpenseDialogComponent);

    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({
      title: 'Server',
      category_id: 'cat-1',
      quantity: 1,
      gross_amount: 29.9,
      start_date: '2026-09-18',
    });

    await component.save();
    await component.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'rule-1',
      expect.objectContaining({ title: 'Server', gross_amount: 29.9 }),
    );
    expect(materializeDue).toHaveBeenCalledTimes(2);
  });

  it('erzeugt keine Fälligkeiten, wenn die neue Regel nicht gespeichert werden konnte', async () => {
    const create = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Die Regel konnte nicht gespeichert werden.' },
    });
    const materializeDue = vi.fn();

    const fixture = TestBed.configureTestingModule({
      imports: [RecurringExpenseDialogComponent],
      providers: [
        {
          provide: ExpenseRecurringService,
          useValue: { create, update: vi.fn(), materializeDue },
        },
        {
          provide: ExpenseCategoryService,
          useValue: {
            categories: signal([{ id: 'cat-1', name: 'Hosting & Server', is_archived: false }]),
          },
        },
      ],
    })
      .overrideComponent(RecurringExpenseDialogComponent, { set: { template: '' } })
      .createComponent(RecurringExpenseDialogComponent);

    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({
      title: 'Server',
      category_id: 'cat-1',
      quantity: 1,
      gross_amount: 29.9,
      start_date: '2026-09-18',
    });

    await component.save();

    expect(materializeDue).not.toHaveBeenCalled();
  });
});
