import '@angular/compiler';
import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductImageDraft } from '../../../../core/models/product-media.models';
import { CroppedImageResult } from '../../../../shared/components/image-cropper-modal/image-cropper-modal.component';
import { ProductMediaEditorComponent } from './product-media-editor.component';

class PreviewReader {
  static instances: PreviewReader[] = [];
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  abort = vi.fn(() => this.onabort?.());
  readAsDataURL = vi.fn();
  constructor() {
    PreviewReader.instances.push(this);
  }
  finish(data = 'data:image/png;base64,aA=='): void {
    this.result = data;
    this.onload?.();
  }
}

function saved(key: string): ProductImageDraft {
  return {
    key,
    file: null,
    previewUrl: 'https://example.test/' + key + '.jpg',
    media: {
      id: key,
      workspace_id: 'workspace',
      catalog_product_id: 'product',
      storage_path: key + '.jpg',
      is_primary: key === 'first',
      sort_order: 0,
    },
  };
}

describe('ProductMediaEditorComponent', () => {
  let component: ProductMediaEditorComponent;
  const images = signal<readonly ProductImageDraft[]>([]);
  const disabled = signal(false);
  const output = vi.fn();
  const file = new File(['picture'], 'photo.png', { type: 'image/png' });

  beforeEach(() => {
    vi.clearAllMocks();
    PreviewReader.instances = [];
    vi.stubGlobal('FileReader', PreviewReader);
    images.set([]);
    disabled.set(false);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ElementRef,
          useValue: new ElementRef(document.createElement('app-product-media-editor')),
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ProductMediaEditorComponent());
    Object.assign(component, { images, disabled });
    component.imagesChange.subscribe(output);
    TestBed.tick();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('meldet mehrere Dateien sofort und erzeugt die Vorschauen in stabiler Auswahlreihenfolge', () => {
    component.addFiles([file, new File(['b'], 'second.webp', { type: 'image/webp' })]);
    expect(output).toHaveBeenCalledOnce();
    expect(component.drafts().map((image) => image.file?.name)).toEqual([
      'photo.png',
      'second.webp',
    ]);
    PreviewReader.instances[1].finish('data:second');
    PreviewReader.instances[0].finish('data:first');
    expect(component.drafts().map((image) => image.previewUrl)).toEqual([
      'data:first',
      'data:second',
    ]);
  });

  it('behält gültige Dateien bei gemischter Auswahl und zeigt verständliche Fehler', () => {
    component.addFiles([new File(['bad'], 'a.svg', { type: 'image/svg+xml' }), file]);
    expect(component.drafts()).toHaveLength(1);
    expect(component.errors()[0]).toContain('a.svg');
    expect(PreviewReader.instances).toHaveLength(1);
  });

  it('zeigt die Ablagefläche über vorhandenen Bildern und nimmt weitere Bilder an', () => {
    images.set([saved('first')]);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const transfer = { types: ['Files'], files: [file] } as unknown as DataTransfer;
    const event = {
      dataTransfer: transfer,
      preventDefault,
      stopPropagation,
    } as unknown as DragEvent;

    component.onDragEnter(event);
    component.onDragOver(event);
    expect(component.dragActive()).toBe(true);
    component.onDrop(event);
    expect(component.dragActive()).toBe(false);
    expect(component.drafts()).toHaveLength(2);
    expect(component.drafts()[1].file).toBe(file);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('verschiebt Bilder und bestimmt das Hauptbild ausschließlich über die Reihenfolge', () => {
    images.set([saved('first'), saved('second'), saved('third')]);
    component.move('third', -1);
    expect(component.drafts().map((image) => image.key)).toEqual(['first', 'third', 'second']);
    component.setPrimary('second');
    expect(component.drafts().map((image) => image.key)).toEqual(['second', 'first', 'third']);
    expect(images().map((image) => image.key)).toEqual(['first', 'second', 'third']);
    component.move('second', -1);
    expect(component.drafts()[0].key).toBe('second');
  });

  it('ordnet per Ziehen um und übernimmt Bildname, Alternativtext und Position aus dem Dialog', () => {
    images.set([saved('first'), saved('second'), saved('third')]);
    component.onReordered({ previousIndex: 2, currentIndex: 1 } as never);
    expect(component.drafts().map((image) => image.key)).toEqual(['first', 'third', 'second']);
    component.openDetails('third');
    component.detailsForm.setValue({
      fileName: 'Rückansicht',
      altText: 'Rückseite des Artikels',
      position: 1,
    });
    component.saveDetails();
    expect(component.drafts()[0]).toMatchObject({
      key: 'third',
      fileName: 'Rückansicht',
      altText: 'Rückseite des Artikels',
    });
    expect(component.detailsKey()).toBeNull();
  });

  it('übernimmt einen neuen Elternstand statt frühere lokale Sortierung wiederherzustellen', () => {
    images.set([saved('first'), saved('second')]);
    component.move('second', -1);
    images.set([saved('replacement')]);
    expect(component.drafts().map((image) => image.key)).toEqual(['replacement']);
  });

  it('ersetzt ein gespeichertes Bild durch einen Dateientwurf und behält dessen Position und Schlüssel', () => {
    images.set([saved('first'), saved('second')]);
    component.startCrop('second');
    component.applyCrop({ file, dataUrl: 'data:cropped' } as CroppedImageResult);
    expect(component.drafts()[1]).toEqual({
      key: 'second',
      media: null,
      file,
      previewUrl: 'data:cropped',
    });
    expect(images()[1].media?.id).toBe('second');
    expect(component.cropKey()).toBeNull();
  });

  it('verändert den Entwurf beim Abbrechen des Zuschnitts nicht', () => {
    images.set([saved('first')]);
    component.startCrop('first');
    component.cropKey.set(null);
    expect(output).not.toHaveBeenCalled();
    expect(component.drafts()[0].media?.id).toBe('first');
  });

  it('überschreibt nach Entfernen oder Zuschnitt keine Dateien durch verspätete Vorschauen', () => {
    component.addFiles([file, file]);
    const [first, second] = component.drafts();
    component.remove(first.key);
    component.startCrop(second.key);
    const cropped = new File(['cropped'], 'cropped.jpg', { type: 'image/jpeg' });
    component.applyCrop({ file: cropped, dataUrl: 'data:cropped' } as CroppedImageResult);
    PreviewReader.instances.forEach((reader) => reader.finish());
    expect(component.drafts()).toHaveLength(1);
    expect(component.drafts()[0].previewUrl).toBe('data:cropped');
    expect(component.drafts()[0].file).toBe(cropped);
  });

  it('überschreibt nach erfolgreichem Upload nicht dessen bestätigte Medien-ID', () => {
    component.addFiles([file]);
    const key = component.drafts()[0].key;
    images.set([saved(key)]);
    PreviewReader.instances[0].finish();
    expect(component.drafts()[0].media?.id).toBe(key);
    expect(component.drafts()[0].file).toBeNull();
  });

  it('blockiert bei disabled jede Änderung einschließlich verspäteter Crop-Ergebnisse', () => {
    images.set([saved('first'), saved('second')]);
    component.startCrop('first');
    disabled.set(true);
    component.addFiles([file]);
    component.remove('first');
    component.move('first', 1);
    component.setPrimary('second');
    component.applyCrop({ file, dataUrl: 'data:cropped' } as CroppedImageResult);
    expect(output).not.toHaveBeenCalled();
    expect(component.drafts()[0].key).toBe('first');
  });

  it('meldet den betroffenen gespeicherten Bildentwurf an den Parent ohne die Galerie zu verändern', () => {
    const image = saved('first');
    images.set([image, saved('second')]);
    const failed = vi.fn();
    component.imageFailed.subscribe(failed);
    component.previewFailed('first');
    expect(failed).toHaveBeenCalledExactlyOnceWith(image);
    expect(component.errors()[0]).toContain('Vorschau');
    expect(output).not.toHaveBeenCalled();
    component.previewFailed('entfernt');
    expect(failed).toHaveBeenCalledOnce();
  });

  it('zeigt Lesefehler und bricht offene Reader beim Abbau ab', () => {
    const failed = vi.fn();
    component.imageFailed.subscribe(failed);
    component.addFiles([file, file]);
    PreviewReader.instances[0].onerror?.();
    expect(component.errors()[0]).toContain('Vorschau');
    expect(failed).toHaveBeenCalledExactlyOnceWith(component.drafts()[0]);
    TestBed.resetTestingModule();
    expect(PreviewReader.instances[1].abort).toHaveBeenCalledOnce();
  });
});
