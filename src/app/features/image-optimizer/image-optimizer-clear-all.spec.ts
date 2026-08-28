import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { OptimizerImage } from './models/optimizer-image';
import { ImageOptimizerComponent } from './image-optimizer.component';

function image(id: string, dataUrl: string): OptimizerImage {
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

function createComponent(confirmed: boolean, images: OptimizerImage[]) {
  const toast = new ToastService();
  const confirmMock = vi.fn().mockResolvedValue(confirmed);
  const component = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
  Object.assign(component, {
    toast,
    confirm: { frage: confirmMock },
    isBusy: signal(false),
    images: signal(images),
    activeImageId: signal(images[0]?.id ?? null),
    error: signal<string | null>(null),
  });
  return { component, toast, confirmMock };
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
    const images = [image('a', 'blob:a'), image('b', 'blob:b')];
    const { component, toast, confirmMock } = createComponent(true, images);

    await component.clearAllImages();

    expect(confirmMock).toHaveBeenCalledWith(
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
    const images = [image('a', 'blob:a')];
    const { component, toast, confirmMock } = createComponent(false, images);

    await component.clearAllImages();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(component.images()).toEqual(images);
    expect(component.activeImageId()).toBe('a');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it('fragt bei einer leeren Liste erst gar nicht nach', async () => {
    const { component, confirmMock } = createComponent(true, []);

    await component.clearAllImages();

    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('fragt waehrend eines laufenden Exports nicht nach', async () => {
    const images = [image('a', 'blob:a')];
    const { component, confirmMock } = createComponent(true, images);
    Object.assign(component, { isBusy: signal(true) });

    await component.clearAllImages();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(component.images()).toEqual(images);
  });

  it('loescht eine zuvor angezeigte Fehlermeldung, wenn alle Bilder entfernt werden', async () => {
    const images = [image('a', 'blob:a')];
    const { component } = createComponent(true, images);
    Object.assign(component, { error: signal<string | null>('Vorheriger Fehler') });

    await component.clearAllImages();

    expect(component.error()).toBeNull();
  });
});
