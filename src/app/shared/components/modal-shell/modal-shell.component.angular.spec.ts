import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { LucideInfo } from '@lucide/angular';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ModalShellComponent } from './modal-shell.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('ModalShellComponent', () => {
  let component: ModalShellComponent;
  let fixture: ComponentFixture<ModalShellComponent>;

  beforeEach(async () => {
    const metadata = (ModalShellComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      title: ['title', 1, null],
      subtitle: ['subtitle', 1, null],
      icon: ['icon', 1, null],
      iconTone: ['iconTone', 1, null],
      size: ['size', 1, null],
      closeOnBackdrop: ['closeOnBackdrop', 1, null],
      hasFooter: ['hasFooter', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      title: 'title',
      subtitle: 'subtitle',
      icon: 'icon',
      iconTone: 'iconTone',
      size: 'size',
      closeOnBackdrop: 'closeOnBackdrop',
      hasFooter: 'hasFooter',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ModalShellComponent],
    });

    fixture = TestBed.createComponent(ModalShellComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Einkauf erfassen');
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (ModalShellComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create and render dialog title', () => {
    expect(component).toBeTruthy();
    const h2 = fixture.nativeElement.querySelector('h2');
    expect(h2.textContent).toContain('Einkauf erfassen');
  });

  it('uses the shared brand tone for branded modal icons', () => {
    fixture.componentRef.setInput('iconTone', 'brand');
    fixture.componentRef.setInput('icon', LucideInfo);
    fixture.detectChanges();

    const iconWrapper = fixture.nativeElement.querySelector('header div.border');
    expect(iconWrapper?.className).toContain('bg-fb-brand-surface');
    expect(iconWrapper?.className).toContain('border-fb-brand-border');
  });

  it('should emit closed when close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => {
      closed = true;
    });

    const closeBtn = fixture.nativeElement.querySelector('button[aria-label="Dialog schließen"]');
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    expect(closed).toBe(true);
  });

  it('keeps the dialog in the viewport while only its content scrolls', () => {
    const overlay = fixture.nativeElement.querySelector('[role="dialog"]');
    const card = overlay.querySelector('.linear-surface');
    const content = card.querySelector('.overflow-y-auto');

    expect(overlay.classList.contains('overflow-hidden')).toBe(true);
    expect(overlay.classList.contains('overflow-y-auto')).toBe(false);
    expect(card.className).toContain('max-h-[calc(100dvh-1.5rem)]');
    expect(content.classList.contains('overscroll-contain')).toBe(true);
  });
});
