import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
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
  outputs: Record<string, string>;
}

function registerSignalInputs(
  component: unknown,
  inputNames: readonly string[],
  outputNames: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
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

const favorites = {
  ready: () => true,
  busy: () => false,
  error: () => null,
  isFavorite: vi.fn(() => false),
  toggle: vi.fn(),
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
    registerSignalInputs(DealCardComponent, ['item'], ['inspect']);
    registerSignalInputs(CardComponent, ['variant', 'padding']);
    registerSignalInputs(BadgeComponent, ['tone', 'size']);
    registerSignalInputs(
      ButtonComponent,
      [
        'density',
        'disabled',
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
      ],
      ['clicked'],
    );
  });

  beforeEach(() => {
    favorites.isFavorite.mockReturnValue(false);
    favorites.toggle.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: DealFavoritesService, useValue: favorites }],
    });
  });

  it('zeigt ein Hauptbild und alle Angaben mit getrennten Aktionen', async () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    const photos = card.querySelectorAll('article img');
    expect(photos).toHaveLength(1);
    expect(photos[0]?.getAttribute('src')).toBe(item.image_urls[0]);
    expect(card.querySelector('h3')?.textContent).toContain(item.title);
    expect([...card.querySelectorAll('dl dt')].map((label) => label.textContent?.trim())).toEqual([
      'Marke:',
      'Größe:',
      'Zustand:',
    ]);
    expect([...card.querySelectorAll('dl dd')].map((value) => value.textContent?.trim())).toEqual([
      'Adidas',
      '42',
      'Sehr gut',
    ]);
    expect(card.querySelectorAll('app-badge')).toHaveLength(3);
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe(item.first_seen_at);
    expect(card.querySelectorAll('app-button')).toHaveLength(3);
    expect(card.textContent).not.toContain('Käuferschutz');
    expect((await axe.run(card)).violations).toEqual([]);
  });

  it('öffnet die Großansicht nur über die Bildvorschau und nicht beim Merken', () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', item);
    const inspected = vi.fn();
    fixture.componentInstance.inspect.subscribe(inspected);
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    card.querySelector<HTMLButtonElement>('button[aria-pressed]')?.click();
    expect(favorites.toggle).toHaveBeenCalledWith(item);
    expect(inspected).not.toHaveBeenCalled();
    card.querySelector<HTMLButtonElement>('button[aria-label$="in Großansicht öffnen"]')?.click();
    expect(inspected).toHaveBeenCalledWith(item);
  });

  it('ersetzt ein defektes Hauptbild durch das nächste sichere Bild und zeigt danach den Leerzustand', () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', {
      ...item,
      image_urls: ['https://example.test/unsafe.webp', ...item.image_urls],
    });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    for (const url of item.image_urls) {
      const image = card.querySelector('img');
      expect(image?.getAttribute('src')).toBe(url);
      image?.dispatchEvent(new Event('error'));
      fixture.detectChanges();
    }
    expect(card.querySelector('img')).toBeNull();
    expect(card.textContent).toContain('Kein Artikelbild');
  });

  it('zeigt den Hinweis auf nicht kaufbare Artikel ohne unsicheren Link', () => {
    const fixture = TestBed.createComponent(DealCardComponent);
    fixture.componentRef.setInput('item', { ...item, is_hidden: true, url: 'javascript:alert(1)' });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    expect(card.textContent).toContain('Noch nicht kaufbar');
    expect(card.querySelector('a')).toBeNull();
  });
});
