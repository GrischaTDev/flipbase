import '@angular/compiler';
import { ElementRef, Renderer2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CropperFrameAccessibilityDirective } from './cropper-frame-accessibility.directive';

describe('CropperFrameAccessibilityDirective', () => {
  let host: HTMLElement;
  let directive: CropperFrameAccessibilityDirective;
  const renderer = {
    setAttribute: vi.fn((element: Element, name: string, value: string) =>
      element.setAttribute(name, value),
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('image-cropper');
    TestBed.configureTestingModule({
      providers: [
        { provide: ElementRef, useValue: new ElementRef(host) },
        { provide: Renderer2, useValue: renderer },
      ],
    });
    directive = TestBed.runInInjectionContext(() => new CropperFrameAccessibilityDirective());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('setzt die Rolle erst nach dem Rendern und erhält Namen und Tastaturfokus', () => {
    directive.updateFrame();
    host.innerHTML = '<div class="ngx-ic-cropper" tabindex="0" aria-label="Bildausschnitt"></div>';
    expect(renderer.setAttribute).not.toHaveBeenCalled();
    TestBed.tick();
    const frame = host.querySelector('.ngx-ic-cropper')!;
    expect(frame.getAttribute('role')).toBe('group');
    expect(frame.getAttribute('aria-label')).toBe('Bildausschnitt');
    expect(frame.getAttribute('tabindex')).toBe('0');
  });

  it('erfasst einen neu aufgebauten Rahmen ohne fremde Elemente zu verändern', () => {
    const other = document.createElement('div');
    other.className = 'ngx-ic-cropper';
    document.body.append(other);
    try {
      directive.updateFrame();
      TestBed.tick();
      expect(renderer.setAttribute).not.toHaveBeenCalled();
      host.innerHTML = '<div class="ngx-ic-cropper" aria-label="Neuer Ausschnitt"></div>';
      directive.updateFrame();
      TestBed.tick();
      expect(host.firstElementChild?.getAttribute('role')).toBe('group');
      expect(other.hasAttribute('role')).toBe(false);
    } finally {
      other.remove();
    }
  });

  it('verwirft einen geplanten Zugriff nach dem Abbau', () => {
    host.innerHTML = '<div class="ngx-ic-cropper"></div>';
    directive.updateFrame();
    TestBed.resetTestingModule();
    expect(renderer.setAttribute).not.toHaveBeenCalled();
  });
});
