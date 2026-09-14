import '@angular/compiler';
import { describe, expect, it, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DealFavoritesService } from './deal-favorites.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { FeedItem } from '../models/deal-monitor.model';

const createItem = (id: string): FeedItem => ({
  id,
  title: `Item ${id}`,
  url: `https://www.vinted.de/items/${id}`,
  image_urls: [],
  item_price: 20,
  total_price: 23,
  currency: 'EUR',
  brand: 'Nike',
  size: 'L',
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-14T12:00:00Z',
  catalog_id: 1,
  category_path: 'Kleidung',
  reference_price: null,
  reference_scope: null,
  discount_percent: null,
  watchlist_title: null,
});

describe('DealFavoritesService', () => {
  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;
  let isDemoMode: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    localStorage.clear();

    currentWorkspace = signal<{ id: string; name: string } | null>({
      id: 'ws-123',
      name: 'Test Studio',
    });
    isDemoMode = signal(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DealFavoritesService,
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { isDemoMode } },
      ],
    });
  });

  it('starts with empty favorites and toggles an item', () => {
    const service = TestBed.inject(DealFavoritesService);
    TestBed.flushEffects();

    expect(service.favorites()).toEqual([]);
    expect(service.count()).toBe(0);
    expect(service.isFavorite('item-1')).toBe(false);

    const item1 = createItem('item-1');
    service.toggle(item1);

    expect(service.isFavorite('item-1')).toBe(true);
    expect(service.count()).toBe(1);
    expect(service.favorites()[0].id).toBe('item-1');

    // Toggle off
    service.toggle(item1);
    expect(service.isFavorite('item-1')).toBe(false);
    expect(service.count()).toBe(0);
  });

  it('persists favorites to localStorage and loads on initialization', () => {
    const service = TestBed.inject(DealFavoritesService);
    TestBed.flushEffects();

    service.add(createItem('item-1'));
    expect(localStorage.getItem('flipbase_vinted_favorites_ws-123')).toContain('item-1');

    // Simulate new service instance loading from storage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DealFavoritesService,
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { isDemoMode } },
      ],
    });
    const newService = TestBed.inject(DealFavoritesService);
    TestBed.flushEffects();

    expect(newService.isFavorite('item-1')).toBe(true);
    expect(newService.count()).toBe(1);
  });

  it('removes item and clears all favorites', () => {
    const service = TestBed.inject(DealFavoritesService);
    TestBed.flushEffects();

    service.add(createItem('item-1'));
    service.add(createItem('item-2'));
    expect(service.count()).toBe(2);

    service.remove('item-1');
    expect(service.count()).toBe(1);
    expect(service.isFavorite('item-1')).toBe(false);
    expect(service.isFavorite('item-2')).toBe(true);

    service.clear();
    expect(service.count()).toBe(0);
  });
});
