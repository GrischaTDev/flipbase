import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLabelReaderState } from '../../services/brand-label-reader-state';
import { LabelLibraryComponent } from './label-library.component';

function setup(params: Record<string, string> = {}) {
  const query = new BehaviorSubject(convertToParamMap(params));
  const state = { search: vi.fn(), more: vi.fn() };
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: { queryParamMap: query } },
      { provide: Router, useValue: router },
      { provide: BrandLabelReaderState, useValue: state },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new LabelLibraryComponent());
  return { component, query, state, router };
}
describe('LabelLibraryComponent – URL und Filterformular', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('übernimmt eine gespeicherte Suche einschließlich Jahrzehnt und Labelart', () => {
    const { component, state } = setup({
      brand: 'nike',
      q: 'blaues Label',
      decade: '1990',
      kind: 'neck-label',
    });
    expect(component.form.getRawValue()).toEqual({
      brand: 'nike',
      query: 'blaues Label',
      decade: '1990',
      kind: 'neck-label',
    });
    expect(state.search).toHaveBeenLastCalledWith({
      brandSlug: 'nike',
      query: 'blaues Label',
      decade: 1990,
      kind: 'neck-label',
    });
  });
  it('übergibt Suchzeichen als Routerwerte, nicht als SQL- oder URL-Textverkettung', () => {
    const { component, router } = setup();
    component.form.controls.query.setValue('Label % & _');
    component.applyFilters();
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { q: 'Label % & _' } }),
    );
  });
  it('stellt die Filter bei Vor-/Zurücknavigation wieder her, ohne eine Navigationsschleife', () => {
    const { component, query, router } = setup({ q: 'eins' });
    query.next(convertToParamMap({ q: 'zwei', decade: 'unknown' }));
    expect(component.form.controls.query.value).toBe('zwei');
    expect(component.form.controls.decade.value).toBe('unknown');
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('entfernt bei Zurücksetzen die Filter statt alte URL-Werte mitzunehmen', () => {
    const { component, router } = setup({ brand: 'nike', q: 'weiß', decade: '1980' });
    component.resetFilters();
    expect(router.navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: {} }),
    );
  });
  it('verwirft ungültige Jahre und Rollenfelder aus fremden Links', () => {
    const { component, state } = setup({ decade: '1987', operator: 'true' });
    expect(component.queryParams()).toEqual({});
    expect(state.search).toHaveBeenCalledWith({
      brandSlug: null,
      query: '',
      decade: null,
      kind: null,
    });
  });
});
