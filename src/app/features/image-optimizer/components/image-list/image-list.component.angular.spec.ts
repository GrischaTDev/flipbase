import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { defaultAdjustments } from '../../services/adjustments';
import { pendingMetadata } from '../../models/image-metadata';
import type { OptimizerImage } from '../../models/optimizer-image';
import { ImageListComponent } from './image-list.component';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => {
    const path = url.includes('badge.component')
      ? `../../../../shared/components/badge/${url}`
      : url;
    return readFile(new URL(path, import.meta.url), 'utf8');
  });
});

afterEach(() => TestBed.resetTestingModule());

it('shows the GPS warning as text without a projected decorative marker', () => {
  const image: OptimizerImage = {
    id: 'gps-image',
    file: new File([''], 'gps.jpg', { type: 'image/jpeg' }),
    dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 1, height: 1 },
    reviewed: false,
    adjustments: defaultAdjustments(),
    metadata: {
      status: 'read',
      gps: { latitude: 52.5, longitude: 13.4 },
      fields: [],
      ai: { contentCredential: 'absent', declaredSource: null },
      capturedAt: null,
    },
  };
  // Der Fallback-Compiler benötigt die Signal-Metadaten explizit.
  interface Metadata {
    inputs: Record<string, unknown>;
    declaredInputs: Record<string, string>;
  }
  const patches = [
    { type: ImageListComponent, names: ['images', 'activeId', 'disabled', 'reviewedCount'] },
    { type: BadgeComponent, names: ['tone', 'size', 'mono'] },
  ].map(({ type, names }) => {
    const metadata = (type as unknown as { ɵcmp: Metadata }).ɵcmp;
    const original = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
    metadata.inputs = { ...metadata.inputs };
    metadata.declaredInputs = { ...metadata.declaredInputs };
    for (const name of names) {
      metadata.inputs[name] = [name, 1, null];
      metadata.declaredInputs[name] = name;
    }
    return { metadata, original };
  });
  try {
    TestBed.configureTestingModule({ imports: [ImageListComponent] });
    const fixture = TestBed.createComponent(ImageListComponent);
    fixture.componentRef.setInput('images', [image]);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const badge = host.querySelector('app-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('GPS');
    expect(badge?.textContent).toContain('Enthält Standortdaten.');
    expect(badge?.querySelector('[aria-hidden="true"], svg, [data-badge-marker]')).toBeNull();
    fixture.destroy();
  } finally {
    for (const { metadata, original } of patches) Object.assign(metadata, original);
  }
});

function image(id: string): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: { width: 3000, height: 4000 },
    reviewed: false,
    adjustments: defaultAdjustments(),
    metadata: pendingMetadata(),
  };
}

function render(images: readonly OptimizerImage[]): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [ImageListComponent],
  }).createComponent(ImageListComponent);
  Object.assign(fixture.componentInstance, {
    images: signal(images),
    activeId: signal(images[0]?.id ?? null),
    reviewedCount: signal(0),
    disabled: signal(false),
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/**
 * Zwei dieser Tests pruefen Klassennamen. Das ist bewusst so und muss ehrlich
 * benannt werden: jsdom rechnet kein Layout, es gibt also nichts zu messen.
 * Sie sind **Rueckfallsicherungen**, keine Verhaltenspruefungen - sie fangen
 * ein versehentliches Zurueckdrehen auf die alte Spalte und ein Entfernen der
 * Tastaturerreichbarkeit. Ob das Raster gut aussieht, entscheidet die Probe im
 * Browser, nicht dieser Test.
 */
describe('Bilderraster', () => {
  it('legt die Kacheln in ein Raster, nicht in eine waagerechte Liste', () => {
    // Rueckfallsicherung: Die alte Fassung war ein `flex` mit
    // `overflow-x-auto`. Beides darf nicht zurueckkommen - eine Spalte
    // verschenkt die Breite, sobald der Trenner nach links gezogen wird.
    const element = render([image('a'), image('b'), image('c')]);
    const grid = element.querySelector('[data-testid="image-grid"]');

    expect(grid?.className).toContain('grid-cols-[repeat(auto-fill');
    expect(grid?.className).not.toContain('overflow-x-auto');
  });

  it('zeigt zu jedem Bild eine Kachel', () => {
    const element = render([image('a'), image('b'), image('c')]);

    expect(element.querySelectorAll('article')).toHaveLength(3);
  });

  it('haelt die Werkzeuge bei Tastaturfokus erreichbar', () => {
    // Rueckfallsicherung fuer eine Barrierefreiheits-Eigenschaft, die beim
    // Aufraeumen leicht verloren geht: Nur bei :hover eingeblendet waeren die
    // Werkzeuge mit der Tastatur unerreichbar, und AXE meldet das nicht,
    // weil die Knoepfe im Baum stehen.
    const element = render([image('a'), image('b')]);
    const tools = element.querySelector('[data-testid="image-tools"]');

    expect(tools?.className).toContain('group-focus-within:opacity-100');
  });

  it('kennzeichnet das erste Bild als Hauptbild', () => {
    const element = render([image('a'), image('b')]);

    expect(element.textContent).toContain('HAUPTBILD');
  });
});
