import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { FeedItem } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { DealCardComponent } from './deal-card.component';

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

const item: FeedItem = {
  id: 'listing-1',
  title: 'Adidas Spezial',
  url: 'https://www.vinted.de/items/123',
  image_urls: [1, 2, 3].map((index) => `https://images1.vinted.net/${index}.webp`),
  item_price: 15,
  total_price: 18,
  currency: 'EUR',
  brand: 'Adidas',
  size: '42',
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-27T12:00:00Z',
  catalog_id: null,
  category_path: null,
  reference_price: null,
  reference_scope: null,
  discount_percent: null,
  watchlist_title: null,
};

describe('DealCardComponent', () => {
  beforeAll(async () => {
    const resources: Record<string, string> = {
      './deal-card.component.html':
        'src/app/features/deal-monitor/components/deal-card/deal-card.component.html',
      './button.component.html': 'src/app/shared/components/button/button.component.html',
      './button.component.scss': 'src/app/shared/components/button/button.component.scss',
      './card.component.html': 'src/app/shared/components/card/card.component.html',
      './card.component.scss': 'src/app/shared/components/card/card.component.scss',
      './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
      './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
    };
    await ɵresolveComponentResources((url) => readFile(resolve(resources[url]!), 'utf8'));
    registerSignalInputs(DealCardComponent, ['item']);
    registerSignalInputs(CardComponent, ['variant', 'padding']);
    registerSignalInputs(BadgeComponent, ['tone', 'size']);
    registerSignalInputs(ButtonComponent, [
      'variant',
      'size',
      'icon',
      'iconOnly',
      'ariaPressed',
      'ariaLabel',
      'title',
      'href',
      'target',
      'fullWidth',
      'iconPosition',
    ]);
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DealFavoritesService,
          useValue: { isFavorite: vi.fn(() => false), toggle: vi.fn() },
        },
      ],
    });
  });

  it('shows three photos and shared card actions when available', () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();

    const card = fixture.nativeElement as HTMLElement;
    const photos = card.querySelectorAll('article img');
    expect(photos).toHaveLength(3);
    expect(photos[0]?.classList.contains('row-span-2')).toBe(true);
    expect(card.textContent).toContain('Adidas Spezial');
    expect(card.textContent).toContain('Größe: 42');
    expect(card.textContent).toContain('Zustand: Sehr gut');
    expect(card.querySelectorAll('app-button')).toHaveLength(3);
    expect(card.querySelector('a[href="https://www.vinted.de/items/123"]')).not.toBeNull();
    expect(card.textContent).not.toContain('Kategorie noch unbekannt');
    expect(card.textContent).not.toContain('Käuferschutz');
  });

  it('shows one full image when Vinted only provides one photo', () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', { ...item, image_urls: item.image_urls.slice(0, 1) });
    fixture.detectChanges();

    const image = (fixture.nativeElement as HTMLElement).querySelector('article img');
    expect(image?.classList.contains('col-span-2')).toBe(true);
  });
});
