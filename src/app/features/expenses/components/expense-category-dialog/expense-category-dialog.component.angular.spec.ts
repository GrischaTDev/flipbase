import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ExpenseCategoryService } from '../../../../core/services/expense-category.service';
import { ExpenseCategoryDialogComponent } from './expense-category-dialog.component';

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });
});

describe('ExpenseCategoryDialogComponent', () => {
  it('legt eine eigene Kategorie an und leert danach die Eingabe', async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 'custom' }, error: null });
    const fixture = TestBed.configureTestingModule({
      imports: [ExpenseCategoryDialogComponent],
      providers: [
        {
          provide: ExpenseCategoryService,
          useValue: {
            allCategories: signal([]),
            create,
            rename: vi.fn(),
            archive: vi.fn(),
            restore: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(ExpenseCategoryDialogComponent, { set: { template: '' } })
      .createComponent(ExpenseCategoryDialogComponent);

    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.newName.set('Lager');
    await component.createCategory();

    expect(create).toHaveBeenCalledWith('Lager');
    expect(component.newName()).toBe('');
  });
});
