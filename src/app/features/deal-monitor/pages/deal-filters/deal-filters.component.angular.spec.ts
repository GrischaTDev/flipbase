import '@angular/compiler';
import { ElementRef, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DealFiltersComponent } from './deal-filters.component';
import { DealMonitorService } from '../../services/deal-monitor.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { canLeaveUnsavedEntry } from '../../../../shared/guards/unsaved-entry.guard';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { WatchlistEditorComponent } from '../../components/watchlist-editor/watchlist-editor.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

const componentResources: Readonly<Record<string, string>> = {
  './deal-filters.component.html':
    'src/app/features/deal-monitor/pages/deal-filters/deal-filters.component.html',
  './deal-filters.component.scss':
    'src/app/features/deal-monitor/pages/deal-filters/deal-filters.component.scss',
  './page-header.component.html':
    'src/app/shared/components/page-header/page-header.component.html',
  './page-header.component.scss':
    'src/app/shared/components/page-header/page-header.component.scss',
  './button.component.html': 'src/app/shared/components/button/button.component.html',
  './button.component.scss': 'src/app/shared/components/button/button.component.scss',
  './card.component.html': 'src/app/shared/components/card/card.component.html',
  './card.component.scss': 'src/app/shared/components/card/card.component.scss',
  './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
  './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
  './modal-shell.component.html':
    'src/app/shared/components/modal-shell/modal-shell.component.html',
  './modal-shell.component.scss':
    'src/app/shared/components/modal-shell/modal-shell.component.scss',
  './custom-select.component.html':
    'src/app/shared/components/custom-select/custom-select.component.html',
  './custom-select.component.scss':
    'src/app/shared/components/custom-select/custom-select.component.scss',
  './watchlist-editor.component.html':
    'src/app/features/deal-monitor/components/watchlist-editor/watchlist-editor.component.html',
  './text-field.component.html': 'src/app/shared/components/text-field/text-field.component.html',
  './text-field.component.scss': 'src/app/shared/components/text-field/text-field.component.scss',
  './number-input.component.html':
    'src/app/shared/components/number-input/number-input.component.html',
  './number-input.component.scss':
    'src/app/shared/components/number-input/number-input.component.scss',
};

describe('DealFiltersComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const resourcePath = componentResources[url];
      if (!resourcePath) {
        throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      }
      return readFile(resolve(resourcePath), 'utf8');
    });

    registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'badge']);
    registerSignalInputs(ButtonComponent, [
      'variant',
      'size',
      'disabled',
      'loading',
      'icon',
      'fullWidth',
      'ariaLabel',
    ]);
    registerSignalInputs(CardComponent, ['variant', 'padding']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(ModalShellComponent, [
      'title',
      'subtitle',
      'icon',
      'iconTone',
      'size',
      'closeOnBackdrop',
      'hasFooter',
    ]);
    registerSignalInputs(CustomSelectComponent, [
      'options',
      'placeholder',
      'triggerId',
      'ariaLabel',
    ]);
    registerSignalInputs(WatchlistEditorComponent, ['watchlist', 'categories', 'saving']);
  });

  let comp: DealFiltersComponent;
  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;
  let isDemoMode: ReturnType<typeof signal<boolean>>;

  const mockApi = {
    watchlists: vi.fn().mockResolvedValue([
      {
        id: 'wl-1',
        workspace_id: 'ws-1',
        title: 'Vintage Sweatshirts',
        catalog_id: 1,
        brand: 'Nike',
        search_text: 'Vintage',
        price_from: null,
        price_to: 45,
        condition: null,
        discount_threshold_percent: 40,
        is_active: true,
        legacy_brand_id: null,
      },
    ]),
    categories: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue({ id: 'wl-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    currentWorkspace = signal<{ id: string; name: string } | null>({
      id: 'ws-1',
      name: 'Filter Test Studio',
    });
    isDemoMode = signal(false);

    TestBed.configureTestingModule({
      providers: [
        DealFiltersComponent,
        { provide: DealMonitorService, useValue: mockApi },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { isDemoMode } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });

    comp = TestBed.inject(DealFiltersComponent);
  });

  it('loads watchlists on initialization', async () => {
    TestBed.flushEffects();
    await comp.loadWatchlists('ws-1');

    expect(comp.watchlists().length).toBe(1);
    expect(comp.watchlists()[0].title).toBe('Vintage Sweatshirts');
  });

  it('keeps the loading state until the watchlist request finishes', async () => {
    let resolveRows!: (rows: never[]) => void;
    const pending = new Promise<never[]>((resolve) => {
      resolveRows = resolve;
    });
    mockApi.watchlists.mockReturnValueOnce(pending);

    const loading = comp.loadWatchlists('ws-1');
    expect(comp.watchlistsLoading()).toBe(true);

    resolveRows([]);
    await loading;
    expect(comp.watchlistsLoading()).toBe(false);
  });

  it('implements isSaving correctly for unsavedEntryGuard', () => {
    expect(comp.isSaving()).toBe(false);
    expect(canLeaveUnsavedEntry(comp)).toBe(true);

    comp.saving.set(true);
    expect(comp.isSaving()).toBe(true);
    expect(canLeaveUnsavedEntry(comp)).toBe(false);
  });

  it('does not load watchlists or categories in demo mode', async () => {
    isDemoMode.set(true);
    vi.clearAllMocks();
    TestBed.flushEffects();

    await comp.loadWatchlists('ws-1');
    await comp.loadCategories();

    expect(mockApi.watchlists).not.toHaveBeenCalled();
    expect(mockApi.categories).not.toHaveBeenCalled();
  });

  it('does not save or delete in demo mode', async () => {
    isDemoMode.set(true);

    await comp.save({
      id: null,
      title: 'Demo Filter',
      catalog_id: null,
      brand: null,
      search_text: null,
      condition: null,
      price_from: null,
      price_to: null,
      discount_threshold_percent: 40,
      is_active: true,
    });
    expect(mockApi.save).not.toHaveBeenCalled();

    comp.deleting.set({
      id: 'wl-1',
      workspace_id: 'ws-1',
      title: 'Vintage Sweatshirts',
      catalog_id: 1,
      brand: 'Nike',
      search_text: 'Vintage',
      price_from: null,
      price_to: 45,
      condition: null,
      discount_threshold_percent: 40,
      is_active: true,
      legacy_brand_id: null,
    });
    await comp.confirmDelete();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('opens and closes editor', () => {
    expect(comp.editorOpen()).toBe(false);
    expect(comp.editing()).toBeNull();

    comp.openEditor();
    expect(comp.editorOpen()).toBe(true);
    expect(comp.editing()).toBeNull();

    comp.closeEditor();
    expect(comp.editorOpen()).toBe(false);
  });

  it('toggles a watchlist', async () => {
    const row = {
      id: 'wl-1',
      workspace_id: 'ws-1',
      title: 'Vintage Sweatshirts',
      catalog_id: 1,
      brand: 'Nike',
      search_text: 'Vintage',
      price_from: null,
      price_to: 45,
      condition: null,
      discount_threshold_percent: 40,
      is_active: true,
      legacy_brand_id: null,
    };

    comp.toggle(row);
    expect(mockApi.save).toHaveBeenCalledWith('ws-1', {
      ...row,
      is_active: false,
    });
  });

  it('renders template with watchlists without template errors', async () => {
    const fixture = TestBed.createComponent(DealFiltersComponent);
    fixture.detectChanges();
    await fixture.componentInstance.loadWatchlists('ws-1');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Suchfilter');
    expect(root.textContent).toContain('Vintage Sweatshirts');
    expect(root.textContent).toContain('40 % unter Referenzpreis');
  });

  it('renders demo notice when in demo mode', () => {
    isDemoMode.set(true);
    const fixture = TestBed.createComponent(DealFiltersComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Der Vinted Bot benötigt einen angemeldeten Arbeitsbereich');
  });

  it('renders a loading state instead of the empty state', () => {
    const fixture = TestBed.createComponent(DealFiltersComponent);
    fixture.componentInstance.watchlistsLoading.set(true);
    fixture.componentInstance.watchlists.set([]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Suchfilter werden geladen');
    expect(root.textContent).not.toContain('Noch keine Suchfilter angelegt');
  });
});
