import '@angular/compiler';
import { ElementRef, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DealFavoritesComponent } from './deal-favorites.component';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { FeedItem } from '../../models/deal-monitor.model';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { DealCardComponent } from '../../components/deal-card/deal-card.component';
import { DealDetailModalComponent } from '../../components/deal-detail-modal/deal-detail-modal.component';

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
  './deal-favorites.component.html':
    'src/app/features/deal-monitor/pages/deal-favorites/deal-favorites.component.html',
  './deal-favorites.component.scss':
    'src/app/features/deal-monitor/pages/deal-favorites/deal-favorites.component.scss',
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
};

const mockItem = (id: string, size: string | null = null): FeedItem => ({
  id,
  title: `Item ${id}`,
  url: `https://www.vinted.de/items/${id}`,
  image_urls: [],
  item_price: 25,
  total_price: 28,
  currency: 'EUR',
  brand: 'Nike',
  size,
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-14T12:00:00Z',
  catalog_id: 1,
  category_path: 'Herren > Hoodies',
  reference_price: 50,
  reference_scope: 'category_condition',
  discount_percent: 50,
  watchlist_title: 'Nike Deals',
});

describe('DealFavoritesComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const resourcePath = componentResources[url];
      if (!resourcePath) {
        throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      }
      return readFile(resolve(resourcePath), 'utf8');
    });

    registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'badge']);
    registerSignalInputs(ButtonComponent, ['variant', 'size', 'icon', 'fullWidth']);
    registerSignalInputs(CardComponent, ['variant', 'padding']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(CustomSelectComponent, ['options', 'triggerId', 'ariaLabel']);
    registerSignalInputs(DealCardComponent, ['item', 'featured']);
    registerSignalInputs(DealDetailModalComponent, ['item']);
  });

  let comp: DealFavoritesComponent;
  let favoritesService: DealFavoritesService;
  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;

  beforeEach(() => {
    localStorage.clear();
    currentWorkspace = signal<{ id: string; name: string } | null>({
      id: 'ws-fav-1',
      name: 'Favorite Test Studio',
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DealFavoritesComponent,
        DealFavoritesService,
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });

    favoritesService = TestBed.inject(DealFavoritesService);
    comp = TestBed.inject(DealFavoritesComponent);
  });

  it('initially has no favorites', () => {
    expect(comp.count()).toBe(0);
    expect(comp.favorites()).toEqual([]);
    expect(comp.filteredFavorites()).toEqual([]);
  });

  it('filters favorites by size reactively', () => {
    favoritesService.add(mockItem('1', 'XL'));
    favoritesService.add(mockItem('2', 'M'));
    favoritesService.add(mockItem('3', 'XXL / 54'));

    expect(comp.count()).toBe(3);
    expect(comp.filteredFavorites().length).toBe(3);

    comp.selectedSize.set('xxl');
    expect(comp.filteredFavorites().map((i) => i.id)).toEqual(['3']);

    comp.selectedSize.set('m');
    expect(comp.filteredFavorites().map((i) => i.id)).toEqual(['2']);

    comp.selectedSize.set(null);
    expect(comp.filteredFavorites().length).toBe(3);
  });

  it('clears all favorites', () => {
    favoritesService.add(mockItem('1', 'XL'));
    favoritesService.add(mockItem('2', 'M'));
    expect(comp.count()).toBe(2);

    comp.clearAll();
    expect(comp.count()).toBe(0);
    expect(comp.confirmClear()).toBe(false);
  });
});
