import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { AdjustmentControlsComponent } from './adjustment-controls.component';
import { defaultAdjustments } from '../../services/adjustments';
import { Adjustments } from '../../models/image-adjustments';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

/**
 * Wie in den uebrigen Bauteil-Tests dieses Projekts wird der Eingang als
 * Signal untergeschoben statt ueber `setInput` gesetzt: Ein Pflichteingang
 * ist beim Erzeugen noch leer, und die Vorlage liest ihn sofort.
 */
function createComponent(adjustments: Adjustments): AdjustmentControlsComponent {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [AdjustmentControlsComponent],
  }).createComponent(AdjustmentControlsComponent);
  Object.assign(fixture.componentInstance, { adjustments: signal(adjustments) });
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('Regler für Farbe und Belichtung', () => {
  it('bietet zu jedem Wert des Modells genau einen Regler', () => {
    const component = createComponent(defaultAdjustments());
    const keys = component.sliders.map((slider) => slider.key).sort();

    expect(keys).toEqual(Object.keys(defaultAdjustments()).sort());
  });

  it('zeigt Faktoren als Prozent der Ausgangshelligkeit', () => {
    const component = createComponent({ ...defaultAdjustments(), brightness: 1.2 });
    const slider = component.sliders.find((entry) => entry.key === 'brightness')!;

    expect(component.displayOf(slider)).toBe('120 %');
  });

  // Bei der Waerme ist 0 die Mitte, nicht der Nullpunkt einer Skala. Ohne
  // Vorzeichen saehe "40 %" nach wenig aus statt nach deutlich waermer, und
  // -40 % waere von +40 % nicht zu unterscheiden.
  it('zeigt die Wärme mit Vorzeichen', () => {
    const warm = createComponent({ ...defaultAdjustments(), warmth: 0.4 });
    const cool = createComponent({ ...defaultAdjustments(), warmth: -0.4 });
    const neutral = createComponent(defaultAdjustments());
    const slider = warm.sliders.find((entry) => entry.key === 'warmth')!;

    expect(warm.displayOf(slider)).toBe('+40 %');
    expect(cool.displayOf(slider)).toBe('-40 %');
    expect(neutral.displayOf(slider)).toBe('0 %');
  });

  it('zeigt die Schärfe ohne Vorzeichen', () => {
    const component = createComponent({ ...defaultAdjustments(), sharpness: 0.6 });
    const slider = component.sliders.find((entry) => entry.key === 'sharpness')!;

    expect(component.displayOf(slider)).toBe('60 %');
  });

  it('erklärt die beiden Regler, die niemand aus dem Namen versteht', () => {
    const component = createComponent(defaultAdjustments());
    const withHint = component.sliders.filter((slider) => slider.hint).map((slider) => slider.key);

    expect(withHint).toEqual(['warmth', 'sharpness']);
  });

  it('meldet eine Änderung mit allen übrigen Werten unverändert', () => {
    const component = createComponent(defaultAdjustments());
    let emitted: Adjustments | null = null;
    component.changed.subscribe((value) => (emitted = value));

    component.onSlider('warmth', '0.75');

    expect(emitted).toEqual({ ...defaultAdjustments(), warmth: 0.75 });
  });

  it('gilt erst als unberührt, wenn auch Wärme und Schärfe neutral sind', () => {
    expect(createComponent(defaultAdjustments()).isUntouched()).toBe(true);
    expect(createComponent({ ...defaultAdjustments(), warmth: 0.1 }).isUntouched()).toBe(false);
    expect(createComponent({ ...defaultAdjustments(), sharpness: 0.1 }).isUntouched()).toBe(false);
  });
});
