import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TableColumnMenuComponent } from './table-column-menu.component';
import {
  ColumnDefinition,
  SortFieldOption,
  TableSortState,
} from '../../../core/models/table-preferences.models';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('TableColumnMenuComponent', () => {
  let component: TableColumnMenuComponent<string, string>;
  let fixture: ComponentFixture<TableColumnMenuComponent<string, string>>;

  const mockColumns: ColumnDefinition<string>[] = [
    { id: 'title', label: 'Titel', visible: true, locked: true, order: 0 },
    { id: 'price', label: 'Preis', visible: true, locked: false, order: 1 },
    { id: 'status', label: 'Status', visible: false, locked: false, order: 2 },
  ];

  const mockSortOptions: SortFieldOption<string>[] = [
    { value: 'date', label: 'Datum', kind: 'date' },
    { value: 'price', label: 'Preis', kind: 'number' },
  ];

  const mockSort: TableSortState<string> = {
    field: 'date',
    direction: 'desc',
  };

  beforeEach(async () => {
    const metadata = (TableColumnMenuComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      columns: ['columns', 1, null],
      sortOptions: ['sortOptions', 1, null],
      currentSort: ['currentSort', 1, null],
      viewModified: ['viewModified', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      columns: 'columns',
      sortOptions: 'sortOptions',
      currentSort: 'currentSort',
      viewModified: 'viewModified',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableColumnMenuComponent],
    });

    fixture = TestBed.createComponent(TableColumnMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('columns', mockColumns);
    fixture.componentRef.setInput('sortOptions', mockSortOptions);
    fixture.componentRef.setInput('currentSort', mockSort);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (TableColumnMenuComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should render trigger button with aria-expanded="false" initially', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-expanded]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('should toggle popover on click', () => {
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-expanded]');
    btn.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();

    btn.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });

  it('should emit a direction selected from the sort menu', () => {
    component.toggleOpen();
    fixture.detectChanges();

    let emittedSort: TableSortState<string> | undefined;
    component.sortChanged.subscribe((sort) => {
      emittedSort = sort;
    });

    component.selectSortDirection('asc');
    expect(emittedSort).toEqual({ field: 'date', direction: 'asc' });
  });

  it('should use the custom sort listbox and emit the selected field', () => {
    component.toggleOpen();
    fixture.detectChanges();

    let emittedSort: TableSortState<string> | undefined;
    component.sortChanged.subscribe((sort) => {
      emittedSort = sort;
    });

    const sortFieldButton = fixture.nativeElement.querySelector(
      '[aria-label="Sortierfeld"]',
    ) as HTMLButtonElement;
    sortFieldButton.click();
    fixture.detectChanges();

    const priceOption = Array.from(fixture.nativeElement.querySelectorAll('[role="option"]')).find(
      (option: unknown) => (option as HTMLElement).textContent?.includes('Preis'),
    ) as HTMLButtonElement | undefined;
    expect(priceOption).toBeTruthy();
    priceOption?.click();

    expect(emittedSort).toEqual({ field: 'price', direction: 'desc' });
    expect(component.isSortMenuOpen()).toBe(false);
  });

  it('should keep the sort control inline and the direction choices in the sort popover', () => {
    component.toggleOpen();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('[data-sort-trigger]')).toBeTruthy();
    expect(dialog.querySelector('[data-popover-focus]')).toBeTruthy();
    expect(dialog.querySelector('.linear-input')).toBeNull();
    expect(dialog.querySelector('[title*="Aufsteigend"]')).toBeNull();

    (dialog.querySelector('[data-sort-trigger]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-sort-menu]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('[role="listbox"]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('[role="option"]')).toHaveLength(4);
    expect(fixture.nativeElement.textContent).toContain('Älteste zuerst');
    expect(fixture.nativeElement.textContent).toContain('Neueste zuerst');
  });

  it('should show and emit the adjacent view reset action only for a modified view', () => {
    expect(
      (fixture.nativeElement.querySelector('[data-view-reset]') as HTMLButtonElement).disabled,
    ).toBe(true);

    fixture.componentRef.setInput('viewModified', true);
    fixture.detectChanges();
    const reset = fixture.nativeElement.querySelector('[data-view-reset]') as HTMLButtonElement;
    expect(reset).toBeTruthy();

    let emitted = false;
    component.viewResetRequested.subscribe(() => (emitted = true));
    reset.click();
    expect(emitted).toBe(true);
  });

  it('should render the panel as a viewport overlay', () => {
    component.toggleOpen();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.classList.contains('fixed')).toBe(true);
    expect(dialog.classList.contains('overflow-y-auto')).toBe(true);
    expect(dialog.style.maxHeight).toBeTruthy();
  });

  it('should emit columnVisibilityToggled when an optional column is clicked', () => {
    component.toggleOpen();
    fixture.detectChanges();

    let toggledCol: string | undefined;
    component.columnVisibilityToggled.subscribe((colId) => {
      toggledCol = colId;
    });

    const eyeButtons = fixture.nativeElement.querySelectorAll('ul li button');
    // Click the eye button of the first non-mandatory column
    const toggleBtn = Array.from(eyeButtons).find(
      (b: unknown) =>
        (b as HTMLElement).getAttribute('title') === 'Ausblenden' ||
        (b as HTMLElement).getAttribute('title') === 'Einblenden',
    ) as HTMLButtonElement | undefined;

    expect(toggleBtn).toBeTruthy();
    toggleBtn?.click();
    expect(toggledCol).toBe('price');
  });

  it('should emit resetRequested when standard button is clicked', () => {
    component.toggleOpen();
    fixture.detectChanges();

    let resetEmitted = false;
    component.resetRequested.subscribe(() => {
      resetEmitted = true;
    });

    const standardBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b: unknown) => (b as HTMLElement).textContent?.trim() === 'Standard',
    ) as HTMLButtonElement | undefined;

    expect(standardBtn).toBeTruthy();
    standardBtn?.click();
    expect(resetEmitted).toBe(true);
  });

  it('should close popover on escape key', () => {
    component.toggleOpen();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    component.onEscapePressed();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });
});
