import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlatformProfile, Rect } from '../models/platform-profile';
import { NEUTRAL_LOOK, planOutput, renderImage } from './image-renderer';
import { Look } from './adjustments';
import { buildDateExif, withExif } from './exif-writer';

@Injectable({
  providedIn: 'root',
})
export class ImageExportService {
  /**
   * Erzeugt die Plattformfassung eines Bildes.
   *
   * Es wird ausschliesslich geschnitten und skaliert - nie aufgefuellt. eBay
   * verbietet hinzugefuegte Raender, und ein Rand um ein Produktfoto sieht
   * ohnehin nach Amateur aus.
   *
   * `capturedAt` ist das einzige Metadatum, das die Datei erreicht. Ist es
   * null, bleibt die Datei ohne EXIF - es wird nie ein Datum erfunden.
   */
  async create(
    image: HTMLImageElement,
    crop: Rect,
    platform: PlatformProfile,
    look: Look = NEUTRAL_LOOK,
    capturedAt: Date | null = null,
  ): Promise<Blob> {
    const plan = planOutput(crop, platform);
    const raw = await renderImage(image, plan, 0.92, look);
    const sized = await this.withinLimit(raw, plan, platform);

    return this.withCaptureDate(sized, capturedAt);
  }

  /** Verkleinert nur, wenn die Plattform eine Grenze nennt und sie ueberschritten ist. */
  private async withinLimit(
    raw: Blob,
    plan: { readonly width: number; readonly height: number },
    platform: PlatformProfile,
  ): Promise<Blob> {
    if (platform.maxFileSizeMB === null) return raw;
    if (raw.size <= platform.maxFileSizeMB * 1024 * 1024) return raw;

    return imageCompression(new File([raw], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: platform.maxFileSizeMB,
      maxWidthOrHeight: Math.max(plan.width, plan.height),
      useWebWorker: true,
    });
  }

  /**
   * Der **letzte** Schritt, und das ist keine Geschmacksfrage: Ueberschreitet
   * eine Datei die Groessengrenze, kodiert `browser-image-compression` sie neu
   * und wirft dabei jedes Segment weg. Vor dem Verkleinern gesetzt waere das
   * Datum in genau den Faellen verschwunden, in denen niemand nachsieht.
   */
  private async withCaptureDate(blob: Blob, capturedAt: Date | null): Promise<Blob> {
    if (!capturedAt) return blob;

    const data = new Uint8Array(await blob.arrayBuffer());

    return new Blob([withExif(data, buildDateExif(capturedAt)) as BlobPart], {
      type: 'image/jpeg',
    });
  }
}
