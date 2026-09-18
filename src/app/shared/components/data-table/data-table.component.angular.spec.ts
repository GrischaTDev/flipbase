import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTableComponent } from './data-table.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
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
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;

    input.value = 'Nike';
    input.dispatchEvent(new Event('input', { bubbles: true }));
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
