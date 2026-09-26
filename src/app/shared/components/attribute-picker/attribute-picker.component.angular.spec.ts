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
  for (const name of ['label', 'options', 'multiple', 'swatches']) {
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
  it('zeigt den gewählten Farbwert beim Öffnen und unmittelbar nach der Auswahl im Eingabefeld', () => {
    const { fixture, values } = create();
    fixture.componentRef.setInput('options', ['Rot', 'Blau']);
    fixture.componentInstance.writeValue('Rot');
    fixture.detectChanges();

    const field = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    field.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    expect(field.value).toBe('Rot');

    fixture.componentInstance.choose('Blau');
    fixture.detectChanges();
    expect(values).toEqual(['Blau']);
    expect(fixture.componentInstance.isOpen()).toBe(true);
    expect(field.value).toBe('Blau');
  });

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

  it('zeigt bei ausgewählter Farbe weiterhin alle Vorschläge', () => {
    const { fixture } = create();
    fixture.componentInstance.open();
    fixture.componentInstance.choose('Leder');
    fixture.detectChanges();

    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(fixture.componentInstance.query()).toBe('Leder');
    expect(fixture.componentInstance.matches()).toEqual(['Leder', 'Textil', 'Baumwolle']);
    expect(fixture.nativeElement.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it('zeigt Farbpunkte am gewählten Wert und in der Vorschlagsliste', () => {
    const { fixture } = create();
    fixture.componentRef.setInput('options', ['Anthrazit', 'Beige']);
    fixture.componentRef.setInput('swatches', { Anthrazit: '#383b40', Beige: '#d9c5a1' });
    fixture.componentInstance.writeValue('Anthrazit');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.linear-input span[aria-hidden="true"]')
        ?.getAttribute('style'),
    ).toContain('background');
    fixture.componentInstance.open();
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[role="option"] span[aria-hidden="true"]',
      ),
    ).toHaveLength(2);
  });

  it('zeigt bei geöffneter Suche keine AXE-Verstöße', async () => {
    const { fixture } = create();
    fixture.componentInstance.open();
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  });
});
