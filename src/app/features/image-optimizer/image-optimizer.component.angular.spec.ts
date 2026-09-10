import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ImageOptimizerComponent } from './image-optimizer.component';
import { Adjustments } from './models/image-adjustments';
import { ImageMetadata, pendingMetadata } from './models/image-metadata';
import { OptimizerImage } from './models/optimizer-image';
import { Size } from './models/platform-profile';
import { defaultAdjustments, toFilterString } from './services/adjustments';
import { reviewedCount as countReviewed } from './services/image-collection';
import { MetadataReaderService } from './services/metadata-reader.service';

/**
 * Erzeugt die echte Komponente ueber den echten Konstruktor, statt einzelne
 * Signale per `Object.assign` unterzuschieben. Nur so bleibt `activeLook`
 * das tatsaechliche `computed()` aus der Komponente - genau das soll ein
 * Test pruefen, nicht eine im Test nachgebaute Kopie davon.
 *
 * Auf Modulebene, damit mehrere Testbloecke sie mitbenutzen, statt sie
 * wortgleich zu kopieren - doppelte Logik wuerde beim naechsten
 * Konstruktorwechsel in einer der Fassungen vergessen.
 */
function createComponent(): ImageOptimizerComponent {
  return TestBed.runInInjectionContext(() => new ImageOptimizerComponent());
}

function jpegFile(name: string): File {
  return new File([''], name, { type: 'image/jpeg' });
}

describe('ImageOptimizerComponent', () => {
  describe('Anpassungen', () => {
    beforeAll(() => TestBed.resetTestingModule());

    const brightened: Adjustments = { ...defaultAdjustments(), brightness: 1.3 };

    /** Fuegt zwei Bilder hinzu; das erste wird dabei automatisch aktiv. */
    function addTwoImages(component: ImageOptimizerComponent): {
      firstId: string;
      secondId: string;
    } {
      component.addFiles([jpegFile('a.jpg'), jpegFile('b.jpg')]);
      const [first, second] = component.images();
      return { firstId: first.id, secondId: second.id };
    }

    describe('ImageOptimizerComponent – Farbe und Belichtung', () => {
      it('liefert eine leere Filterkette, solange das aktive Bild unveraendert ist', () => {
        const component = createComponent();
        addTwoImages(component);

        expect(component.activeLook().filter).toBe('');
      });

      it('aendert die Filterkette des aktiven Bildes, sobald Anpassungen gesetzt werden', () => {
        const component = createComponent();
        addTwoImages(component);

        component.setAdjustments(brightened);

        expect(component.activeLook().filter).toBe(toFilterString(brightened));
      });

      it('wirkt sich nur auf das aktive Bild aus - ein zweites Bild bleibt unveraendert', () => {
        const component = createComponent();
        const { secondId } = addTwoImages(component);

        component.setAdjustments(brightened);

        expect(component.images().find((entry) => entry.id === secondId)?.adjustments).toEqual(
          defaultAdjustments(),
        );

        component.setActiveImage(secondId);
        expect(component.activeLook().filter).toBe('');
      });

      it('uebertraegt beim "Auf alle anwenden" die Werte des aktiven Bildes auf jedes Bild', () => {
        const component = createComponent();
        const { firstId, secondId } = addTwoImages(component);

        component.setAdjustments(brightened);
        component.applyAdjustmentsToAllImages();

        expect(component.images().map((entry) => entry.adjustments.brightness)).toEqual([1.3, 1.3]);
        expect(component.images().find((entry) => entry.id === firstId)?.adjustments).toEqual(
          brightened,
        );
        expect(component.images().find((entry) => entry.id === secondId)?.adjustments).toEqual(
          brightened,
        );
      });

      it('setzt waehrend eines laufenden Exports keine Anpassungen', () => {
        const component = createComponent();
        addTwoImages(component);
        component.isBusy.set(true);

        component.setAdjustments(brightened);

        expect(component.activeLook().filter).toBe('');
        expect(component.images().every((entry) => entry.adjustments.brightness === 1)).toBe(true);
      });
    });
  });

  describe('Alles löschen', () => {
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
        adjustments: defaultAdjustments(),
        metadata: pendingMetadata(),
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
  });

  describe('Metadaten', () => {
    beforeAll(() => TestBed.resetTestingModule());

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
  });

  describe('Prüfschritt', () => {
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
        adjustments: defaultAdjustments(),
        metadata: pendingMetadata(),
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
        // `addFiles` liest im Hintergrund Metadaten; ein Stub genuegt, damit dieser
        // Aufruf nicht an einem fehlenden echten Service scheitert (siehe Test
        // "zaehlt das nach dem ersten Hochladen automatisch geoeffnete Bild").
        metadataReader: { read: () => Promise.resolve(pendingMetadata()) },
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
  });

  describe('Aktionsmeldungen', () => {
    function createComponent(pack: () => Promise<Blob>) {
      const toast = new ToastService();
      const component = Object.create(ImageOptimizerComponent.prototype) as ImageOptimizerComponent;
      Object.assign(component, {
        toast,
        isBusy: signal(false),
        rotationsPending: () => false,
        resolutionIssue: () => false,
        images: signal([]),
        selectedPlatforms: signal([]),
        error: signal<string | null>(null),
        baseName: () => '',
        zipExport: { pack: vi.fn(pack) },
        download: vi.fn(),
      });
      return { component, toast };
    }

    describe('ImageOptimizerComponent – Aktionsmeldungen', () => {
      it('bestätigt einen abgeschlossenen Export', async () => {
        const { component, toast } = createComponent(async () => new Blob());

        await component.exportImages();

        expect(toast.toasts()[0]).toMatchObject({
          type: 'success',
          title: 'Bilder wurden exportiert.',
        });
      });

      it('meldet einen Exportfehler persistent mit der Ausnahmebeschreibung', async () => {
        const { component, toast } = createComponent(async () => {
          throw new Error('ZIP konnte nicht erstellt werden');
        });

        await component.exportImages();

        expect(toast.toasts()[0]).toMatchObject({
          type: 'error',
          title: 'Bilder konnten nicht exportiert werden.',
          description: 'ZIP konnte nicht erstellt werden',
          persistent: true,
        });
      });
    });
  });

  describe('ImageOptimizerComponent – Zuschnitt vorbelegen', () => {
    beforeAll(() => TestBed.resetTestingModule());

    /**
     * Die echte Messung laeuft ueber ein `Image`-Element, das in jsdom nie
     * laedt. Der Test setzt die Groesse deshalb so, wie `measureNaturalSize`
     * es tut, und prueft die daran haengende Vorbelegung.
     */
    function withSize(component: ImageOptimizerComponent, id: string, size: Size): void {
      component.applyNaturalSize(id, size);
    }

    it('gibt jeder gewaehlten Plattform ihr Maximum, sobald die Groesse bekannt ist', () => {
      const component = createComponent();
      component.togglePlatform('ebay');
      component.togglePlatform('vinted');
      component.addFiles([jpegFile('a.jpg')]);
      const id = component.images()[0].id;

      withSize(component, id, { width: 3000, height: 4000 });

      const crops = component.images()[0].crops;
      expect(crops.vinted!.width).toBeCloseTo(2666.6667, 3);
      expect(crops.ebay!.width).toBeCloseTo(3000, 3);
    });

    it('gibt einer spaeter zugewaehlten Plattform ebenfalls ihr Maximum', () => {
      // Der gemeldete Fall: eBay steht, Vinted kommt dazu. Ohne die Regel
      // erbte Vinted vom eBay-Quadrat und waere um ein Drittel zu schmal.
      const component = createComponent();
      component.togglePlatform('ebay');
      component.addFiles([jpegFile('a.jpg')]);
      const id = component.images()[0].id;
      withSize(component, id, { width: 3000, height: 4000 });

      component.togglePlatform('vinted');

      expect(component.images()[0].crops.vinted!.width).toBeCloseTo(2666.6667, 3);
    });

    it('erbt vom aktiven Rahmen, sobald der Nutzer gezogen hat', () => {
      const component = createComponent();
      component.togglePlatform('ebay');
      component.addFiles([jpegFile('a.jpg')]);
      const id = component.images()[0].id;
      withSize(component, id, { width: 3000, height: 4000 });

      component.saveCrop(id, { x: 400, y: 600, width: 1500, height: 1500 });
      component.togglePlatform('vinted');

      expect(component.images()[0].crops.vinted!.width).toBeCloseTo(1000, 3);
    });
  });
});
