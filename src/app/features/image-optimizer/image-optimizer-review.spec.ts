import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { OptimizerImage } from './models/optimizer-image';
import { ImageOptimizerComponent } from './image-optimizer.component';
import { reviewedCount as countReviewed } from './services/image-collection';

function image(id: string, overrides: Partial<OptimizerImage> = {}): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl: `blob:${id}`,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: null,
    reviewed: false,
    ...overrides,
  };
}

function createComponent(images: OptimizerImage[], activeId: string | null = null) {
  const component = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
  const imagesSignal = signal(images);
  Object.assign(component, {
    isBusy: signal(false),
    images: imagesSignal,
    activeImageId: signal(activeId),
    reviewedCount: () => countReviewed(imagesSignal()),
  });
  return component;
}

describe('ImageOptimizerComponent – Fortschrittsanzeige', () => {
  it('markiert ein Bild als durchgesehen, sobald es aktiv gesetzt wird', () => {
    const component = createComponent([image('a'), image('b')]);

    component.setActiveImage('a');

    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(true);
    expect(component.images().find((entry) => entry.id === 'b')?.reviewed).toBe(false);
  });

  it('laesst ein bereits durchgesehenes Bild beim erneuten Anzeigen unveraendert', () => {
    const component = createComponent([image('a', { reviewed: true })]);

    component.setActiveImage('a');

    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(true);
  });

  it('tut beim Anzeigen waehrend eines laufenden Exports nichts', () => {
    const component = createComponent([image('a')]);
    Object.assign(component, { isBusy: signal(true) });

    component.setActiveImage('a');

    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(false);
  });

  it('schaltet die Markierung von Hand in beide Richtungen um', () => {
    const component = createComponent([image('a')]);

    component.toggleReviewed('a');
    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(true);

    component.toggleReviewed('a');
    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(false);
  });

  it('schaltet die Markierung waehrend eines laufenden Exports nicht um', () => {
    const component = createComponent([image('a')]);
    Object.assign(component, { isBusy: signal(true) });

    component.toggleReviewed('a');

    expect(component.images().find((entry) => entry.id === 'a')?.reviewed).toBe(false);
  });

  it('zaehlt die durchgesehenen Bilder ueber den echten Zustand statt einem festen Wert', () => {
    const component = createComponent([
      image('a', { reviewed: true }),
      image('b'),
      image('c', { reviewed: true }),
    ]);

    expect(component.reviewedCount()).toBe(2);

    component.toggleReviewed('b');

    expect(component.reviewedCount()).toBe(3);
  });

  it('zaehlt das nach dem ersten Hochladen automatisch geoeffnete Bild bereits mit', () => {
    const component = createComponent([]);

    component.addFiles([new File(['x'], 'first.jpg', { type: 'image/jpeg' })]);

    expect(component.activeImageId()).toBe(component.images()[0]?.id);
    expect(component.images()[0]?.reviewed).toBe(true);
    expect(component.reviewedCount()).toBe(1);
  });
});
