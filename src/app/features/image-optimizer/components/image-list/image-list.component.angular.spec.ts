import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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

it('zeigt an den Kacheln kein GPS-Abzeichen', () => {
  // Der Aufnahmeort wird beim Export ohnehin entfernt; die Warnung am Knopf
  // "Metadaten" im Editor bleibt, an jeder Kachel war sie nur Laerm.
  const withGps: OptimizerImage = {
    ...image('a'),
    metadata: { ...pendingMetadata(), status: 'read', gps: { latitude: 52.1, longitude: 8.6 } },
  };

  const element = render([withGps]);

  expect(element.querySelector('app-badge')).toBeNull();
  expect(element.textContent).not.toContain('GPS');
});

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
