import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageOptimizerComponent } from './image-optimizer.component';
import { MetadataReaderService } from './services/metadata-reader.service';
import { ImageMetadata } from './models/image-metadata';

function jpegFile(name: string): File {
  return new File([''], name, { type: 'image/jpeg' });
}

const withGps: ImageMetadata = {
  status: 'read',
  gps: { latitude: 52.5, longitude: 13.4 },
  fields: [
    { key: 'Make', label: 'Kamerahersteller', value: 'Apple' },
    { key: 'Model', label: 'Kameramodell', value: 'iPhone 15' },
  ],
  ai: { contentCredential: 'absent', declaredSource: null },
};

/**
 * Beantwortet jede Anfrage anhand des Dateinamens - genug, um zu pruefen,
 * dass jedes Bild seine eigene Antwort bekommt und nicht die eines anderen.
 */
class StubMetadataReader {
  read(file: File): Promise<ImageMetadata> {
    return Promise.resolve(file.name === 'with-gps.jpg' ? withGps : pendingLikeRead());
  }
}

function pendingLikeRead(): ImageMetadata {
  return {
    status: 'read',
    gps: null,
    fields: [],
    ai: { contentCredential: 'absent', declaredSource: null },
  };
}

/**
 * Erzeugt die echte Komponente ueber den echten Konstruktor - siehe
 * image-optimizer-adjustments.spec.ts fuer die Begruendung. Der echte
 * `MetadataReaderService` liest per `exifr`, was fuer diesen Test weder
 * noetig noch gewuenscht ist; er wird deshalb per TestBed-Provider durch
 * einen Stub ersetzt, bevor die Komponente entsteht.
 */
function createComponent(): ImageOptimizerComponent {
  TestBed.configureTestingModule({
    providers: [{ provide: MetadataReaderService, useValue: new StubMetadataReader() }],
  });
  return TestBed.runInInjectionContext(() => new ImageOptimizerComponent());
}

afterEach(() => TestBed.resetTestingModule());

describe('ImageOptimizerComponent – Metadaten auslesen', () => {
  it('startet mit "pending" und traegt nach dem Lesen die Metadaten am richtigen Bild ein', async () => {
    const component = createComponent();

    component.addFiles([jpegFile('with-gps.jpg'), jpegFile('ohne.jpg')]);
    const [first, second] = component.images();
    expect(first.metadata.status).toBe('pending');
    expect(second.metadata.status).toBe('pending');

    await vi.waitFor(() => {
      expect(component.images().every((image) => image.metadata.status === 'read')).toBe(true);
    });

    const withGpsImage = component.images().find((image) => image.file.name === 'with-gps.jpg');
    const otherImage = component.images().find((image) => image.file.name === 'ohne.jpg');

    expect(withGpsImage?.metadata).toEqual(withGps);
    expect(otherImage?.metadata.gps).toBeNull();
  });
});
