import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
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

  it('macht die Werkzeuge einer nicht aktiven Kachel unklickbar, solange sie unsichtbar sind', () => {
    // Klassenpruefung, keine Verhaltenspruefung: jsdom rechnet kein Layout und
    // kennt keinen Touch-Zustand, kann also nicht zeigen, dass ein unsicht-
    // barer Knopf auf dem Handy nicht getroffen werden kann. Diese Probe
    // sichert nur ab, dass die dafuer noetigen Klassen (`pointer-events-none`
    // ohne Hover/Fokus, `pointer-events-auto` erst darueber) am Element
    // stehen; ob ein Tippen daneben tatsaechlich wirkungslos bleibt, zeigt
    // erst das echte Geraet.
    const element = render([image('a'), image('b')]);
    const [activeTools, inactiveTools] = Array.from(
      element.querySelectorAll('[data-testid="image-tools"]'),
    );

    expect(inactiveTools.className).toContain('pointer-events-none');
    expect(inactiveTools.classList.contains('pointer-events-auto')).toBe(false);
    expect(activeTools.classList.contains('pointer-events-auto')).toBe(true);
  });
});

describe('Umsortieren per Ziehen', () => {
  it('meldet die neue Position, wenn ein Bild abgelegt wird', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [ImageListComponent],
    }).createComponent(ImageListComponent);
    const emitted: { fromIndex: number; toIndex: number }[] = [];
    fixture.componentInstance.reordered.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onDropped({
      previousIndex: 2,
      currentIndex: 0,
    } as CdkDragDrop<unknown>);

    expect(emitted).toEqual([{ fromIndex: 2, toIndex: 0 }]);
  });

  it('meldet nichts, wenn das Bild an seinem Platz landet', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({
      imports: [ImageListComponent],
    }).createComponent(ImageListComponent);
    const emitted: unknown[] = [];
    fixture.componentInstance.reordered.subscribe((value) => emitted.push(value));

    fixture.componentInstance.onDropped({
      previousIndex: 1,
      currentIndex: 1,
    } as CdkDragDrop<unknown>);

    expect(emitted).toEqual([]);
  });

  it('setzt den Ziehgriff nur auf den Auswahl-Knopf, nicht auf Werkzeuge oder den Schalter', () => {
    // Regressionswaechter fuer den Fund aus der Aufgabenpruefung: Ohne
    // `cdkDragHandle` startet die CDK einen Zug aus jedem Punkt der Kachel,
    // was Werkzeug-Knoepfe und den "durchgesehen"-Schalter verschluckt. Die
    // CDK haengt an ihren Griff-Elementen die Klasse `cdk-drag-handle` an;
    // das ist das einzige Merkmal, das von aussen pruefbar ist.
    const element = render([image('a'), image('b')]);
    const firstTile = element.querySelectorAll('article')[0];
    const selectButton = firstTile.querySelector('button');
    const toolButtons = Array.from(
      firstTile.querySelectorAll('[data-testid="image-tools"] button'),
    );
    const reviewToggle = firstTile.querySelector('footer button');

    expect(selectButton?.classList.contains('cdk-drag-handle')).toBe(true);
    for (const button of toolButtons) {
      expect(button.classList.contains('cdk-drag-handle')).toBe(false);
    }
    expect(reviewToggle?.classList.contains('cdk-drag-handle')).toBe(false);
  });
});
