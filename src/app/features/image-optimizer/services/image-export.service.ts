import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlatformProfile, Rect } from '../models/platform-profile';
import { planOutput, renderImage } from './image-renderer';

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
   */
  async create(image: HTMLImageElement, crop: Rect, platform: PlatformProfile): Promise<Blob> {
    const plan = planOutput(crop, platform);
    const raw = await renderImage(image, plan);

    if (platform.maxFileSizeMB === null) return raw;
    if (raw.size <= platform.maxFileSizeMB * 1024 * 1024) return raw;

    return imageCompression(new File([raw], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: platform.maxFileSizeMB,
      maxWidthOrHeight: Math.max(plan.width, plan.height),
      useWebWorker: true,
    });
  }
}
