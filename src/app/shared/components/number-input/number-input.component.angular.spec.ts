import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NumberInputComponent } from './number-input.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

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
      platzhalter: 'platzhalter',
      schritt: 'schritt',
      minimum: 'minimum',
      maximum: 'maximum',
      einheit: 'einheit',
      feldId: 'feldId',
      beschriftung: 'beschriftung',
      alsBetrag: 'alsBetrag',
    };

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
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
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
