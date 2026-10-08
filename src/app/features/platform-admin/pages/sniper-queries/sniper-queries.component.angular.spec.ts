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
import type { SniperQuery } from '../../models/sniper-query.model';
import { SniperAdminService } from '../../services/sniper-admin.service';
import { SniperAdminState } from '../../services/sniper-admin-state';
import { SniperBrowserService } from '../../services/sniper-browser.service';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { SniperQueriesComponent } from './sniper-queries.component';

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
});

describe('SniperQueriesComponent activation', () => {
  const api = { setActive: vi.fn() };
  const browserApi = { status: vi.fn() };
  const state = {
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

  afterEach(() => TestBed.resetTestingModule());

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
    expect(rendered.textContent).toContain('Letzter Abruf: Zugriff abgewiesen');
    expect(rendered.textContent).not.toContain('Wird geprüft');
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
