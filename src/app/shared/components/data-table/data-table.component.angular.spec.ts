import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import axe from 'axe-core';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomSearchInputComponent } from '../custom-search-input/custom-search-input.component';
import { TableColumnMenuComponent } from '../table-column-menu/table-column-menu.component';
import { DataTableComponent } from './data-table.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });

  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'searchEnabled',
    'toolbarVisible',
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
    'loading',
    'errorMessage',
    'hasRows',
    'loadingText',
    'emptyTitle',
    'emptyText',
  ]);
  registerSignalInputs(CustomSearchInputComponent, [
    'value',
    'placeholder',
    'disabled',
    'clearable',
    'size',
    'variant',
    'id',
    'ariaLabel',
  ]);
  registerSignalInputs(TableColumnMenuComponent, [
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
  ]);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<DataTableComponent<string, string>>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DataTableComponent] });
    fixture = TestBed.createComponent(DataTableComponent<string, string>);
    fixture.detectChanges();
  });

  it('renders the shared surface and fixed toolbar order', () => {
    const root = fixture.nativeElement.querySelector('[data-data-table]') as HTMLElement;
    const toolbar = root.querySelector('[data-data-table-toolbar]') as HTMLElement;
    const children = Array.from(toolbar.children);

    expect(root).toBeTruthy();
    expect(
      children.map((child) =>
        child.getAttribute('data-data-table-view') !== null
          ? 'view'
          : child.getAttribute('data-data-table-search') !== null
            ? 'search'
            : child.getAttribute('data-data-table-filters') !== null
              ? 'filters'
              : 'settings',
      ),
    ).toEqual(['view', 'search', 'filters']);
  });

  it('renders table settings only when the complete settings contract is present', () => {
    expect(fixture.nativeElement.querySelector('[data-data-table-settings]')).toBeNull();

    fixture.componentRef.setInput('columns', [
      { id: 'title', label: 'Titel', visible: true, order: 0, locked: true },
    ]);
    fixture.componentRef.setInput('sortOptions', [
      { value: 'title', label: 'Titel', kind: 'text' },
    ]);
    fixture.componentRef.setInput('currentSort', { field: 'title', direction: 'asc' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-data-table-settings]')).toBeTruthy();
  });

  it('emits changed search values from the shared toolbar search', () => {
    const changed = vi.fn<(value: string) => void>();
    fixture.componentInstance.searchValueChange.subscribe(changed);
    const search = fixture.debugElement.query(By.directive(CustomSearchInputComponent));

    expect(search).not.toBeNull();
    search.triggerEventHandler('valueChange', 'Nike');
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledWith('Nike');
  });

  it('renders loading, error and empty states exclusively', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-data-table-loading]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-data-table-error]')).toBeNull();

    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('errorMessage', 'Laden fehlgeschlagen');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-data-table-error]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-data-table-empty]')).toBeNull();

    fixture.componentRef.setInput('errorMessage', null);
    fixture.componentRef.setInput('hasRows', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-data-table-empty]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-data-table-content]')).toBeNull();
  });

  it('passes axe without structural findings', async () => {
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
