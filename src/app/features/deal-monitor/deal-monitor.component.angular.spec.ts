import '@angular/compiler';
import { ElementRef, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DealMonitorComponent } from './deal-monitor.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { AuthService } from '../../core/services/auth.service';
import { FeedItem } from './models/deal-monitor.model';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DealCardComponent } from './components/deal-card/deal-card.component';
import { WatchlistEditorComponent } from './components/watchlist-editor/watchlist-editor.component';

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
  './deal-monitor.component.html': 'src/app/features/deal-monitor/deal-monitor.component.html',
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
  './custom-select.component.html':
    'src/app/shared/components/custom-select/custom-select.component.html',
  './custom-select.component.scss':
    'src/app/shared/components/custom-select/custom-select.component.scss',
  './modal-shell.component.html':
    'src/app/shared/components/modal-shell/modal-shell.component.html',
  './modal-shell.component.scss':
    'src/app/shared/components/modal-shell/modal-shell.component.scss',
  './deal-card.component.html':
    'src/app/features/deal-monitor/components/deal-card/deal-card.component.html',
  './watchlist-editor.component.html':
    'src/app/features/deal-monitor/components/watchlist-editor/watchlist-editor.component.html',
  './text-field.component.html': 'src/app/shared/components/text-field/text-field.component.html',
  './text-field.component.scss': 'src/app/shared/components/text-field/text-field.component.scss',
  './number-input.component.html':
    'src/app/shared/components/number-input/number-input.component.html',
  './number-input.component.scss':
    'src/app/shared/components/number-input/number-input.component.scss',
};

const mockFeedItem = (id: string, size: string | null = null): FeedItem => ({
  id,
  title: `Item ${id}`,
  url: 'https://www.vinted.de/items/1',
  image_urls: [],
  item_price: 15,
  total_price: 18,
  currency: 'EUR',
  brand: 'Nike',
  size,
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-14T12:00:00Z',
  catalog_id: 1,
  category_path: 'Herren > Kleidung',
  reference_price: 30,
  reference_scope: 'category_condition',
  discount_percent: 50,
  watchlist_title: 'Nike Deals',
});

describe('DealMonitorComponent', () => {
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
    ]);
    registerSignalInputs(CardComponent, ['variant', 'padding']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(CustomSelectComponent, [
      'options',
      'placeholder',
      'triggerId',
      'ariaLabel',
    ]);
    registerSignalInputs(DealCardComponent, ['item', 'featured']);
    registerSignalInputs(WatchlistEditorComponent, ['watchlist', 'categories', 'saving']);
  });

  let comp: DealMonitorComponent;
  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;
  let isDemoMode: ReturnType<typeof signal<boolean>>;

  const mockApi = {
    watchlists: vi.fn().mockResolvedValue([
      {
        id: 'wl-1',
        workspace_id: 'ws-1',
        title: 'Nike Hoodies',
        catalog_id: 1,
        brand: 'Nike',
        search_text: null,
        price_from: null,
        price_to: 50,
        condition: null,
        discount_threshold_percent: 40,
        is_active: true,
        legacy_brand_id: null,
      },
    ]),
    categories: vi.fn().mockResolvedValue([]),
    feed: vi.fn().mockResolvedValue({
      items: [
        mockFeedItem('1', 'XL'),
        mockFeedItem('2', 'L'),
        mockFeedItem('3', 'XXL / 54'),
        mockFeedItem('4', 'M'),
        mockFeedItem('5', null),
      ],
      covered: true,
      reported_at: '2026-09-14T12:00:00Z',
    }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    currentWorkspace = signal<{ id: string; name: string } | null>({
      id: 'ws-1',
      name: 'Vintage Studio',
    });
    isDemoMode = signal(false);

    TestBed.configureTestingModule({
      providers: [
        DealMonitorComponent,
        { provide: DealMonitorService, useValue: mockApi },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { isDemoMode } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    comp = TestBed.inject(DealMonitorComponent);
  });

  it('initializes size filter and options', () => {
    expect(comp.selectedSize()).toBeNull();
    expect(comp.sizeOptions.some((opt) => opt.value === 'xxl')).toBe(true);
    expect(comp.sizeOptions.some((opt) => opt.value === 'xl')).toBe(true);
  });

  it('filters feed items reactively when size changes', async () => {
    TestBed.flushEffects();
    await comp.state.refresh();

    // No filter active: all 5 items
    expect(comp.filteredItems().length).toBe(5);

    // Select XL: only '1' matches
    comp.selectedSize.set('xl');
    expect(comp.filteredItems().map((i) => i.id)).toEqual(['1']);

    // Select XXL: compound size 'XXL / 54' matches
    comp.selectedSize.set('xxl');
    expect(comp.filteredItems().map((i) => i.id)).toEqual(['3']);

    // Select L: only '2' matches
    comp.selectedSize.set('l');
    expect(comp.filteredItems().map((i) => i.id)).toEqual(['2']);

    // Reset filter
    comp.selectedSize.set(null);
    expect(comp.filteredItems().length).toBe(5);
  });

  it('computes highlights and grid from filtered items', async () => {
    TestBed.flushEffects();
    await comp.state.refresh();

    expect(comp.highlights().length).toBe(3);
    expect(comp.grid().length).toBe(2);

    comp.selectedSize.set('l');
    expect(comp.highlights().length).toBe(1);
    expect(comp.grid().length).toBe(0);
  });
});
