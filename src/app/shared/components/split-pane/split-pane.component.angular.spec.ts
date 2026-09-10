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

describe('Verschiebbarer Trenner', () => {
  it('startet in der Mitte', () => {
    expect(createComponent().ratio()).toBe(50);
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
