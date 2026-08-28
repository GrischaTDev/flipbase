import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { OptimizerImage } from './models/optimizer-image';
import { ImageOptimizerComponent } from './image-optimizer.component';

function bild(id: string, dataUrl: string): OptimizerImage {
  return {
    id,
    file: new File([''], `${id}.jpg`, { type: 'image/jpeg' }),
    dataUrl,
    crops: {},
    rotation: 0,
    loadError: null,
    naturalSize: null,
    reviewed: false,
  };
}

function createComponent(bestaetigt: boolean, bilder: OptimizerImage[]) {
  const toast = new ToastService();
  const frage = vi.fn().mockResolvedValue(bestaetigt);
  const component = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
  Object.assign(component, {
    toast,
    confirm: { frage },
    isBusy: signal(false),
    images: signal(bilder),
    activeImageId: signal(bilder[0]?.id ?? null),
    error: signal<string | null>(null),
  });
  return { component, toast, frage };
}

describe('ImageOptimizerComponent – Alle Bilder entfernen', () => {
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('entfernt nach Bestätigung alle Bilder und gibt jede Object-URL frei', async () => {
    const bilder = [bild('a', 'blob:a'), bild('b', 'blob:b')];
    const { component, toast, frage } = createComponent(true, bilder);

    await component.clearAllImages();

    expect(frage).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Alle Bilder entfernen?', gefahr: true }),
    );
    expect(component.images()).toEqual([]);
    expect(component.activeImageId()).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Alle Bilder wurden entfernt.',
    });
  });

  it('entfernt bei Abbruch nichts und gibt keine Object-URL frei', async () => {
    const bilder = [bild('a', 'blob:a')];
    const { component, toast, frage } = createComponent(false, bilder);

    await component.clearAllImages();

    expect(frage).toHaveBeenCalledTimes(1);
    expect(component.images()).toEqual(bilder);
    expect(component.activeImageId()).toBe('a');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('fragt bei einer leeren Liste erst gar nicht nach', async () => {
    const { component, frage } = createComponent(true, []);

    await component.clearAllImages();

    expect(frage).not.toHaveBeenCalled();
  });

  it('fragt waehrend eines laufenden Exports nicht nach', async () => {
    const bilder = [bild('a', 'blob:a')];
    const { component, frage } = createComponent(true, bilder);
    Object.assign(component, { isBusy: signal(true) });

    await component.clearAllImages();

    expect(frage).not.toHaveBeenCalled();
    expect(component.images()).toEqual(bilder);
  });
});
