import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SniperQueryEditorComponent } from './sniper-query-editor.component';
import { VintedCategoryPickerComponent } from '../vinted-category-picker/vinted-category-picker.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { VintedCategoryService } from '../../services/vinted-category.service';
import type { SniperQuery } from '../../models/sniper-query.model';
import { VintedBrandSearchService } from '../../services/vinted-brand-search.service';
import { QueryDraft } from '../../models/sniper-query.model';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { SearchMultiSelectComponent } from '../../../../shared/components/search-multi-select/search-multi-select.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const snapshots = new Map<unknown, AngularInputMetadata>();
function registerSignalInputs(
  component: unknown,
  names: readonly string[],
  outputNames: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  snapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//u, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(CategoryPickerComponent, ['source', 'label', 'placeholder', 'helpText']);
  registerSignalInputs(
    SniperQueryEditorComponent,
    ['query', 'saving', 'saveError'],
    ['saved', 'cancelled'],
  );
  registerSignalInputs(
    VintedCategoryPickerComponent,
    ['categories', 'value', 'disabled'],
    ['valueChange'],
  );
  (VintedCategoryPickerComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp.outputs[
    'valueChange'
  ] = 'value';
  registerSignalInputs(
    CustomSelectComponent,
    ['options', 'value', 'disabled', 'ariaLabel', 'searchable', 'placeholder', 'triggerId'],
    ['valueChange'],
  );
  (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp.outputs['valueChange'] =
    'value';
  registerSignalInputs(NumberInputComponent, ['id', 'min', 'max', 'ariaLabel']);
  registerSignalInputs(TextFieldComponent, [
    'id',
    'label',
    'placeholder',
    'multiline',
    'type',
    'maxLength',
    'helpText',
  ]);
  registerSignalInputs(
    ButtonComponent,
    ['disabled', 'loading', 'icon', 'ariaLabel', 'iconPosition'],
    ['clicked'],
  );
  registerSignalInputs(
    CustomSearchInputComponent,
    [
      'inputRole',
      'expanded',
      'controlsId',
      'activeDescendantId',
      'maxLength',
      'clearOnEscape',
      'ariaLabel',
      'placeholder',
      'value',
      'size',
    ],
    ['valueChange'],
  );
  (CustomSearchInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp.outputs[
    'valueChange'
  ] = 'value';
  registerSignalInputs(
    SearchMultiSelectComponent,
    [
      'controlId',
      'label',
      'placeholder',
      'searchPlaceholder',
      'helpText',
      'emptyText',
      'singularLabel',
      'pluralLabel',
      'options',
      'selectedCount',
      'loading',
      'error',
      'disabled',
    ],
    ['opened', 'searchTermChange', 'optionSelected', 'retry'],
  );
});

afterAll(() => {
  for (const [component, snapshot] of snapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
});

const categories = [
  { id: 1, parentId: null, title: 'Herren', path: 'Herren' },
  { id: 2, parentId: 1, title: 'Kleidung', path: 'Herren > Kleidung' },
  { id: 3, parentId: 2, title: 'Jacken', path: 'Herren > Kleidung > Jacken' },
  { id: 4, parentId: null, title: 'Damen', path: 'Damen' },
  { id: 5, parentId: 4, title: 'Jacken', path: 'Damen > Jacken' },
];
const status = {
  refreshedAt: '2026-10-05T19:00:00Z',
  requestedAt: null,
  lastAttemptAt: null,
  categoryCount: 5,
  lastError: null,
};

describe('central search filter editor', () => {
  let fixture: ComponentFixture<SniperQueryEditorComponent>;
  const search = vi.fn(async (_term: string) => [
    { id: 53, name: 'Nike' },
    { id: 14, name: 'Adidas' },
  ]);
  const readSnapshot = vi.fn(async () => ({ categories, status }));
  async function build(query: SniperQuery | null = null) {
    TestBed.configureTestingModule({
      imports: [SniperQueryEditorComponent],
      providers: [
        { provide: VintedBrandSearchService, useValue: { search } },
        { provide: VintedCategoryService, useValue: { readSnapshot } },
      ],
    });
    fixture = TestBed.createComponent(SniperQueryEditorComponent);
    fixture.componentRef.setInput('query', query);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    search.mockClear();
    readSnapshot.mockClear();
    vi.useRealTimers();
  });

  it('uses shared controls and emits a category-only filter, not a forced brand search', async () => {
    const component = await build();
    const drafts: QueryDraft[] = [];
    component.saved.subscribe((draft) => drafts.push(draft));
    component.form.controls.title.setValue('Herrenjacken');
    component.categoryChanged(3);
    fixture.detectChanges();
    component.submit();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: 'Herrenjacken',
      catalogId: 3,
      brands: [],
      brandId: null,
      titleKeywords: [],
      revision: null,
    });
    expect(component.summary()).toContain('Herren > Kleidung > Jacken');
    expect(search).not.toHaveBeenCalled();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('app-text-field').length).toBeGreaterThan(1);
    expect(host.querySelector('app-vinted-category-picker')).not.toBeNull();
  });
  it('restores every saved condition and revision when editing', async () => {
    const query = {
      id: 'saved',
      title: 'Nike Jacken',
      catalog_id: 3,
      brand_id: 53,
      brand_ids: [53],
      brand_names: ['Nike'],
      title_keywords: ['vintage', 'trackpants'],
      keyword_mode: 'any',
      filter_revision: 8,
      poll_interval_ms: 30000,
      notes: 'Notiz',
      search_text: 'Sport',
      price_from: 10,
      price_to: 45,
    } as SniperQuery;
    const component = await build(query);
    const drafts: QueryDraft[] = [];
    component.saved.subscribe((draft) => drafts.push(draft));
    component.submit();
    expect(drafts[0]).toEqual({
      id: 'saved',
      title: 'Nike Jacken',
      catalogId: 3,
      brandId: 53,
      brands: [{ id: 53, name: 'Nike' }],
      titleKeywords: ['vintage', 'trackpants'],
      keywordMode: 'any',
      intervalSeconds: 30,
      notes: 'Notiz',
      revision: 8,
      searchText: 'Sport',
      priceFrom: 10,
      priceTo: 45,
    });
    expect(component.hasUnsavedChanges()).toBe(false);
  });
  it('keeps unavailable categories selected and refuses to silently broaden them', async () => {
    const component = await build({
      id: 'saved',
      title: 'Jacken',
      catalog_id: 999,
      brand_id: 53,
      poll_interval_ms: 20000,
    } as SniperQuery);
    const drafts: QueryDraft[] = [];
    component.saved.subscribe((draft) => drafts.push(draft));
    component.submit();
    expect(component.catalogId()).toBe(999);
    expect(drafts).toEqual([]);
    expect(component.error()).toContain('Kategorie ist nicht verfügbar');
  });
  it('includes a pending title word on save and deduplicates case and spacing', async () => {
    const component = await build();
    const drafts: QueryDraft[] = [];
    component.saved.subscribe((draft) => drafts.push(draft));
    component.form.controls.title.setValue('Vintage');
    component.form.controls.keywordEntry.setValue(' VINTAGE ');
    component.addKeyword();
    component.form.controls.keywordEntry.setValue('vintage');
    component.submit();
    expect(drafts[0]).toMatchObject({ brands: [], catalogId: null, titleKeywords: ['vintage'] });
  });
  it('does not show random default brands and keeps the same brand available for another filter', async () => {
    const component = await build();
    component.brandSearchChanged('N');
    await component.searchBrands();
    expect(search).not.toHaveBeenCalled();
    component.brandTerm.set('Nike');
    await component.searchBrands();
    expect(component.brandOptions()).toContainEqual({ value: 53, label: 'Nike' });
    component.addBrand({ value: 53, label: 'Nike' });
    expect(component.brands()).toEqual([{ id: 53, name: 'Nike' }]);
    expect(component.brandOptions().some((option) => option.value === 53)).toBe(false);
    component.removeBrand(53);
    expect(component.brandOptions().some((option) => option.value === 53)).toBe(true);
  });
  it('does not cancel the native keyboard action of the search reset button', async () => {
    await build();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const input = host.querySelector<HTMLInputElement>('app-search-multi-select input')!;
    expect(input).not.toBeNull();
    input.value = 'Nike';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const clear = host.querySelector<HTMLButtonElement>('button[title="Suche zurücksetzen"]')!;
    expect(clear).not.toBeNull();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    clear.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it('keeps earlier categories if refreshing fails', async () => {
    const component = await build();
    readSnapshot.mockRejectedValueOnce(new Error('offline'));
    await component.loadCategories();
    expect(component.categories()).toEqual(categories);
    expect(component.categoryError()).toBe('offline');
  });
  it('shows retained legacy search and price restrictions in the effective summary', async () => {
    const component = await build({
      id: 'old',
      title: 'Nike',
      brand_id: 53,
      catalog_id: 3,
      poll_interval_ms: 20000,
      search_text: 'air max',
      price_from: 10,
      price_to: 50,
    } as SniperQuery);
    expect(component.summary()).toContain('air max');
    expect(component.summary()).toContain('10');
    expect(component.summary()).toContain('50');
  });
  it('meets accessible form structure with the expanded settings', async () => {
    const component = await build();
    component.advanced.set(true);
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      result.violations.map(
        (violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(' | ')}`,
      ),
    ).toEqual([]);
  });
});
