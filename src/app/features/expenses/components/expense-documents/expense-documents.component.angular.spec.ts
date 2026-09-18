import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExpenseDocumentService } from '../../../../core/services/expense-document.service';
import { ExpenseDocumentsComponent } from './expense-documents.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let metadata: AngularInputMetadata;
let originalInputs: Record<string, unknown>;
let originalDeclaredInputs: Record<string, string>;

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource nicht eindeutig: ${url}`);
    return readFile(matches[0], 'utf8');
  });

  metadata = (ExpenseDocumentsComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  originalInputs = metadata.inputs;
  originalDeclaredInputs = metadata.declaredInputs;
  metadata.inputs = {
    ...metadata.inputs,
    expenseId: ['expenseId', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    expenseId: 'expenseId',
  };
});

afterAll(() => {
  metadata.inputs = originalInputs;
  metadata.declaredInputs = originalDeclaredInputs;
});

describe('ExpenseDocumentsComponent', () => {
  it('lädt Belege der konkreten Ausgabe und bietet Upload an', async () => {
    const loadForExpense = vi.fn().mockResolvedValue(undefined);
    const fixture = TestBed.configureTestingModule({
      imports: [ExpenseDocumentsComponent],
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
    })
      .overrideComponent(ExpenseDocumentsComponent, {
        set: { template: '<button type="button">Beleg hinzufügen</button>' },
      })
      .createComponent(ExpenseDocumentsComponent);

    fixture.componentRef.setInput('expenseId', 'expense-1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(loadForExpense).toHaveBeenCalledWith('expense-1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Beleg hinzufügen');
  });
});
