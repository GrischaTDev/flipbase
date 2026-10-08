import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandLabelReaderState } from '../../services/brand-label-reader-state';
import { LabelDetailComponent } from './label-detail.component';

function setup() {
  const params = new BehaviorSubject(convertToParamMap({ brand: 'nike', label: 'test-label' }));
  const query = new BehaviorSubject(
    convertToParamMap({ brand: 'nike', q: 'weiß', decade: '1990' }),
  );
  const state = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: query } },
      { provide: BrandLabelReaderState, useValue: state },
      { provide: Router, useValue: { url: '/tools/brand-labels/nike/test-label?q=white#old' } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new LabelDetailComponent());
  return { component, params, query, state };
}
describe('LabelDetailComponent', () => {
  it('verweist trotz globalem base-Element auf die Quelle derselben Detailseite', () => {
    const { component } = setup();
    expect(component.sourceAnchor('test-source')).toBe(
      '/tools/brand-labels/nike/test-label?q=white#label-source-test-source',
    );
  });
  afterEach(() => TestBed.resetTestingModule());
  it('lädt den Eintrag aus der Route und erhält die Suche für den Rückweg', () => {
    const { component, state } = setup();
    expect(state.show).toHaveBeenCalledWith('nike', 'test-label');
    expect(component.backQueryParams()).toEqual({ brand: 'nike', q: 'weiß', decade: '1990' });
  });
  it('wechselt den Eintrag auch bei Wiederverwendung derselben Seite', () => {
    const { params, state } = setup();
    params.next(convertToParamMap({ brand: 'nike', label: 'anderes-label' }));
    expect(state.show).toHaveBeenLastCalledWith('nike', 'anderes-label');
  });
  it('erfindet keine Grenzen für offene und unbekannte Datierungen', () => {
    const { component } = setup();
    expect(component.intervalLabel({ startYear: null, endYear: 1989, sourceIds: [] })).toBe(
      'Bis 1989',
    );
    expect(component.intervalLabel({ startYear: 1990, endYear: null, sourceIds: [] })).toBe(
      'Ab 1990',
    );
    expect(component.intervalLabel({ startYear: null, endYear: null, sourceIds: [] })).toBe(
      'Nicht datiert',
    );
    expect(component.intervalLabel({ startYear: 1990, endYear: 1999, sourceIds: [] })).toBe(
      '1990–1999',
    );
  });
});
