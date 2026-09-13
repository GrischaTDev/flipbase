import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import imageCompression from 'browser-image-compression';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCropperModalComponent } from './image-cropper-modal.component';
import { imageFileError } from './image-file';

vi.mock('browser-image-compression', () => ({
  default: Object.assign(
    vi.fn(async (file: File) => file),
    {
      getDataUrlFromFile: vi.fn(async () => 'data:image/jpeg;base64,preview'),
    },
  ),
}));

function cropEvent(blob: Blob): ImageCroppedEvent {
  return {
    blob,
    objectUrl: 'blob:crop',
    width: 20,
    height: 20,
    imagePosition: { x1: 0, y1: 0, x2: 20, y2: 20 },
    cropperPosition: { x1: 0, y1: 0, x2: 20, y2: 20 },
  };
}

describe('ImageCropperModalComponent', () => {
  let component: ImageCropperModalComponent;
  const initialFile = signal<File | null>(null);
  const initialData = signal<string | null>(null);
  const initialUrl = signal<string | null>(null);
  const file = new File(['picture'], 'photo.png', { type: 'image/png' });

  beforeEach(() => {
    vi.clearAllMocks();
    initialFile.set(null);
    initialData.set(null);
    initialUrl.set(null);
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override revokeObjectURL = vi.fn();
      },
    );
    TestBed.configureTestingModule({});
    component = TestBed.runInInjectionContext(() => new ImageCropperModalComponent());
    Object.assign(component, {
      initialImageFile: initialFile,
      initialImageDataUrl: initialData,
      initialImageUrl: initialUrl,
    });
    TestBed.tick();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('übernimmt erst nach Konstruktion gebundene Dateien und setzt einen alten Zuschnitt zurück', () => {
    initialFile.set(file);
    TestBed.tick();
    expect(component.imageFile()).toBe(file);
    component.imageCropped(cropEvent(new Blob(['crop'])));
    component.rotation.set(90);
    initialFile.set(new File(['next'], 'next.webp', { type: 'image/webp' }));
    TestBed.tick();
    expect(component.imageFile()?.name).toBe('next.webp');
    expect(component.croppedBlob()).toBeNull();
    expect(component.rotation()).toBe(0);
    expect(component.maintainAspectRatio()).toBe(true);
  });

  it('lädt Data-URLs und gespeicherte Bild-URLs über getrennte Cropper-Eingänge', () => {
    initialUrl.set('https://example.test/photo.jpg');
    TestBed.tick();
    expect(component.imageUrl()).toBe('https://example.test/photo.jpg');
    initialData.set('data:image/png;base64,aA==');
    TestBed.tick();
    expect(component.imageBase64()).toBe('data:image/png;base64,aA==');
    expect(component.imageUrl()).toBeNull();
    initialFile.set(file);
    TestBed.tick();
    expect(component.imageBase64()).toBeNull();
    expect(component.imageFile()).toBe(file);
  });

  it('akzeptiert Datei-Drops ohne ein künstliches input-change-Ereignis', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    };
    component.onDrop(event as unknown as DragEvent);
    expect(component.imageFile()).toBe(file);
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('weist ungültige, leere und zu große Dateien zurück', () => {
    expect(imageFileError(new File(['svg'], 'image.svg', { type: 'image/svg+xml' }))).toContain(
      'JPG',
    );
    expect(imageFileError(new File([], 'photo.png', { type: 'image/png' }))).toContain('leer');
    const huge = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(huge, 'size', { value: 51 * 1024 * 1024 });
    expect(imageFileError(huge)).toContain('50 MB');
    initialFile.set(new File(['bad'], 'photo.txt', { type: 'image/png' }));
    TestBed.tick();
    expect(component.imageFile()).toBeNull();
    expect(component.errorMessage()).toContain('JPG');
  });

  it('blockiert Übernehmen nach Ladefehlern und gibt Cropper-URLs frei', async () => {
    component.imageCropped(cropEvent(new Blob(['crop'])));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:crop');
    component.loadImageFailed();
    await component.applyCropAndCompress();
    expect(imageCompression).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('geladen');
  });

  it('liefert die bisherige Ergebnis-API mit einem echten benannten JPEG zurück', async () => {
    initialFile.set(file);
    TestBed.tick();
    component.imageCropped(cropEvent(new Blob(['crop'], { type: 'image/jpeg' })));
    const result = vi.fn();
    const close = vi.fn();
    component.imageReady.subscribe(result);
    component.closed.subscribe(close);
    await component.applyCropAndCompress();
    expect(result).toHaveBeenCalledOnce();
    expect(result.mock.calls[0][0]).toMatchObject({
      file: expect.any(File),
      dataUrl: 'data:image/jpeg;base64,preview',
      originalSize: file.size,
    });
    expect(result.mock.calls[0][0].file.name).toBe('photo.jpg');
    expect(close).toHaveBeenCalledOnce();
  });

  it('sendet nach Abbrechen kein verspätetes Ergebnis und verhindert Doppelübernahme', async () => {
    let complete!: (file: File) => void;
    vi.mocked(imageCompression).mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          complete = resolve;
        }),
    );
    component.imageCropped(cropEvent(new Blob(['crop'])));
    const result = vi.fn();
    component.imageReady.subscribe(result);
    const pending = component.applyCropAndCompress();
    await component.applyCropAndCompress();
    expect(imageCompression).toHaveBeenCalledOnce();
    component.close();
    complete(file);
    await pending;
    expect(result).not.toHaveBeenCalled();
  });

  it('behält bei Verarbeitungsfehlern den Zuschnitt für einen erneuten Versuch', async () => {
    const blob = new Blob(['crop']);
    component.imageCropped(cropEvent(blob));
    vi.mocked(imageCompression).mockRejectedValueOnce(new Error('encoder failed'));
    await component.applyCropAndCompress();
    expect(component.errorMessage()).toContain('erneut');
    expect(component.isProcessing()).toBe(false);
    expect(component.croppedBlob()).toBe(blob);
  });

  it('räumt die geladenen Objekt-URLs beim Dialogabbau auf', () => {
    component.imageLoaded({
      original: { objectUrl: 'blob:original' },
      transformed: { objectUrl: 'blob:transformed' },
    } as LoadedImage);
    TestBed.resetTestingModule();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:transformed');
  });
});
