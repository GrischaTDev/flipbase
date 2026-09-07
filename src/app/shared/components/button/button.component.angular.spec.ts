import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ButtonComponent } from './button.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('ButtonComponent', () => {
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      variant: ['variant', 1, null],
      size: ['size', 1, null],
      loading: ['loading', 1, null],
      disabled: ['disabled', 1, null],
      icon: ['icon', 1, null],
      iconPosition: ['iconPosition', 1, null],
      iconOnly: ['iconOnly', 1, null],
      fullWidth: ['fullWidth', 1, null],
      type: ['type', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
      title: ['title', 1, null],
      link: ['link', 1, null],
      queryParams: ['queryParams', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      variant: 'variant',
      size: 'size',
      loading: 'loading',
      disabled: 'disabled',
      icon: 'icon',
      iconPosition: 'iconPosition',
      iconOnly: 'iconOnly',
      fullWidth: 'fullWidth',
      type: 'type',
      ariaLabel: 'ariaLabel',
      title: 'title',
      link: 'link',
      queryParams: 'queryParams',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ButtonComponent],
      providers: [provideRouter([])],
    });

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should be disabled when disabled input is true', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(component.effectiveDisabled()).toBe(true);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.disabled).toBe(true);
  });

  it('should be disabled and show loading state when loading input is true', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(component.effectiveDisabled()).toBe(true);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('should emit clicked event when active button is clicked', () => {
    let emitted = false;
    component.clicked.subscribe(() => {
      emitted = true;
    });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('renders a slim icon-only action as a square button', () => {
    fixture.componentRef.setInput('size', 'slim');
    fixture.componentRef.setInput('iconOnly', true);
    fixture.componentRef.setInput('ariaLabel', 'Kosten bearbeiten');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.classList).toContain('h-7');
    expect(button.classList).toContain('w-7');
    expect(button.classList).toContain('px-0');
    expect(button.getAttribute('aria-label')).toBe('Kosten bearbeiten');
  });

  it('renders navigation as a native link with query parameters', () => {
    fixture.componentRef.setInput('link', '/audit');
    fixture.componentRef.setInput('queryParams', { purchaseId: 'purchase-1' });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/audit?purchaseId=purchase-1');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('prevents navigation and click output while a linked action is loading', () => {
    fixture.componentRef.setInput('link', '/audit');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let emitted = false;
    component.clicked.subscribe(() => (emitted = true));

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
    link.click();
    expect(emitted).toBe(false);
  });
});
