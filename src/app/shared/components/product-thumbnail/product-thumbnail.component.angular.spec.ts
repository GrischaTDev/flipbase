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
    metadata.inputs = { src: ['src', 1, null], alt: ['alt', 1, null], size: ['size', 1, null] };
    metadata.declaredInputs = { src: 'src', alt: 'alt', size: 'size' };
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
});
