import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TextFieldComponent } from './text-field.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('TextFieldComponent', () => {
  let component: TextFieldComponent;
  let fixture: ComponentFixture<TextFieldComponent>;

  beforeEach(async () => {
    const metadata = (TextFieldComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      label: ['label', 1, null],
      labelHidden: ['labelHidden', 1, null],
      placeholder: ['placeholder', 1, null],
      type: ['type', 1, null],
      multiline: ['multiline', 1, null],
      prefix: ['prefix', 1, null],
      suffix: ['suffix', 1, null],
      prefixIcon: ['prefixIcon', 1, null],
      clearable: ['clearable', 1, null],
      monospaced: ['monospaced', 1, null],
      error: ['error', 1, null],
      helpText: ['helpText', 1, null],
      disabled: ['disabled', 1, null],
      id: ['id', 1, null],
      autocomplete: ['autocomplete', 1, null],
      required: ['required', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      label: 'label',
      labelHidden: 'labelHidden',
      placeholder: 'placeholder',
      type: 'type',
      multiline: 'multiline',
      prefix: 'prefix',
      suffix: 'suffix',
      prefixIcon: 'prefixIcon',
      clearable: 'clearable',
      monospaced: 'monospaced',
      error: 'error',
      helpText: 'helpText',
      disabled: 'disabled',
      id: 'id',
      autocomplete: 'autocomplete',
      required: 'required',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TextFieldComponent],
    });

    fixture = TestBed.createComponent(TextFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (TextFieldComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should render label and connect to input', () => {
    fixture.componentRef.setInput('label', 'Lieferantenname');
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('label');
    const input = fixture.nativeElement.querySelector('input');
    expect(label.textContent).toContain('Lieferantenname');
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('kennzeichnet Pflichtfelder sichtbar, ohne den zugänglichen Namen zu verändern', () => {
    fixture.componentRef.setInput('label', 'Verkäufer');
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();

    const marker = fixture.nativeElement.querySelector('[data-required-indicator]');
    const input = fixture.nativeElement.querySelector('input');

    expect(marker?.textContent?.trim()).toBe('*');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(input.required).toBe(true);
  });

  it('should render error and mark input invalid', () => {
    fixture.componentRef.setInput('error', 'Ungültige Eingabe');
    fixture.detectChanges();

    const errorMsg = fixture.nativeElement.querySelector('p');
    const input = fixture.nativeElement.querySelector('input');
    expect(errorMsg.textContent).toContain('Ungültige Eingabe');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('should render textarea when multiline is true', () => {
    fixture.componentRef.setInput('multiline', true);
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeTruthy();
  });

  it('should clear value when handleClear is called', () => {
    component.writeValue('Test');
    fixture.detectChanges();
    expect(component.value()).toBe('Test');

    fixture.componentRef.setInput('clearable', true);
    fixture.detectChanges();

    const clearBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[aria-label="Eingabe leeren"]',
    );
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    fixture.detectChanges();
    expect(component.value()).toBe('');
  });
});
