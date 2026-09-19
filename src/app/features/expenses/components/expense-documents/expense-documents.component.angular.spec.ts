import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ExpenseDocumentsComponent } from './expense-documents.component';

describe('ExpenseDocumentsComponent', () => {
  it('lädt Belege der konkreten Ausgabe und bietet die erlaubten Belegarten an', async () => {
    const loadForExpense = vi.fn().mockResolvedValue(undefined);
    const injector = Injector.create({
      providers: [
        {
          provide: ExpenseDocumentService,
          useValue: {
            documents: signal([]),
            isLoading: signal(false),
            loadError: signal(null),
            loadForExpense,
            upload: vi.fn(),
            remove: vi.fn(),
            download: vi.fn(),
          },
        },
      ],
    });

    const component = runInInjectionContext(injector, () => new ExpenseDocumentsComponent());
    Object.defineProperty(component, 'expenseId', {
      configurable: true,
      value: () => 'expense-1',
    });

    await component.ngOnInit();

    expect(loadForExpense).toHaveBeenCalledWith('expense-1');
    expect(component.typeOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'invoice', label: 'Rechnung' }),
        expect.objectContaining({ value: 'receipt', label: 'Quittung' }),
      ]),
    );
  });

  it('lädt einen abgelegten Beleg über denselben Uploadpfad hoch', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: null });
    const injector = Injector.create({
      providers: [
        {
          provide: ExpenseDocumentService,
          useValue: {
            documents: signal([]),
            isLoading: signal(false),
            loadError: signal(null),
            loadForExpense: vi.fn().mockResolvedValue(undefined),
            upload,
            remove: vi.fn(),
            download: vi.fn(),
          },
        },
      ],
    });
    const component = runInInjectionContext(injector, () => new ExpenseDocumentsComponent());
    Object.defineProperty(component, 'expenseId', {
      configurable: true,
      value: () => 'expense-1',
    });
    const file = new File(['pdf'], 'rechnung.pdf', { type: 'application/pdf' });
    const preventDefault = vi.fn();

    await component.onDocumentDrop({
      preventDefault,
      dataTransfer: { files: [file] },
    } as unknown as DragEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith('expense-1', file, 'invoice');
  });
});
