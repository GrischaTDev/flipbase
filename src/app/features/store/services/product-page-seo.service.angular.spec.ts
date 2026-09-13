import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductPageSeoService } from './product-page-seo.service';
import { SellableItemRef } from '../../../core/models/store.models';

describe('Produkt-Metadaten', () => {
  const product: SellableItemRef = {
    id: 'camera',
    kind: 'catalog_product',
    title: 'Kamera',
    description: 'Mit\nObjektiv',
    availableQuantity: 2,
    seoTitle: 'Kamera kaufen',
    seoDescription: 'Individuelle Beschreibung',
    urlHandle: 'meine-kamera',
  };
  beforeEach(() => {
    document.title = 'Flipbase – Reselling OS';
    document.head
      .querySelectorAll('meta[name="description"], meta[name="robots"], link[rel="canonical"]')
      .forEach((node) => node.remove());
    TestBed.configureTestingModule({ providers: [ProductPageSeoService] });
  });
  afterEach(() => TestBed.resetTestingModule());

  it('gibt gespeicherte Metadaten und den stabilen Produktpfad ohne Suchparameter aus', () => {
    const service = TestBed.inject(ProductPageSeoService);
    service.update(product, 'Mein Shop');
    expect(document.title).toBe('Kamera kaufen');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Individuelle Beschreibung',
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${document.location.origin}/shop/item/camera/meine-kamera`,
    );
    service.update({ ...product, seoTitle: '', seoDescription: '' }, 'Mein Shop');
    expect(document.title).toBe('Kamera');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Mit Objektiv',
    );
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it('entfernt alte Produktdaten bei unbekannten oder nicht mehr freigegebenen Artikeln', () => {
    const service = TestBed.inject(ProductPageSeoService);
    service.update(product, 'Mein Shop');
    service.update(null, 'Mein Shop');
    expect(document.title).toBe('Mein Shop');
    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain(
      'noindex',
    );
  });

  it('stellt die vorherigen Metadaten und den Anwendungstitel beim Verlassen wieder her', () => {
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Anwendungsbeschreibung';
    document.head.appendChild(description);
    const service = TestBed.inject(ProductPageSeoService);
    service.update(product, 'Mein Shop');
    TestBed.resetTestingModule();
    expect(document.title).toBe('Flipbase – Reselling OS');
    expect(document.querySelector('meta[name="description"]')).toBe(description);
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('überschreibt keinen inzwischen von der nächsten Seite gesetzten Titel', () => {
    TestBed.inject(ProductPageSeoService).update(product, 'Mein Shop');
    TestBed.inject(Title).setTitle('Nächste Seite');
    TestBed.resetTestingModule();
    expect(document.title).toBe('Nächste Seite');
  });
});
