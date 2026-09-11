import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { SplitPaneComponent } from './split-pane.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

/**
 * Pflichteingaenge werden wie in den uebrigen Bauteiltests dieses Projekts
 * als Signal untergeschoben - beim Erzeugen sind sie noch leer, und die
 * Vorlage liest sie sofort.
 */
function createComponent(): SplitPaneComponent {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [SplitPaneComponent],
  }).createComponent(SplitPaneComponent);
  Object.assign(fixture.componentInstance, {
    leftLabel: signal('Vorschau'),
    rightLabel: signal('Bilder'),
  });
  fixture.detectChanges();
  return fixture.componentInstance;
}

function press(key: string, shift = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, shiftKey: shift, cancelable: true });
}

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

/**
 * `fixture.componentRef.setInput()` braucht `ɵcmp.inputs`/`declaredInputs` -
 * der Fallback-Compiler dieses Testaufbaus traegt Signal-Eingaben dort aber
 * nicht ein (siehe `modal-shell.component.angular.spec.ts` und
 * `crop-editor.component.angular.spec.ts` fuer dasselbe Vorgehen). Ohne diesen
 * Patch wirft `setInput('storageKey', ...)` NG0303.
 */
function withPatchedStorageKeyInput<T>(run: () => T): T {
  const metadata = (SplitPaneComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  const original = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
  metadata.inputs = { ...metadata.inputs, storageKey: ['storageKey', 1, null] };
  metadata.declaredInputs = { ...metadata.declaredInputs, storageKey: 'storageKey' };
  try {
    return run();
  } finally {
    Object.assign(metadata, original);
  }
}

describe('Verschiebbarer Trenner', () => {
  it('startet in der Mitte', () => {
    expect(createComponent().ratio()).toBe(50);
  });

  it('stellt einen gemerkten Anteil beim Rendern wieder her', () => {
    // Regression: Der Lesezugriff stand frueher im Konstruktor, bevor Angular
    // `storageKey` gebunden hatte - dort war er immer noch leer und nichts
    // wurde gelesen. Deshalb wird `storageKey` hier erst nach dem Erzeugen
    // ueber `setInput` gesetzt, wie es Angular auch bei einer echten Bindung
    // tut, und der gespeicherte Wert muss vorher im Test-Speicher liegen.
    localStorage.setItem('test.split-pane.restore', '65');

    withPatchedStorageKeyInput(() => {
      TestBed.resetTestingModule();
      const fixture = TestBed.configureTestingModule({
        imports: [SplitPaneComponent],
      }).createComponent(SplitPaneComponent);
      Object.assign(fixture.componentInstance, {
        leftLabel: signal('Vorschau'),
        rightLabel: signal('Bilder'),
      });
      fixture.componentRef.setInput('storageKey', 'test.split-pane.restore');
      fixture.detectChanges();

      expect(fixture.componentInstance.ratio()).toBe(65);
    });
  });

  it('laesst sich mit den Pfeiltasten verschieben', () => {
    // Ohne Tastaturbedienung faellt ein Trenner durch AXE.
    const component = createComponent();

    component.onKeydown(press('ArrowRight'));

    expect(component.ratio()).toBe(52);
  });

  it('geht mit Umschalttaste in groesseren Schritten', () => {
    const component = createComponent();

    component.onKeydown(press('ArrowRight', true));

    expect(component.ratio()).toBe(60);
  });

  it('springt mit Pos1 und Ende an die Grenzen', () => {
    const component = createComponent();

    component.onKeydown(press('Home'));
    expect(component.ratio()).toBe(25);

    component.onKeydown(press('End'));
    expect(component.ratio()).toBe(75);
  });

  it('verschluckt eine Taste, die es nicht behandelt, nicht', () => {
    // Sonst kaeme man mit Tab nicht mehr aus dem Griff heraus.
    const component = createComponent();
    const event = press('Tab');

    component.onKeydown(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('verhindert die Voreinstellung bei einer behandelten Taste', () => {
    // Sonst scrollt der Browser die Seite zusaetzlich zum Verschieben.
    const component = createComponent();
    const event = press('ArrowRight');

    component.onKeydown(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('beschreibt seinen Stand fuer Screenreader', () => {
    const component = createComponent();

    component.onKeydown(press('ArrowRight'));

    expect(component.ratio()).toBe(52);
    expect(component.handleLabel()).toContain('Vorschau');
    expect(component.handleLabel()).toContain('Bilder');
  });
});
