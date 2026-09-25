import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttributePickerComponent } from './attribute-picker.component';

interface ComponentMetadata {
  ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
}
let restoreMetadata = (): void => undefined;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  const metadata = (AttributePickerComponent as unknown as ComponentMetadata).ɵcmp;
  const inputs = metadata.inputs;
  const declared = metadata.declaredInputs;
  metadata.inputs = { ...inputs };
  metadata.declaredInputs = { ...declared };
  for (const name of ['label', 'options', 'multiple']) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
  restoreMetadata = () => {
    metadata.inputs = inputs;
    metadata.declaredInputs = declared;
  };
});

afterEach(() => {
  TestBed.resetTestingModule();
  restoreMetadata();
});

function create(multiple = false) {
  const fixture = TestBed.createComponent(AttributePickerComponent);
  fixture.componentRef.setInput('label', 'Material');
  fixture.componentRef.setInput('options', ['Leder', 'Textil', 'Baumwolle']);
  fixture.componentRef.setInput('multiple', multiple);
  const values: string[] = [];
  fixture.componentInstance.registerOnChange((value) => values.push(value));
  fixture.detectChanges();
  return { fixture, values };
}

describe('AttributePickerComponent', () => {
  it('wählt mehrere Materialien und erhält vorhandene freie Bezeichnungen', () => {
    const { fixture, values } = create(true);
    fixture.componentInstance.writeValue('Hersteller-Mix, Leder');
    fixture.componentInstance.choose('Baumwolle');
    fixture.detectChanges();

    expect(values).toEqual(['Hersteller-Mix, Leder · Baumwolle']);
    expect(fixture.nativeElement.textContent).toContain('Hersteller-Mix, Leder');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[aria-label="Hersteller-Mix, Leder entfernen"]')
        ?.closest('.linear-input'),
    ).not.toBeNull();
    fixture.componentInstance.remove('Hersteller-Mix, Leder');
    expect(values.at(-1)).toBe('Baumwolle');
  });

  it('zeigt nach einer Farbauswahl beim erneuten Öffnen wieder alle Vorschläge', () => {
    const { fixture } = create();
    fixture.componentInstance.open();
    fixture.componentInstance.choose('Leder');
    fixture.detectChanges();

    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(fixture.componentInstance.query()).toBe('');
    expect(fixture.componentInstance.matches()).toEqual(['Leder', 'Textil', 'Baumwolle']);
    expect(fixture.nativeElement.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it('zeigt bei geöffneter Suche keine AXE-Verstöße', async () => {
    const { fixture } = create();
    fixture.componentInstance.open();
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  });
});
