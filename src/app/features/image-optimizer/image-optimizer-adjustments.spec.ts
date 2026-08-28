import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImageOptimizerComponent } from './image-optimizer.component';
import { Adjustments } from './models/image-adjustments';
import { defaultAdjustments, toFilterString } from './services/adjustments';

const brightened: Adjustments = { ...defaultAdjustments(), brightness: 1.3 };

/**
 * Erzeugt die echte Komponente ueber den echten Konstruktor, statt einzelne
 * Signale per `Object.assign` unterzuschieben. Nur so bleibt `activeFilter`
 * das tatsaechliche `computed()` aus der Komponente - genau das soll dieser
 * Test pruefen, nicht eine im Test nachgebaute Kopie davon.
 */
function createComponent(): ImageOptimizerComponent {
  return TestBed.runInInjectionContext(() => new ImageOptimizerComponent());
}

function jpegFile(name: string): File {
  return new File([''], name, { type: 'image/jpeg' });
}

/** Fuegt zwei Bilder hinzu; das erste wird dabei automatisch aktiv. */
function addTwoImages(component: ImageOptimizerComponent): { firstId: string; secondId: string } {
  component.addFiles([jpegFile('a.jpg'), jpegFile('b.jpg')]);
  const [first, second] = component.images();
  return { firstId: first.id, secondId: second.id };
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});
afterAll(() => TestBed.resetTestEnvironment());

describe('ImageOptimizerComponent – Farbe und Belichtung', () => {
  it('liefert eine leere Filterkette, solange das aktive Bild unveraendert ist', () => {
    const component = createComponent();
    addTwoImages(component);

    expect(component.activeFilter()).toBe('');
  });

  it('aendert die Filterkette des aktiven Bildes, sobald Anpassungen gesetzt werden', () => {
    const component = createComponent();
    addTwoImages(component);

    component.setAdjustments(brightened);

    expect(component.activeFilter()).toBe(toFilterString(brightened));
  });

  it('wirkt sich nur auf das aktive Bild aus - ein zweites Bild bleibt unveraendert', () => {
    const component = createComponent();
    const { secondId } = addTwoImages(component);

    component.setAdjustments(brightened);

    expect(component.images().find((entry) => entry.id === secondId)?.adjustments).toEqual(
      defaultAdjustments(),
    );

    component.setActiveImage(secondId);
    expect(component.activeFilter()).toBe('');
  });

  it('uebertraegt beim "Auf alle anwenden" die Werte des aktiven Bildes auf jedes Bild', () => {
    const component = createComponent();
    const { firstId, secondId } = addTwoImages(component);

    component.setAdjustments(brightened);
    component.applyAdjustmentsToAllImages();

    expect(component.images().map((entry) => entry.adjustments.brightness)).toEqual([1.3, 1.3]);
    expect(component.images().find((entry) => entry.id === firstId)?.adjustments).toEqual(
      brightened,
    );
    expect(component.images().find((entry) => entry.id === secondId)?.adjustments).toEqual(
      brightened,
    );
  });

  it('setzt waehrend eines laufenden Exports keine Anpassungen', () => {
    const component = createComponent();
    addTwoImages(component);
    component.isBusy.set(true);

    component.setAdjustments(brightened);

    expect(component.activeFilter()).toBe('');
    expect(component.images().every((entry) => entry.adjustments.brightness === 1)).toBe(true);
  });
});
