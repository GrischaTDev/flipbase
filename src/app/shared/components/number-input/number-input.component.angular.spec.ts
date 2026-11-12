import '@angular/compiler';
import {
  ɵresolveComponentResources,
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NumberInputComponent } from './number-input.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

class NumberInputFormFixture {
  readonly price = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(0.01),
  ]);
  readonly minimumPrice = signal<number | null>(5);
  readonly maximumPrice = signal<number | null>(100);
  total: number | null = null;

  recalculate(): void {
    this.total = this.price.value === null ? null : this.price.value * 3;
  }
}

Component({
  imports: [NumberInputComponent, ReactiveFormsModule],
  templateUrl: './number-input-form.fixture.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})(NumberInputFormFixture);

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('NumberInputComponent', () => {
  let component: NumberInputComponent;
  let fixture: ComponentFixture<NumberInputComponent>;

  beforeEach(async () => {
    const metadata = (NumberInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
      outputs: metadata.outputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      value: ['value', 1, null],
      placeholder: ['placeholder', 1, null],
      step: ['step', 1, null],
      min: ['min', 1, null],
      max: ['max', 1, null],
      unit: ['unit', 1, null],
      id: ['id', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
      asCurrency: ['asCurrency', 1, null],
      disabled: ['disabled', 1, null],
      showStepper: ['showStepper', 1, null],
      platzhalter: ['platzhalter', 1, null],
      schritt: ['schritt', 1, null],
      minimum: ['minimum', 1, null],
      maximum: ['maximum', 1, null],
      einheit: ['einheit', 1, null],
      feldId: ['feldId', 1, null],
      beschriftung: ['beschriftung', 1, null],
      alsBetrag: ['alsBetrag', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      value: 'value',
      placeholder: 'placeholder',
      step: 'step',
      min: 'min',
      max: 'max',
      unit: 'unit',
      id: 'id',
      ariaLabel: 'ariaLabel',
      asCurrency: 'asCurrency',
      disabled: 'disabled',
      showStepper: 'showStepper',
      platzhalter: 'platzhalter',
      schritt: 'schritt',
      minimum: 'minimum',
      maximum: 'maximum',
      einheit: 'einheit',
      feldId: 'feldId',
      beschriftung: 'beschriftung',
      alsBetrag: 'alsBetrag',
    };
    metadata.outputs = { ...metadata.outputs, valueChange: 'value' };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [NumberInputComponent],
    });

    fixture = TestBed.createComponent(NumberInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (NumberInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
    metadata.outputs = inputMetadataSnapshot.outputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('notifies listeners only after the reactive form contains the entered value', () => {
    const formFixture = TestBed.createComponent(NumberInputFormFixture);
    formFixture.detectChanges();
    const input = (formFixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Number field missing');

    input.value = '12';
    input.dispatchEvent(new Event('input'));

    expect(formFixture.componentInstance.price.value).toBe(12);
    expect(formFixture.componentInstance.total).toBe(36);
    expect(formFixture.componentInstance.price.untouched).toBe(true);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(formFixture.componentInstance.price.value).toBeNull();
    expect(formFixture.componentInstance.total).toBeNull();
  });

  it('keeps the native decimal text while updating the reactive form and total', () => {
    const formFixture = TestBed.createComponent(NumberInputFormFixture);
    formFixture.detectChanges();
    const input = (formFixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Number field missing');

    for (const [text, amount, total] of [
      ['12', 12, 36],
      ['12.30', 12.3, 36.9],
      ['0.05', 0.05, 0.15],
    ] as const) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      formFixture.detectChanges();
      expect(input.value).toBe(text);
      expect(formFixture.componentInstance.price.value).toBe(amount);
      expect(formFixture.componentInstance.total).toBeCloseTo(total);
    }
    expect(formFixture.componentInstance.price.dirty).toBe(true);
    expect(formFixture.componentInstance.price.untouched).toBe(true);
    input.dispatchEvent(new Event('blur'));
    expect(formFixture.componentInstance.price.touched).toBe(true);
  });

  it('preserves decimal text through signal binding and accepts later parent changes', () => {
    const formFixture = TestBed.createComponent(NumberInputFormFixture);
    formFixture.detectChanges();
    const inputs = (formFixture.nativeElement as HTMLElement).querySelectorAll('input');
    const minimumInput = inputs[1];
    const maximumInput = inputs[2];
    if (!minimumInput || !maximumInput) throw new Error('Signal number fields missing');
    expect(minimumInput.value).toBe('5');
    expect(maximumInput.value).toBe('100');

    minimumInput.value = '12.30';
    minimumInput.dispatchEvent(new Event('input'));
    maximumInput.value = '99.50';
    maximumInput.dispatchEvent(new Event('input'));
    formFixture.detectChanges();
    expect(formFixture.componentInstance.minimumPrice()).toBe(12.3);
    expect(formFixture.componentInstance.maximumPrice()).toBe(99.5);
    expect(minimumInput.value).toBe('12.30');
    expect(maximumInput.value).toBe('99.50');

    formFixture.componentInstance.minimumPrice.set(null);
    formFixture.componentInstance.maximumPrice.set(75.25);
    formFixture.detectChanges();
    expect(minimumInput.value).toBe('');
    expect(maximumInput.value).toBe('75.25');
  });

  it('clears, validates and resets an entered price without stale display text', () => {
    const formFixture = TestBed.createComponent(NumberInputFormFixture);
    formFixture.detectChanges();
    const input = (formFixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Number field missing');

    input.value = '0';
    input.dispatchEvent(new Event('input'));
    expect(formFixture.componentInstance.price.hasError('min')).toBe(true);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(formFixture.componentInstance.price.value).toBeNull();
    expect(formFixture.componentInstance.price.hasError('required')).toBe(true);
    formFixture.componentInstance.price.setValue(19.95);
    formFixture.detectChanges();
    expect(input.value).toBe('19.95');
    expect(formFixture.componentInstance.price.valid).toBe(true);
    formFixture.componentInstance.price.reset();
    formFixture.detectChanges();
    expect(input.value).toBe('');
    expect(formFixture.componentInstance.price.pristine).toBe(true);
    expect(formFixture.componentInstance.price.untouched).toBe(true);
  });

  it('forwards disabled state without reporting a price change', () => {
    const formFixture = TestBed.createComponent(NumberInputFormFixture);
    formFixture.detectChanges();
    const input = (formFixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Number field missing');
    formFixture.componentInstance.price.setValue(12.34);
    formFixture.componentInstance.price.disable();
    formFixture.detectChanges();
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('12.34');
    formFixture.componentInstance.price.enable();
    formFixture.detectChanges();
    expect(input.disabled).toBe(false);
    expect(formFixture.componentInstance.price.value).toBe(12.34);
    expect(formFixture.componentInstance.price.pristine).toBe(true);
  });

  it('retains native numeric constraints, labels and the disabled signal input', () => {
    fixture.componentRef.setInput('min', 0.01);
    fixture.componentRef.setInput('max', 999.99);
    fixture.componentRef.setInput('step', 0.01);
    fixture.componentRef.setInput('ariaLabel', 'Price');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Number field missing');
    expect(input.type).toBe('number');
    expect(input.min).toBe('0.01');
    expect(input.max).toBe('999.99');
    expect(input.step).toBe('0.01');
    expect(input.getAttribute('aria-label')).toBe('Price');
    expect(input.disabled).toBe(true);
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(input.disabled).toBe(false);
  });

  it('supports a plain amount field without increment buttons while retaining input changes', () => {
    fixture.componentRef.setInput('showStepper', false);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('button').length).toBe(0);
    const input = host.querySelector('input');
    if (!input) throw new Error('Number field missing');
    input.value = '12.34';
    input.dispatchEvent(new Event('input'));
    expect(component.value()).toBe(12.34);
  });

  it('renders no visual stepper even when the legacy option is enabled', () => {
    fixture.componentRef.setInput('showStepper', true);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('[data-number-stepper]')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  it('should increment value by step', () => {
    component.writeValue(10);
    component.increment();
    expect(component.value()).toBe(11);
  });

  it('should decrement value by step', () => {
    component.writeValue(10);
    component.decrement();
    expect(component.value()).toBe(9);
  });

  it('should respect min and max bounds', () => {
    fixture.componentRef.setInput('min', 0);
    fixture.componentRef.setInput('max', 10);
    fixture.detectChanges();

    component.writeValue(10);
    component.increment();
    expect(component.value()).toBe(10);

    component.writeValue(0);
    component.decrement();
    expect(component.value()).toBe(0);
  });
});
