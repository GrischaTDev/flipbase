import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { WritableSignal, ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { CropEditorComponent } from './crop-editor.component';
import { defaultAdjustments } from '../../services/adjustments';

beforeAll(async () => {
  // `AdjustmentControlsComponent` liegt in einem Nachbarordner - ihr eigenes
  // `templateUrl` ist relativ zu diesem Ordner, nicht zu dieser Testdatei.
  await ɵresolveComponentResources((url) => {
    const path = url.includes('adjustment-controls.component')
      ? `../adjustment-controls/${url}`
      : url;
    return readFile(new URL(path, import.meta.url), 'utf8');
  });
});

function createComponent(): CropEditorComponent {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [CropEditorComponent],
  }).createComponent(CropEditorComponent);
  Object.assign(fixture.componentInstance, {
    dataUrl: signal('blob:a'),
    ratio: signal(1),
    adjustments: signal(defaultAdjustments()),
  });
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('Steuerelemente auf der Vorschau', () => {
  it('haelt das Farb-Panel zunaechst geschlossen', () => {
    // Die Regler haben frueher die Seite verlaengert. Standardmaessig zu.
    expect(createComponent().isPanelOpen()).toBe(false);
  });

  it('oeffnet und schliesst das Panel auf Klick', () => {
    const component = createComponent();

    component.togglePanel();
    expect(component.isPanelOpen()).toBe(true);

    component.togglePanel();
    expect(component.isPanelOpen()).toBe(false);
  });

  it('schliesst das Panel beim Bildwechsel', () => {
    // Ein offenes Panel ueber einem anderen Bild waere irrefuehrend - die
    // Regler zeigten dann Werte des vorigen.
    const component = createComponent();
    component.togglePanel();

    // `createComponent()` ersetzt den echten Input durch ein einfaches
    // WritableSignal (siehe oben) - hier wird genau dieses veraendert, sonst
    // haengt der bestehende `effect()` noch am verwaisten alten Signal und
    // bemerkt die "neue" URL nie.
    (component.dataUrl as unknown as WritableSignal<string>).set('blob:b');
    TestBed.flushEffects();

    expect(component.isPanelOpen()).toBe(false);
  });

  it('vergroessert und verkleinert den Zoom in Schritten', () => {
    const component = createComponent();

    component.zoomIn();

    expect(component.transform().scale).toBeCloseTo(1.05, 5);
  });

  it('geht beim Verkleinern nicht unter die Untergrenze', () => {
    const component = createComponent();

    component.zoomOut();

    expect(component.transform().scale).toBe(1);
  });
});
