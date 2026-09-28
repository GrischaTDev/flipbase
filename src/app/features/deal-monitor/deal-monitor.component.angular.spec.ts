import '@angular/compiler';
import { ElementRef, EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DealMonitorComponent } from './deal-monitor.component';
import { DealMonitorService } from './services/deal-monitor.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { FeedItem } from './models/deal-monitor.model';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { NumberInputComponent } from '../../shared/components/number-input/number-input.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DealCardComponent } from './components/deal-card/deal-card.component';
import { DealDetailModalComponent } from './components/deal-detail-modal/deal-detail-modal.component';
import { WatchlistEditorComponent } from './components/watchlist-editor/watchlist-editor.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const snapshots = new Map<unknown, AngularInputMetadata>();
let selectValueChangeDescriptor: PropertyDescriptor | undefined;

function registerSignalInputs(
  component: unknown,
  inputNames: readonly string[],
  outputNames: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  if (!snapshots.has(component))
    snapshots.set(component, {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
      outputs: metadata.outputs,
    });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputNames.map((name) => [name, name])),
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
  './deal-detail-modal.component.html':
    'src/app/features/deal-monitor/components/deal-detail-modal/deal-detail-modal.component.html',
  './deal-detail-modal.component.scss':
    'src/app/features/deal-monitor/components/deal-detail-modal/deal-detail-modal.component.scss',
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

    registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'badge', 'icon']);
    registerSignalInputs(
      ButtonComponent,
      [
        'variant',
        'size',
        'disabled',
        'loading',
        'icon',
        'fullWidth',
        'iconOnly',
        'href',
        'ariaLabel',
        'ariaPressed',
        'title',
        'target',
      ],
      ['clicked'],
    );
    registerSignalInputs(CardComponent, ['variant', 'padding', 'rounded', 'overflowVisible']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(
      CustomSelectComponent,
      ['options', 'placeholder', 'triggerId', 'ariaLabel', 'searchable', 'variant', 'value'],
      ['valueChange'],
    );
    registerSignalInputs(
      NumberInputComponent,
      [
        'id',
        'ariaLabel',
        'ariaDescribedby',
        'ariaInvalid',
        'showStepper',
        'min',
        'step',
        'unit',
        'value',
      ],
      ['valueChange'],
    );
    const numberMetadata = (NumberInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    numberMetadata.outputs = { ...numberMetadata.outputs, valueChange: 'value' };
    selectValueChangeDescriptor = Object.getOwnPropertyDescriptor(
      CustomSelectComponent.prototype,
      'valueChange',
    );
    Object.defineProperty(CustomSelectComponent.prototype, 'valueChange', {
      configurable: true,
      value: new EventEmitter<string | null>(),
    });
    registerSignalInputs(DealCardComponent, ['item'], ['inspect']);
    registerSignalInputs(DealDetailModalComponent, ['item'], ['closed']);
    registerSignalInputs(WatchlistEditorComponent, ['watchlist', 'categories', 'saving']);
  });

  afterAll(() => {
    for (const [component, snapshot] of snapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
      metadata.outputs = snapshot.outputs;
    }
    if (selectValueChangeDescriptor) {
      Object.defineProperty(
        CustomSelectComponent.prototype,
        'valueChange',
        selectValueChangeDescriptor,
      );
    } else {
      Reflect.deleteProperty(CustomSelectComponent.prototype, 'valueChange');
    }
  });

  let comp: DealMonitorComponent;
  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;

  const mockApi = {
    supportedBrands: vi.fn().mockResolvedValue(['Nike', 'Adidas']),
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

    TestBed.configureTestingModule({
      providers: [
        DealMonitorComponent,
        { provide: DealMonitorService, useValue: mockApi },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    comp = TestBed.inject(DealMonitorComponent);
  });

  it('initializes size filter and options', () => {
    expect(comp.selectedSize()).toBeNull();
    expect(comp.sizeOptions.some((opt) => opt.value === 'xxl')).toBe(true);
    expect(comp.sizeOptions.find((opt) => opt.value === 'xxl')?.label).toBe('XXL');
    expect(comp.sizeOptions.some((opt) => opt.value === 'xl')).toBe(true);
  });

  it('requests the selected size from the full saved feed', async () => {
    TestBed.flushEffects();
    await comp.state.refresh();
    expect(comp.feedItems().length).toBe(5);
    comp.selectedSize.set('xxl');
    TestBed.flushEffects();
    expect(mockApi.feed).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspace: 'ws-1', size: 'xxl' }),
    );
  });

  it('passes price limits to the feed and rejects an inverted range', () => {
    TestBed.flushEffects();
    comp.minPrice.set(10);
    comp.maxPrice.set(20);
    TestBed.flushEffects();
    expect(mockApi.feed).toHaveBeenLastCalledWith(
      expect.objectContaining({ minPrice: 10, maxPrice: 20 }),
    );
    const calls = mockApi.feed.mock.calls.length;
    comp.minPrice.set(30);
    TestBed.flushEffects();
    expect(comp.priceError()).toContain('Mindestpreis');
    expect(mockApi.feed).toHaveBeenCalledTimes(calls);
  });

  it('shows labeled price inputs above the saved finds', async () => {
    const fixture = TestBed.createComponent(DealMonitorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('label[for="feed-min-price"]')?.textContent).toContain('Min. Preis');
    expect(host.querySelector('label[for="feed-max-price"]')?.textContent).toContain('Max. Preis');
    expect(host.querySelector<HTMLInputElement>('#feed-min-price')?.getAttribute('step')).toBe(
      '0.01',
    );
    const minInput = host.querySelector<HTMLInputElement>('#feed-min-price')!;
    minInput.value = '12';
    minInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(fixture.componentInstance.minPrice()).toBe(12);
    expect(mockApi.feed).toHaveBeenLastCalledWith(expect.objectContaining({ minPrice: 12 }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.textContent).toContain('Letzte 30 Tage');
    expect((await axe.run(host)).violations).toEqual([]);
    fixture.destroy();
  });

  it('groups feed filters and resets every active choice from the right edge', async () => {
    const fixture = TestBed.createComponent(DealMonitorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const filterCard = host.querySelector('app-card[data-feed-filters]');
    expect(filterCard).not.toBeNull();
    expect(filterCard?.classList.contains('overflow-visible')).toBe(true);
    expect(host.querySelector('[data-feed-filter-reset]')).toBeNull();

    const feed = fixture.componentInstance;
    feed.selected.set('wl-1');
    feed.selectedBrand.set('Nike');
    feed.selectedSize.set('xxl');
    feed.minPrice.set(30);
    feed.maxPrice.set(20);
    fixture.detectChanges();
    expect(feed.filtersActive()).toBe(true);
    expect(feed.priceError()).toContain('Mindestpreis');

    const reset = host.querySelector<HTMLButtonElement>('[data-feed-filter-reset] button');
    expect(reset?.getAttribute('aria-label')).toBe('Filter zurücksetzen');
    expect(reset?.closest('.ml-auto')).not.toBeNull();
    reset?.click();
    TestBed.flushEffects();
    fixture.detectChanges();

    expect([feed.selected(), feed.selectedBrand(), feed.selectedSize()]).toEqual([
      null,
      null,
      null,
    ]);
    expect([feed.minPrice(), feed.maxPrice()]).toEqual([null, null]);
    expect(feed.priceError()).toBeNull();
    expect(feed.filtersActive()).toBe(false);
    expect(host.querySelector('[data-feed-filter-reset]')).toBeNull();
    expect(mockApi.feed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        watchlist: null,
        brand: null,
        size: null,
        minPrice: null,
        maxPrice: null,
      }),
    );
    expect((await axe.run(host)).violations).toEqual([]);
    fixture.destroy();
  });

  it('offers the brands supported by the feed', async () => {
    TestBed.flushEffects();
    await comp.loadBrands('ws-1');
    await comp.state.refresh();

    expect(comp.brandOptions().map((option) => option.label)).toEqual([
      'Alle Marken',
      'Nike',
      'Adidas',
    ]);
    comp.selectedBrand.set('Nike');
    TestBed.flushEffects();
    expect(mockApi.feed).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: 'ws-1', brand: 'Nike' }),
    );
  });

  it('manages selected deal for detail modal inspection', () => {
    expect(comp.selectedDeal()).toBeNull();

    const item = mockFeedItem('test-deal');
    comp.selectedDeal.set(item);
    expect(comp.selectedDeal()).toEqual(item);

    comp.selectedDeal.set(null);
    expect(comp.selectedDeal()).toBeNull();
  });
});
