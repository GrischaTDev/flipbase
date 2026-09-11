import '@angular/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { WritableSignal, ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { CropEditorComponent } from './crop-editor.component';
import { AdjustmentControlsComponent } from '../adjustment-controls/adjustment-controls.component';
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

describe('Metadaten-Knopf', () => {
  it('meldet beim Klick auf "Metadaten" den Wunsch nach dem Metadaten-Fenster', () => {
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

    let emitted = false;
    fixture.componentInstance.metadataRequested.subscribe(() => (emitted = true));

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const metadataButton = buttons.find((button) => button.textContent?.includes('Metadaten'));
    expect(metadataButton).toBeDefined();
    metadataButton!.click();

    expect(emitted).toBe(true);
  });
});

describe('Auf alle Bilder uebernehmen', () => {
  // Der Editor kennt die Bildanzahl nicht selbst - die Elternseite reicht sie
  // ueber `canApplyAdjustmentsToAll` durch. Geprueft wird ueber den Knopf in
  // `app-adjustment-controls`, weil das der einzige beobachtbare Effekt des
  // durchgereichten Wertes ist.
  //
  // Der Fallback-Compiler benoetigt die Signal-Eingaenge von
  // `AdjustmentControlsComponent` explizit (genau wie in
  // `image-list.component.angular.spec.ts` bei `BadgeComponent`) - sonst
  // erkennt er `[adjustments]`/`[disabled]`/`[canApplyToAll]` nicht als echte
  // Eingaenge und das Panel kann gar nicht erst rendern.
  interface Metadata {
    inputs: Record<string, unknown>;
    declaredInputs: Record<string, string>;
  }

  function withPatchedAdjustmentControlsInputs<T>(run: () => T): T {
    const metadata = (AdjustmentControlsComponent as unknown as { ɵcmp: Metadata }).ɵcmp;
    const original = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    metadata.inputs = { ...metadata.inputs };
    metadata.declaredInputs = { ...metadata.declaredInputs };
    for (const name of ['adjustments', 'disabled', 'canApplyToAll']) {
      metadata.inputs[name] = [name, 1, null];
      metadata.declaredInputs[name] = name;
    }
    try {
      return run();
    } finally {
      Object.assign(metadata, original);
    }
  }

  function createOpenPanel(canApplyAdjustmentsToAll: boolean) {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [CropEditorComponent],
    }).createComponent(CropEditorComponent);
    Object.assign(fixture.componentInstance, {
      dataUrl: signal('blob:a'),
      ratio: signal(1),
      adjustments: signal(defaultAdjustments()),
      canApplyAdjustmentsToAll: signal(canApplyAdjustmentsToAll),
    });
    fixture.detectChanges();
    fixture.componentInstance.togglePanel();
    fixture.detectChanges();
    return fixture;
  }

  function applyButton(host: HTMLElement): HTMLButtonElement | null {
    return (
      Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Auf alle Bilder übernehmen'),
      ) ?? null
    );
  }

  it('sperrt den Knopf ohne canApplyAdjustmentsToAll', () => {
    withPatchedAdjustmentControlsInputs(() => {
      const fixture = createOpenPanel(false);

      expect(applyButton(fixture.nativeElement)?.disabled).toBe(true);
    });
  });

  it('gibt den Knopf frei, wenn canApplyAdjustmentsToAll gesetzt ist', () => {
    withPatchedAdjustmentControlsInputs(() => {
      const fixture = createOpenPanel(true);

      expect(applyButton(fixture.nativeElement)?.disabled).toBe(false);
    });
  });
});
