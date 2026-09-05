import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      fullWidth: ['fullWidth', 1, null],
      type: ['type', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
      title: ['title', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      variant: 'variant',
      size: 'size',
      loading: 'loading',
      disabled: 'disabled',
      icon: 'icon',
      iconPosition: 'iconPosition',
      fullWidth: 'fullWidth',
      type: 'type',
      ariaLabel: 'ariaLabel',
      title: 'title',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ButtonComponent],
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
});
