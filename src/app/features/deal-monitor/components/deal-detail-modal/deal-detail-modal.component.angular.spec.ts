import '@angular/compiler';
import { ElementRef, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DealDetailModalComponent } from './deal-detail-modal.component';
import { FeedItem } from '../../models/deal-monitor.model';
import { DealFavoritesService } from '../../services/deal-favorites.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';

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
  './deal-detail-modal.component.html':
    'src/app/features/deal-monitor/components/deal-detail-modal/deal-detail-modal.component.html',
  './deal-detail-modal.component.scss':
    'src/app/features/deal-monitor/components/deal-detail-modal/deal-detail-modal.component.scss',
  './modal-shell.component.html':
    'src/app/shared/components/modal-shell/modal-shell.component.html',
  './modal-shell.component.scss':
    'src/app/shared/components/modal-shell/modal-shell.component.scss',
  './button.component.html': 'src/app/shared/components/button/button.component.html',
  './button.component.scss': 'src/app/shared/components/button/button.component.scss',
  './badge.component.html': 'src/app/shared/components/badge/badge.component.html',
  './badge.component.scss': 'src/app/shared/components/badge/badge.component.scss',
};

const mockItem: FeedItem = {
  id: 'item-10',
  title: 'Vintage Trackjacket',
  url: 'https://www.vinted.de/items/10',
  image_urls: [
    'https://images1.vinted.net/t/01_abc/f800/10_1.jpeg',
    'https://images1.vinted.net/t/01_abc/f800/10_2.jpeg',
  ],
  item_price: 35,
  total_price: 38.5,
  currency: 'EUR',
  brand: 'Adidas',
  size: 'XL',
  condition: 'Sehr gut',
  is_hidden: false,
  first_seen_at: '2026-09-14T12:00:00Z',
  catalog_id: 1,
  category_path: 'Herren > Jacken',
  reference_price: 60,
  reference_scope: 'category_brand_condition',
  discount_percent: 41.7,
  watchlist_title: 'Adidas Jacken',
};

describe('DealDetailModalComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const resourcePath = componentResources[url];
      if (!resourcePath) {
        throw new Error(`Unbekannte Komponenten-Ressource: ${url}`);
      }
      return readFile(resolve(resourcePath), 'utf8');
    });

    registerSignalInputs(ModalShellComponent, [
      'title',
      'subtitle',
      'icon',
      'iconTone',
      'size',
      'closeOnBackdrop',
      'hasFooter',
    ]);
    registerSignalInputs(ButtonComponent, ['variant', 'size', 'icon', 'iconPosition', 'ariaLabel']);
    registerSignalInputs(BadgeComponent, ['tone']);
    registerSignalInputs(DealDetailModalComponent, ['item']);
  });

  let currentWorkspace: ReturnType<typeof signal<{ id: string; name: string } | null>>;
  let isDemoMode: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    localStorage.clear();
    currentWorkspace = signal<{ id: string; name: string } | null>({
      id: 'ws-1',
      name: 'Test Studio',
    });
    isDemoMode = signal(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DealFavoritesService,
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: AuthService, useValue: { isDemoMode } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
  });

  it('cycles through images', () => {
    const fixture = TestBed.createComponent(DealDetailModalComponent);
    fixture.componentRef.setInput('item', mockItem);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.validImages().length).toBe(2);
    expect(comp.activeImageIndex()).toBe(0);

    comp.nextImage();
    expect(comp.activeImageIndex()).toBe(1);

    comp.nextImage();
    expect(comp.activeImageIndex()).toBe(0);

    comp.prevImage();
    expect(comp.activeImageIndex()).toBe(1);
  });

  it('toggles favorites status', () => {
    const fixture = TestBed.createComponent(DealDetailModalComponent);
    fixture.componentRef.setInput('item', mockItem);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.isFavorite()).toBe(false);

    comp.toggleFavorite();
    expect(comp.isFavorite()).toBe(true);

    comp.toggleFavorite();
    expect(comp.isFavorite()).toBe(false);
  });
});
