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
  for (const name of [
    'label',
    'options',
    'multiple',
    'swatches',
    'allowCustom',
    'maxSelected',
    'liveText',
    'clearable',
    'clearOptionLabel',
    'error',
  ]) {
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
  it('verknüpft einen angeforderten Fehler mit dem bedienbaren Eingabefeld', () => {
    const { fixture } = create();
    fixture.componentRef.setInput('error', 'Bitte wähle ein Material.');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = fixture.nativeElement.querySelector(
      '#' + input.getAttribute('aria-describedby'),
    );
    expect(message?.textContent).toContain('Bitte wähle ein Material.');
  });
  it('meldet Suchtext sofort für externe Vorschläge und behält freie Eingaben nur im aktivierten Modus', () => {
    const { fixture, values } = create();
    fixture.componentRef.setInput('liveText', true);
    const queries: string[] = [];
    fixture.componentInstance.queryChange.subscribe((value) => queries.push(value));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Nik';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(queries).toEqual(['Nik']);
    expect(values).toContain('Nik');
  });
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
        '[role="option"] span[aria-hidden="true"][style]',
      ),
    ).toHaveLength(2);
  });

  it('unterstützt mehrere Farben mit Farbpunkten auf den Chips und schaltet gewählte Farben um', () => {
    const { fixture, values } = create(true);
    fixture.componentRef.setInput('label', 'Farbe');
    fixture.componentRef.setInput('options', ['Rot', 'Blau', 'Grün']);
    fixture.componentRef.setInput('swatches', { Rot: '#ef4444', Blau: '#3b82f6', Grün: '#22c55e' });
    fixture.componentInstance.choose('Rot');
    fixture.detectChanges();
    fixture.componentInstance.choose('Blau');
    fixture.detectChanges();

    expect(values).toEqual(['Rot', 'Rot · Blau']);
    const dots = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.linear-input span span[aria-hidden="true"]',
    );
    expect(dots).toHaveLength(2);

    fixture.componentInstance.choose('Rot');
    fixture.detectChanges();
    expect(values.at(-1)).toBe('Blau');
  });

  it('lässt bei festen Werten keine eigene Eingabe zu und hält die Höchstzahl ein', () => {
    const { fixture, values } = create(true);
    fixture.componentRef.setInput('options', ['Rot', 'Blau', 'Grün']);
    fixture.componentRef.setInput('allowCustom', false);
    fixture.componentRef.setInput('maxSelected', 2);
    fixture.componentInstance.choose('Rot');
    fixture.componentInstance.choose('Blau');
    fixture.detectChanges();
    // Die dritte Farbe wird nicht übernommen, solange zwei gewählt sind.
    fixture.componentInstance.choose('Grün');
    fixture.detectChanges();
    expect(values).toEqual(['Rot', 'Rot · Blau']);
    expect(fixture.componentInstance.limitReached()).toBe(true);
    const options = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]'),
    ];
    expect(options.map((option) => option.getAttribute('aria-disabled'))).toEqual([
      null,
      null,
      'true',
    ]);
    // Abwählen bleibt möglich und gibt den Platz wieder frei.
    fixture.componentInstance.choose('Rot');
    fixture.componentInstance.choose('Grün');
    expect(values.at(-1)).toBe('Blau · Grün');
    // Ein nicht vorgegebener Suchtext wird nicht als eigener Wert angeboten.
    const field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    field.value = 'Neon';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.customValue()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Keine Vorschläge');
  });

  it('zeigt bei geöffneter Suche keine AXE-Verstöße', async () => {
    const { fixture } = create();
    fixture.componentInstance.open();
    fixture.detectChanges();
    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  });

  it('lässt eine Einzelauswahl über X-Button, Alle-Option und Leeren wieder abwählen', async () => {
    const { fixture, values } = create();
    fixture.componentRef.setInput('label', 'Marke');
    fixture.componentRef.setInput('options', ['Carhartt', 'Nike']);
    fixture.componentRef.setInput('clearable', true);
    fixture.componentRef.setInput('clearOptionLabel', 'Alle Marken');
    const queries: string[] = [];
    fixture.componentInstance.queryChange.subscribe((value) => queries.push(value));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const field = host.querySelector('input') as HTMLInputElement;
    expect(host.querySelector('[aria-label="Marke entfernen"]')).toBeNull();

    // Auswahl schließt im Clearable-Modus und blendet den X-Button ein.
    fixture.componentInstance.open();
    fixture.componentInstance.choose('Carhartt');
    fixture.detectChanges();
    expect(values.at(-1)).toBe('Carhartt');
    expect(fixture.componentInstance.isOpen()).toBe(false);
    const clearButton = host.querySelector<HTMLButtonElement>('[aria-label="Marke entfernen"]');
    expect(clearButton).not.toBeNull();
    expect((await axe.run(host)).violations).toEqual([]);

    // X-Button leert Wert und Suchtext, ohne die Liste wieder aufzuklappen.
    clearButton!.click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(values.at(-1)).toBe('');
    expect(field.value).toBe('');
    expect(queries.at(-1)).toBe('');
    expect(fixture.componentInstance.isOpen()).toBe(false);

    // „Alle Marken“ steht als erster Listeneintrag bereit und setzt per Klick zurück.
    fixture.componentInstance.choose('Nike');
    fixture.componentInstance.open();
    fixture.detectChanges();
    const options = [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options[0].textContent?.trim()).toBe('Alle Marken');
    expect((await axe.run(host)).violations).toEqual([]);
    options[0].click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(values.at(-1)).toBe('');
    expect(fixture.componentInstance.isOpen()).toBe(false);

    // Leeren per Eingabe löscht sofort und stellt beim Schließen keinen alten Wert wieder her.
    fixture.componentInstance.choose('Carhartt');
    fixture.detectChanges();
    field.value = '';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.componentInstance.close(false);
    fixture.detectChanges();
    expect(values.at(-1)).toBe('');
    expect(field.value).toBe('');
  });
});
