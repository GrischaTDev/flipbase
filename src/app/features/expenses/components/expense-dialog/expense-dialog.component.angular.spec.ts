import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
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

describe('ExpenseDialogComponent', () => {
  it('startet eine neue Ausgabe bezahlt und schaltet offen ohne Zahlungsdatum', () => {
    const create = vi.fn();
    const fixture = TestBed.configureTestingModule({
      imports: [ExpenseDialogComponent],
      providers: [
        { provide: ExpenseService, useValue: { create, update: vi.fn() } },
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

    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.form.controls.status.value).toBe('paid');
    expect(component.form.controls.payment_date.value).toBeTruthy();

    component.onStatusChanged('open');

    expect(component.form.controls.status.value).toBe('open');
    expect(component.form.controls.payment_date.value).toBeNull();
  });
});
