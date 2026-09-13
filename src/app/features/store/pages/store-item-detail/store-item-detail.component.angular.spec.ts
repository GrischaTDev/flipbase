import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogProductMedia } from '../../../../core/models/flipbase.models';
import { SellableItemRef } from '../../../../core/models/store.models';
import { MediaService } from '../../../../core/services/media.service';
import { StoreService } from '../../../../core/services/store.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ProductPageSeoService } from '../../services/product-page-seo.service';
import { StoreItemDetailComponent } from './store-item-detail.component';

describe('Shop-Produktdetail', () => {
  const product: SellableItemRef = {
    id: 'product-1',
    workspaceId: 'ws-1',
    kind: 'catalog_product',
    title: 'Kamera',
    description: 'Mit Objektiv',
    unitPrice: 95,
    availableQuantity: 2,
  };
  const photo: CatalogProductMedia = {
    id: 'photo-1',
    catalog_product_id: product.id,
    workspace_id: 'ws-1',
    is_primary: true,
    sort_order: 0,
    storage_path: 'private/path.webp',
  };
  const products = signal<SellableItemRef[]>([]);
  const workspace = signal<{ id: string } | null>({ id: 'ws-1' });
  const media = {
    loadProductMedia: vi.fn<() => Promise<CatalogProductMedia[]>>(),
    getMediaUrl: vi.fn((path: string) => `signed:${path}`),
    reportMediaFailure: vi.fn(),
  };
  const addToCart = vi.fn();
  const navigate = vi.fn();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let component: StoreItemDetailComponent;

  beforeEach(() => {
    products.set([product]);
    workspace.set({ id: 'ws-1' });
    media.loadProductMedia.mockReset().mockResolvedValue([photo]);
    media.getMediaUrl.mockClear();
    media.reportMediaFailure.mockClear();
    addToCart.mockClear();
    navigate.mockClear();
    params = new BehaviorSubject(convertToParamMap({ id: product.id }));
    TestBed.configureTestingModule({
      providers: [
        ProductPageSeoService,
        {
          provide: StoreService,
          useValue: {
            publicProducts: products,
            storeSettings: signal({ storeName: 'Mein Shop' }),
            addToCart,
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        { provide: MediaService, useValue: media },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new StoreItemDetailComponent());
  });
  afterEach(() => TestBed.resetTestingModule());

  it('lädt echte Katalogbilder, nutzt signierte URLs und übergibt den Verkaufspreis an den Warenkorb', async () => {
    TestBed.tick();
    await Promise.resolve();
    expect(media.loadProductMedia).toHaveBeenCalledWith(product.id);
    expect(component.item()).toEqual(product);
    expect(component.activeImageUrl()).toBe('signed:private/path.webp');
    component.onAddToCart(product);
    expect(addToCart).toHaveBeenCalledWith(product);
    component.onBuyNow(product);
    expect(navigate).toHaveBeenCalledWith(['/shop/checkout']);
    expect(component.getItemPrice(product)).toBe(95);
  });

  it('reagiert auf neue Route-IDs und zeigt Einzelstückbilder ohne Katalogabfrage', async () => {
    TestBed.tick();
    await Promise.resolve();
    const piece: SellableItemRef = {
      ...product,
      id: 'piece',
      kind: 'inventory_item',
      media: [
        {
          id: 'piece-photo',
          inventory_item_id: 'piece',
          storage_path: 'piece.webp',
          is_primary: true,
        },
      ],
    };
    products.set([product, piece]);
    component.activeImageIndex.set(5);
    params.next(convertToParamMap({ id: piece.id }));
    TestBed.tick();
    expect(component.item()).toEqual(piece);
    expect(component.activeImageIndex()).toBe(0);
    expect(component.activeImageUrl()).toBe('signed:piece.webp');
    expect(media.loadProductMedia).toHaveBeenCalledTimes(1);
  });

  it('verwirft eine verspätete Galerie nach Workspacewechsel', async () => {
    let resolve!: (photos: CatalogProductMedia[]) => void;
    media.loadProductMedia.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    TestBed.tick();
    workspace.set({ id: 'ws-2' });
    products.set([]);
    expect(component.images()).toEqual([]);
    TestBed.tick();
    resolve([photo]);
    await Promise.resolve();
    expect(component.images()).toEqual([]);
    expect(component.item()).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    component.onAddToCart(product);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('filtert falsche Medien und meldet Ladefehler ohne vorherige Bilder anzuzeigen', async () => {
    media.loadProductMedia.mockResolvedValue([
      { ...photo, workspace_id: 'ws-2' },
      { ...photo, id: 'other-product', catalog_product_id: 'different' },
      photo,
    ]);
    TestBed.tick();
    await Promise.resolve();
    expect(component.images()).toHaveLength(1);
    media.loadProductMedia.mockRejectedValue(new Error('offline'));
    products.set([{ ...product, title: 'Geändert' }]);
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.images()).toEqual([]);
    expect(component.imageError()).toBe(true);
  });

  it('entfernt einen zurückgezogenen Artikel auch bei direktem URL-Zugriff', () => {
    TestBed.tick();
    products.set([]);
    TestBed.tick();
    expect(component.item()).toBeNull();
    expect(document.title).toBe('Mein Shop');
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('blendet defekte Bilder aus und lässt eine neu signierte URL wieder anzeigen', async () => {
    TestBed.tick();
    await Promise.resolve();
    const failedUrl = component.activeImageUrl();
    component.onImageError(photo.storage_path, failedUrl);
    expect(component.activeImageUrl()).toBe('');
    expect(component.imageDisplayError()).toBe(true);
    expect(media.reportMediaFailure).toHaveBeenCalledWith(photo.storage_path);
    component.onImageError(photo.storage_path, failedUrl);
    expect(media.reportMediaFailure).toHaveBeenCalledTimes(1);
    media.getMediaUrl.mockReturnValueOnce('signed:refreshed');
    expect(component.photoUrl(photo.storage_path)).toBe('signed:refreshed');
  });
});
