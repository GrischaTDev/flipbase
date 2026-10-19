import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductThumbnailComponent } from './product-thumbnail.component';

interface InputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('ProductThumbnailComponent', () => {
  let fixture: ComponentFixture<ProductThumbnailComponent>;
  let saved: InputMetadata;

  beforeEach(() => {
    const metadata = (ProductThumbnailComponent as unknown as { ɵcmp: InputMetadata }).ɵcmp;
    saved = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    metadata.inputs = {
      src: ['src', 1, null],
      alt: ['alt', 1, null],
      size: ['size', 1, null],
      fit: ['fit', 1, null],
      priority: ['priority', 1, null],
    };
    metadata.declaredInputs = {
      src: 'src',
      alt: 'alt',
      size: 'size',
      fit: 'fit',
      priority: 'priority',
    };
    TestBed.configureTestingModule({ imports: [ProductThumbnailComponent] });
    fixture = TestBed.createComponent(ProductThumbnailComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    const metadata = (ProductThumbnailComponent as unknown as { ɵcmp: InputMetadata }).ɵcmp;
    Object.assign(metadata, saved);
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt ohne Bild einen neutralen, dekorativen Platzhalter statt einer defekten Bildadresse', () => {
    expect(host().querySelector('img')).toBeNull();
    expect(host().querySelector('[data-product-placeholder]')).not.toBeNull();
    expect(host().querySelector('[role="img"]')).toBeNull();
  });

  it('zeigt die übergebene Bildadresse und zugängliche Beschreibung', () => {
    fixture.componentRef.setInput('src', '/images/product.webp');
    fixture.componentRef.setInput('alt', 'Schuh links');
    fixture.detectChanges();
    expect(host().querySelector('img')?.getAttribute('src')).toBe('/images/product.webp');
    expect(host().querySelector('img')?.alt).toBe('Schuh links');
    expect(host().querySelector('img')?.getAttribute('loading')).toBe('lazy');
  });

  it('lädt priorisierte Listenbilder ohne zusätzliche Lazy-Loading-Pause', () => {
    fixture.componentRef.setInput('src', '/images/product.webp');
    fixture.componentRef.setInput('priority', true);
    fixture.detectChanges();
    expect(host().querySelector('img')?.getAttribute('loading')).toBe('eager');
  });

  it('füllt Gesprächsbilder aus, ohne andere Produktansichten zuzuschneiden', () => {
    fixture.componentRef.setInput('size', 'sm');
    fixture.componentRef.setInput('src', '/images/product.webp');
    fixture.detectChanges();
    expect(host().querySelector('img')?.classList).toContain('object-contain');
    fixture.componentRef.setInput('fit', 'cover');
    fixture.detectChanges();
    expect(host().querySelector('img')?.classList).toContain('object-cover');
    expect(host().querySelector('img')?.classList).not.toContain('object-contain');
  });

  it('ersetzt ein fehlgeschlagenes Bild und versucht eine neue Quelle anschließend wieder', () => {
    const failure = vi.fn();
    fixture.componentInstance.imageFailed.subscribe(failure);
    fixture.componentRef.setInput('src', '/missing.webp');
    fixture.componentRef.setInput('alt', 'Schuh links');
    fixture.detectChanges();
    const image = host().querySelector('img');
    expect(image).not.toBeNull();
    image?.dispatchEvent(new Event('error'));
    expect(failure).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(host().querySelector('img')).toBeNull();
    const placeholder = host().querySelector('[data-product-placeholder]');
    expect(placeholder?.getAttribute('role')).toBe('img');
    expect(placeholder?.getAttribute('aria-label')).toBe('Schuh links');
    expect(placeholder?.hasAttribute('aria-hidden')).toBe(false);
    fixture.componentRef.setInput('src', '/replacement.webp');
    fixture.detectChanges();
    expect(host().querySelector('img')?.getAttribute('src')).toBe('/replacement.webp');
  });

  it('entfernt beim Leeren der Quelle sofort das bisherige Workspace-Bild', () => {
    fixture.componentRef.setInput('src', '/previous-workspace.webp');
    fixture.detectChanges();
    expect(host().querySelector('img')).not.toBeNull();
    fixture.componentRef.setInput('src', null);
    fixture.detectChanges();
    expect(host().querySelector('img')).toBeNull();
    expect(host().querySelector('[data-product-placeholder]')).not.toBeNull();
  });

  it('passt den Rahmen im Detail dem Foto an, ohne Rand und ohne Beschnitt', () => {
    fixture.componentRef.setInput('size', 'listing-detail');
    fixture.componentRef.setInput('src', '/images/detail.webp');
    fixture.detectChanges();
    const frame = host().firstElementChild;
    const image = host().querySelector('img');
    // Der Rahmen umschließt das Foto: keine feste Höhe, keine volle Breite, kein Einpassen.
    expect(frame?.classList.contains('max-w-[360px]')).toBe(true);
    expect(frame?.classList.contains('h-[260px]')).toBe(false);
    expect(frame?.classList.contains('w-full')).toBe(false);
    expect(image?.classList.contains('h-auto')).toBe(true);
    expect(image?.classList.contains('max-h-[320px]')).toBe(true);
    expect(image?.classList.contains('size-full')).toBe(false);
    expect(image?.classList.contains('object-contain')).toBe(false);
    expect(image?.classList.contains('object-cover')).toBe(false);
  });

  it('zeigt im Detail bei Bildausfall einen festen Hochformat-Platzhalter', () => {
    fixture.componentRef.setInput('size', 'listing-detail');
    fixture.componentRef.setInput('src', '/images/detail.webp');
    fixture.detectChanges();
    const frame = host().firstElementChild;
    host().querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host().firstElementChild).toBe(frame);
    expect(host().querySelector('[data-product-placeholder]')).not.toBeNull();
    expect(frame?.classList.contains('aspect-[3/4]')).toBe(true);
    expect(frame?.classList.contains('w-full')).toBe(true);
    expect(frame?.classList.contains('max-w-[360px]')).toBe(true);
  });
  it('zeigt Labelreferenzen im breiten Rahmen, ohne sie zu beschneiden', () => {
    fixture.componentRef.setInput('size', 'reference');
    fixture.componentRef.setInput('src', '/images/reference.webp');
    fixture.detectChanges();
    expect(host().firstElementChild?.classList.contains('aspect-[4/3]')).toBe(true);
    expect(host().firstElementChild?.classList.contains('h-[260px]')).toBe(false);
    expect(host().querySelector('img')?.classList.contains('object-contain')).toBe(true);
  });

  it('hält Kleidungsfarbe stabil und verwendet für Profile weiterhin den neutralen Platzhalter', () => {
    fixture.componentRef.setInput('alt', 'Patagonia Fleecejacke');
    fixture.detectChanges();
    const color = (fixture.nativeElement.firstElementChild as HTMLElement).style.backgroundColor;
    expect(color).not.toBe('');
    expect(fixture.nativeElement.querySelector('svg[lucideShirt]')).not.toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement.firstElementChild as HTMLElement).style.backgroundColor).toBe(
      color,
    );
    fixture.componentRef.setInput('size', 'profile');
    fixture.detectChanges();
    expect((fixture.nativeElement.firstElementChild as HTMLElement).style.backgroundColor).toBe('');
    expect(fixture.nativeElement.querySelector('svg[lucideImage]')).not.toBeNull();
  });
});
