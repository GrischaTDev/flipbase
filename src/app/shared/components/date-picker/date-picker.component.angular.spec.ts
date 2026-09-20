import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatePickerComponent } from './date-picker.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('DatePickerComponent', () => {
  let component: DatePickerComponent;
  let fixture: ComponentFixture<DatePickerComponent>;

  beforeEach(async () => {
    const metadata = (DatePickerComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      value: ['value', 1, null],
      id: ['id', 1, null],
      placeholder: ['placeholder', 1, null],
      disabled: ['disabled', 1, null],
      required: ['required', 1, null],
      feldId: ['feldId', 1, null],
      platzhalter: ['platzhalter', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      value: 'value',
      id: 'id',
      placeholder: 'placeholder',
      disabled: 'disabled',
      required: 'required',
      feldId: 'feldId',
      platzhalter: 'platzhalter',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DatePickerComponent],
    });

    fixture = TestBed.createComponent(DatePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (DatePickerComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('marks the input as required when configured', () => {
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).required).toBe(true);
  });

  it('should format ISO date correctly for display', () => {
    component.writeValue('2026-09-05');
    fixture.detectChanges();
    expect(component.anzeige()).toBe('05.09.2026');
  });

  it('should toggle calendar open/closed', () => {
    expect(component.istOffen()).toBe(false);
    const mockEvent = new MouseEvent('click');
    component.schalteUm(mockEvent);
    expect(component.istOffen()).toBe(true);
    component.schliesse();
    expect(component.istOffen()).toBe(false);
  });

  it('supports roving keyboard navigation inside the calendar', () => {
    component.writeValue('2026-09-05');
    component.toggle(new MouseEvent('click'));

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    component.onCalendarKeydown(event, '2026-09-05');

    expect(component.focusedDate()).toBe('2026-09-06');
    expect(event.defaultPrevented).toBe(true);
  });

  it('rejects impossible calendar dates while parsing input', () => {
    component.writeValue('2026-09-05');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '31.02.2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(component.value()).toBe('2026-09-05');
  });
});
