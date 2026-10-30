import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import type { SniperQuery } from '../../models/sniper-query.model';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { SniperQueriesComponent } from './sniper-queries.component';
import { SniperQueryRunStatusComponent } from './sniper-query-run-status.component';
import { SniperFilterCardComponent } from '../../components/sniper-filter-card/sniper-filter-card.component';
import { SniperFilterDetailsComponent } from '../../components/sniper-filter-details/sniper-filter-details.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TableActionMenuComponent } from '../../../../shared/components/table-action-menu/table-action-menu.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

// Die Laufzeitübersetzung der Tests registriert Signal-Eingänge nicht automatisch.
function registerSignalInputs(component: unknown, names: readonly string[]): void {
  const metadata = (
    component as {
      ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
    }
  ).ɵcmp;
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${url.replace(/^\.\//u, '')}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(BadgeComponent, ['tone']);
  registerSignalInputs(SniperFilterCardComponent, [
    'query',
    'category',
    'finds',
    'selected',
    'compact',
    'disabled',
    'pending',
    'manualRequired',
    'currentTime',
  ]);
  registerSignalInputs(SniperFilterDetailsComponent, [
    'query',
    'category',
    'finds',
    'pending',
    'manualRequired',
    'currentTime',
  ]);
  registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'appearance']);
  registerSignalInputs(TableActionMenuComponent, ['label', 'triggerIcon', 'disabled']);
  registerSignalInputs(CustomCheckboxComponent, ['checked', 'ariaLabel', 'disabled', 'size']);
  registerSignalInputs(ModalShellComponent, [
    'title',
    'subtitle',
    'presentation',
    'drawerWidth',
    'closeOnBackdrop',
    'hasFooter',
  ]);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'size',
    'disabled',
    'loading',
    'icon',
    'iconOnly',
    'ariaLabel',
    'title',
    'tone',
    'link',
    'href',
    'queryParams',
  ]);
  registerSignalInputs(TableActionButtonComponent, [
    'icon',
    'label',
    'tone',
    'disabled',
    'loading',
  ]);
  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'loading',
    'hasRows',
    'loadingText',
    'emptyTitle',
    'emptyText',
  ]);
  registerSignalInputs(CustomSearchInputComponent, [
    'variant',
    'size',
    'value',
    'placeholder',
    'ariaLabel',
  ]);
  registerSignalInputs(CustomSelectComponent, [
    'options',
    'value',
    'disabled',
    'ariaLabel',
    'triggerId',
  ]);
  registerSignalInputs(SniperQueryRunStatusComponent, [
    'query',
    'compact',
    'pending',
    'manualRequired',
    'currentTime',
  ]);
});

describe('SniperQueriesComponent activation', () => {
  const api = { setActive: vi.fn() };
  const browserApi = { status: vi.fn() };
  const state = {
    stale: signal(false),
    vintedUptimeSeconds: signal<number | null>(60),
    queries: signal<SniperQuery[]>([]),
    counts: signal<Partial<Record<string, number>>>({}),
    loaded: signal(true),
    runtime: signal({ reported_at: '2026-10-08T09:00:47Z' }),
    error: signal<string | null>(null),
    refreshAfterMutation: vi.fn(),
  };
  const query = {
    id: 'adidas',
    is_active: false,
    last_polled_at: '2026-10-07T15:18:35Z',
    run_state: 'ready',
    poll_interval_ms: 5000,
    catalog_id: null,
    price_from: null,
    price_to: null,
    last_status: 'forbidden',
  } as SniperQuery;

  beforeEach(async () => {
    vi.resetAllMocks();
    state.error.set(null);
    state.queries.set([]);
    api.setActive.mockResolvedValue(undefined);
    state.refreshAfterMutation.mockResolvedValue(undefined);
    browserApi.status.mockResolvedValue({
      state: 'ready',
      sessionId: null,
      expiresAt: null,
      message: null,
    });
    TestBed.overrideComponent(SniperQueriesComponent, {
      set: {
        template: await readFile(
          'src/app/features/platform-admin/pages/sniper-queries/sniper-queries.component.html',
          'utf8',
        ),
        providers: [{ provide: SniperAdminState, useValue: state }],
      },
    });
    await TestBed.configureTestingModule({
      imports: [SniperQueriesComponent],
      providers: [
        provideRouter([]),
        { provide: SniperAdminService, useValue: api },
        { provide: SniperBrowserService, useValue: browserApi },
        { provide: ConfirmDialogService, useValue: {} },
        {
          provide: VintedCategoryService,
          useValue: { readSnapshot: async () => ({ categories: [] }) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps failed selections after a partially successful serial pause and refreshes accepted mutations', async () => {
    const first = { ...query, id: 'first', title: 'Erster', is_active: true };
    const second = { ...query, id: 'second', title: 'Zweiter', is_active: true };
    state.queries.set([first, second, { ...query, id: 'other', is_active: true }]);
    api.setActive.mockImplementation(async (id: string) => {
      if (id === 'second') throw new Error('Vorübergehend nicht gespeichert');
    });
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.setSelected(first.id, true);
    component.setSelected(second.id, true);
    await component.setSelectedActive(false);
    expect(api.setActive.mock.calls).toEqual([
      ['first', false],
      ['second', false],
    ]);
    expect(state.refreshAfterMutation).toHaveBeenCalledOnce();
    expect([...component.selectedIds()]).toEqual(['second']);
    expect(component.message()).toContain('1 Suchfilter');
    expect(component.error()).toContain('Zweiter');
    expect(component.isSaving()).toBe(false);
  });

  it('uses current filter rows and drops removed selections instead of mutating a stale snapshot', async () => {
    state.queries.set([
      { ...query, id: 'changed', is_active: true },
      { ...query, id: 'removed' },
    ]);
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.setSelected('changed', true);
    component.setSelected('removed', true);
    state.queries.set([{ ...query, id: 'changed', is_active: false }]);
    await component.setSelectedActive(false);
    expect(api.setActive).not.toHaveBeenCalled();
    expect(component.selectedIds().size).toBe(0);
  });

  it.each(['interaction_required', 'manual'])(
    'does not wait for a first fetch during %s',
    async (status) => {
      browserApi.status.mockResolvedValue({ state: status });
      const fixture = TestBed.createComponent(SniperQueriesComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      await fixture.componentInstance.toggle(query);

      expect(api.setActive).toHaveBeenCalledWith('adidas', true);
      expect(fixture.componentInstance.isCheckPending({ ...query, is_active: true })).toBe(false);
      expect(fixture.componentInstance.message()).toContain('manuelle');
      state.queries.set([{ ...query, title: 'Adidas', is_active: true }]);
      fixture.detectChanges();
      const rendered: HTMLElement = fixture.nativeElement;
      expect(rendered.textContent).toContain('Alle Botabrufe sind bis zur manuellen');
      expect(rendered.textContent).toContain('Wartet auf manuelle Vinted-Prüfung');
      expect(rendered.textContent).not.toContain('Wird geprüft');
      expect(rendered.querySelector('a')?.getAttribute('href')).toBe('/admin/vinted-bot/operation');
    },
  );

  it('keeps the first-fetch indicator until a runnable query is actually polled', async () => {
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.toggle(query);
    const active = { ...query, is_active: true };

    expect(fixture.componentInstance.isCheckPending(active)).toBe(true);
    expect(
      fixture.componentInstance.isCheckPending({
        ...active,
        last_polled_at: '2026-10-08T10:00:00Z',
      }),
    ).toBe(false);
  });

  it('shows a saved denial as the last fetch after a page reload', async () => {
    state.queries.set([{ ...query, title: 'Adidas', is_active: true }]);
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rendered: HTMLElement = fixture.nativeElement;
    fixture.componentInstance.openDetails(state.queries()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rendered.textContent).toContain('Letzter Abruf: Zugriff abgewiesen');
    expect(rendered.textContent).not.toContain('Wird geprüft');
  });

  it('keeps relative success and coverage visible while exact diagnostics and all conditions are disclosed on demand', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-29T10:02:00Z'));
    state.queries.set([
      {
        ...query,
        title: 'Pufferjacken',
        catalog_id: 79,
        brand_names: ['Nike'],
        title_keywords: ['pufferjacke', 'puffer jacke'],
        excluded_title_keywords: ['weste'],
        keyword_mode: 'any',
        last_status: 'ok',
        last_success_at: '2026-10-29T10:00:00Z',
        coverage_status: 'caught_up',
        coverage_checked_at: '2026-10-29T10:00:00Z',
        last_request_duration_ms: 1234,
        shared_filter_count: 2,
      },
    ]);
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.textContent).toContain('vor 2 Minuten');
    fixture.componentInstance.categoryPaths.set(new Map([[79, 'Herren > Kleidung > Jacken']]));
    fixture.componentInstance.openDetails(state.queries()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    const diagnostics = rendered.querySelector<HTMLDetailsElement>(
      'details[data-query-run-details]',
    )!;
    expect(diagnostics).not.toBeNull();
    expect(diagnostics.open).toBe(false);
    diagnostics.querySelector('summary')!.click();
    expect(diagnostics.open).toBe(true);
    expect(diagnostics.querySelector('time')?.dateTime).toBe('2026-10-29T10:00:00Z');
    expect(diagnostics.textContent).toContain('1234 ms');
    expect(diagnostics.textContent).toContain('2 Filtern');
    const conditions = rendered.querySelector<HTMLElement>(
      'section[aria-label="Suchbedingungen"]',
    )!;
    expect(conditions).not.toBeNull();
    expect(conditions.textContent).toContain('pufferjacke');
    expect(conditions.textContent).toContain('puffer jacke');
    expect(conditions.textContent).toContain('Ausgeschlossen');
    expect(conditions.textContent).toContain('weste');
    expect(conditions.textContent).toContain('Herren › Kleidung › Jacken');
  });

  it('ages a retained success while the API is unavailable and releases its clock on destroy', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-29T10:00:10Z'));
    state.queries.set([
      { ...query, title: 'Jacken', last_status: 'ok', last_success_at: '2026-10-29T10:00:00Z' },
    ]);
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.textContent).toContain('Erfolg gerade eben');
    state.error.set('API nicht erreichbar');
    vi.advanceTimersByTime(120000);
    fixture.detectChanges();
    expect(rendered.textContent).toContain('Erfolg vor 2 Minuten');
    expect(rendered.textContent).not.toContain('Erfolg gerade eben');
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('combines search and active state and shows exclusions, prices and bounded coverage', async () => {
    state.queries.set([
      {
        ...query,
        id: 'one',
        title: 'Jacken',
        is_active: true,
        title_keywords: ['pufferjacke'],
        excluded_title_keywords: ['weste'],
        price_to: 40,
        coverage_status: 'limited',
        last_error_message: 'Zeitlimit beim Abruf',
      },
      { ...query, id: 'two', title: 'Jacken pausiert', is_active: false },
    ]);
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.search.set('Jacken');
    component.statusFilter.set('active');
    expect(component.filtered().map((row) => row.id)).toEqual(['one']);
    component.search.set('weste');
    expect(component.filtered().map((row) => row.id)).toEqual(['one']);
    fixture.detectChanges();
    const rendered = fixture.nativeElement as HTMLElement;
    component.openDetails(state.queries()[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(rendered.textContent).toContain('Ausgeschlossen');
    expect(rendered.textContent).toContain('weste');
    expect(rendered.textContent).toContain('bis 40');
    expect(rendered.textContent).toContain('Aufholen begrenzt');
    expect(rendered.textContent).toContain('Zeitlimit beim Abruf');
    expect(rendered.textContent).not.toContain('vollständig');
  });

  it('keeps the manual-pause notice and its next step accessible', async () => {
    browserApi.status.mockResolvedValue({ state: 'interaction_required' });
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rendered: HTMLElement = fixture.nativeElement;
    expect((await axe.run(rendered)).violations).toEqual([]);
  });

  it('stops waiting when a later heartbeat reports a global challenge', async () => {
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.toggle(query);
    const active = { ...query, is_active: true };
    expect(fixture.componentInstance.isCheckPending(active)).toBe(true);

    browserApi.status.mockResolvedValue({ state: 'interaction_required' });
    state.runtime.set({ reported_at: '2026-10-08T10:00:10Z' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.isCheckPending(active)).toBe(false);
  });

  it('reports a failed browser-status read instead of leaving the activation indicator running', async () => {
    browserApi.status.mockRejectedValue(new Error('Browserstatus nicht verfügbar.'));
    const fixture = TestBed.createComponent(SniperQueriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.toggle(query);

    expect(fixture.componentInstance.browserError()).toBe('Browserstatus nicht verfügbar.');
    expect(fixture.componentInstance.isCheckPending({ ...query, is_active: true })).toBe(false);
  });
});
