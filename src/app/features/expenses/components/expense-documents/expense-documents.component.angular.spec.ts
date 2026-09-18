import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { OperatingExpenseDocument } from '../../../../core/models/operating-expense.models';
import { OperatingExpenseDocumentService } from '../../../../core/services/operating-expense-document.service';
import { ExpenseDocumentsComponent } from './expense-documents.component';

const document: OperatingExpenseDocument = {
  id: 'document-1',
  workspace_id: 'workspace-1',
  expense_id: 'expense-1',
  document_type: 'invoice',
  original_file_name: 'Rechnung.pdf',
  storage_path: 'operating-expense-documents/workspace-1/expense-1/document-1.pdf',
  mime_type: 'application/pdf',
  file_size: 1024,
  created_at: '2026-09-18T10:00:00.000Z',
  created_by: 'user-1',
};

const loadForExpense = vi.fn(async () => undefined);
const remove = vi.fn(async () => ({ error: null }));
const upload = vi.fn(async () => ({ data: document, error: null }));
const download = vi.fn(async () => ({ data: new Blob(['pdf']), error: null }));
const documents = signal<readonly OperatingExpenseDocument[]>([document]);

beforeEach(() => {
  loadForExpense.mockClear();
  remove.mockClear();
  upload.mockClear();
  download.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ExpenseDocumentsComponent],
    providers: [
      {
        provide: OperatingExpenseDocumentService,
        useValue: {
          documents,
          isLoading: signal(false),
          loadError: signal<string | null>(null),
          loadForExpense,
          remove,
          upload,
          download,
        },
      },
    ],
  });
});

describe('ExpenseDocumentsComponent', () => {
  it('lädt und zeigt private Belege der konkreten Ausgabe', async () => {
    const fixture = TestBed.createComponent(ExpenseDocumentsComponent);
    fixture.componentRef.setInput('expenseId', 'expense-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(loadForExpense).toHaveBeenCalledWith('expense-1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rechnung.pdf');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rechnung / Quittung');
  });

  it('bietet Upload und Entfernen am Beleg an', () => {
    const fixture = TestBed.createComponent(ExpenseDocumentsComponent);
    fixture.componentRef.setInput('expenseId', 'expense-1');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('input[type="file"]')).not.toBeNull();
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Entfernen')).toBe(true);
  });
});
