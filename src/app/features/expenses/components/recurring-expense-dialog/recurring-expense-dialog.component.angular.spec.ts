import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('RecurringExpenseDialogComponent', () => {
  it('startet monatlich und materialisiert nach erfolgreichem Speichern', async () => {
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
      vendor_name: 'Netcup',
      category_id: 'cat-1',
      quantity: 2,
      gross_amount: 29.9,
      start_date: '2026-09-18',
    });
    await component.save();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_name: 'Netcup',
        quantity: 2,
        vat_rate: 19,
      }),
    );
    expect(materializeDue).toHaveBeenCalled();
  });
});
