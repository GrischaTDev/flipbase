import '@angular/compiler';
import { ɵresolveComponentResources, ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NumberInputComponent } from './number-input.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

class NumberInputFormFixture {
  readonly price = new FormControl<number | null>(null);
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
