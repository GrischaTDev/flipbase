import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomCheckboxComponent } from './custom-checkbox.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  const metadata = (CustomCheckboxComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  };
  metadata.inputs = {
    ...metadata.inputs,
    checked: ['checked', 1, null],
    disabled: ['disabled', 1, null],
    indeterminate: ['indeterminate', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    checked: 'checked',
    disabled: 'disabled',
    indeterminate: 'indeterminate',
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CustomCheckboxComponent],
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  if (!inputMetadataSnapshot) return;

  const metadata = (CustomCheckboxComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = inputMetadataSnapshot.inputs;
  metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  inputMetadataSnapshot = null;
});

function createCheckbox() {
  const fixture = TestBed.createComponent(CustomCheckboxComponent);
  fixture.detectChanges();
  return fixture;
}

function buttonOf(fixture: ReturnType<typeof createCheckbox>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
}

describe('CustomCheckboxComponent', () => {
  it('deaktiviert den nativen Button bei einem disabled-Input und ignoriert Klicks', () => {
    const fixture = createCheckbox();

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const button = buttonOf(fixture);

    expect(button.disabled).toBe(true);
    button.click();
    expect(fixture.componentInstance.checked()).toBe(false);
  });

  it('deaktiviert den nativen Button über setDisabledState und ignoriert Klicks', () => {
    const fixture = createCheckbox();

    fixture.componentInstance.setDisabledState(true);
    fixture.detectChanges();
    const button = buttonOf(fixture);

    expect(button.disabled).toBe(true);
    button.click();
    expect(fixture.componentInstance.checked()).toBe(false);
  });

  it('meldet bei einem aktivierten Klick genau eine Wertänderung', () => {
    const fixture = createCheckbox();
    const onChange = vi.fn<(value: boolean) => void>();
    fixture.componentInstance.registerOnChange(onChange);

    buttonOf(fixture).click();

    expect(fixture.componentInstance.checked()).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it.each([
    ['unchecked', false, false, 'false'],
    ['checked', true, false, 'true'],
    ['mixed', false, true, 'mixed'],
  ] as const)(
    'setzt aria-checked für %s korrekt',
    (_state, checked, indeterminate, ariaChecked) => {
      const fixture = createCheckbox();

      fixture.componentRef.setInput('checked', checked);
      fixture.componentRef.setInput('indeterminate', indeterminate);
      fixture.detectChanges();

      expect(buttonOf(fixture).getAttribute('aria-checked')).toBe(ariaChecked);
    },
  );

  it('überlässt Space und Enter der nativen Buttonsemantik', async () => {
    const template = await readFile(
      resolve('src/app/shared/components/custom-checkbox/custom-checkbox.component.html'),
      'utf8',
    );

    expect(template).not.toMatch(/\((?:key(?:down|up)|keypress)\.(?:space|enter)\)/i);
  });

  it('vermeidet widersprüchliche Cursor-Klassen auf Host und Button', () => {
    const fixture = createCheckbox();
    const host = fixture.nativeElement as HTMLElement;
    const button = buttonOf(fixture);

    expect(button.classList.contains('cursor-pointer')).toBe(false);
    for (const element of [host, button]) {
      expect(
        element.classList.contains('cursor-pointer') &&
          element.classList.contains('cursor-not-allowed'),
      ).toBe(false);
    }
  });

  it.each([
    ['aktiviert', false, false],
    ['deaktiviert', false, true],
    ['gemischt', true, false],
  ] as const)('besteht AXE im Zustand %s', async (_state, indeterminate, disabled) => {
    const fixture = createCheckbox();

    fixture.componentRef.setInput('indeterminate', indeterminate);
    fixture.componentRef.setInput('disabled', disabled);
    fixture.detectChanges();

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
