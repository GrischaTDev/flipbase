import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TableSortHeaderComponent } from './table-sort-header.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('TableSortHeaderComponent', () => {
  let fixture: ComponentFixture<TableSortHeaderComponent<string>>;

  beforeEach(async () => {
    const metadata = (TableSortHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      label: ['label', 1, null],
      sortField: ['sortField', 1, null],
      currentSort: ['currentSort', 1, null],
      description: ['description', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      label: 'label',
      sortField: 'sortField',
      currentSort: 'currentSort',
      description: 'description',
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TableSortHeaderComponent] });
    fixture = TestBed.createComponent(TableSortHeaderComponent);
    fixture.componentRef.setInput('label', 'Erstellt');
    fixture.componentRef.setInput('sortField', 'created_at');
    fixture.componentRef.setInput('currentSort', { field: 'title', direction: 'desc' });
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (TableSortHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('renders an accessible sort button for an inactive field', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Erstellt');
    expect(button.getAttribute('aria-label')).toBe('Nach Erstellt sortieren');
    expect(button.getAttribute('data-table-sort-field')).toBe('created_at');
  });

  it('sorts a newly selected field ascending', () => {
    let emitted: unknown;
    fixture.componentInstance.sortChanged.subscribe((sort) => (emitted = sort));

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(emitted).toEqual({ field: 'created_at', direction: 'asc' });
  });

  it('toggles the active field between ascending and descending', () => {
    fixture.componentRef.setInput('currentSort', { field: 'created_at', direction: 'asc' });
    fixture.detectChanges();

    let emitted: unknown;
    fixture.componentInstance.sortChanged.subscribe((sort) => (emitted = sort));
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(emitted).toEqual({ field: 'created_at', direction: 'desc' });
  });
});
