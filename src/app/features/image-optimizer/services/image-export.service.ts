import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlatformProfile, Rect } from '../models/platform-profile';
import { planOutput, renderImage } from './image-renderer';

/** Name einer Exportdatei. Index 0 ist das Hauptbild. */
export function fileName(index: number, _profil: PlatformProfile): string {
  const nummer = String(index + 1).padStart(2, '0');
  return index === 0 ? `${nummer}-main.jpg` : `${nummer}.jpg`;
}

@Injectable({
  providedIn: 'root',
})
export class BildExportService {
  /**
   * Erzeugt die Plattformfassung eines Bildes.
   *
   * Es wird ausschliesslich geschnitten und skaliert - nie aufgefuellt. eBay
   * verbietet hinzugefuegte Raender, und ein Rand um ein Produktfoto sieht
   * ohnehin nach Amateur aus.
   */
  async create(
    bild: HTMLImageElement,
    ausschnitt: Rect,
    plattform: PlatformProfile,
  ): Promise<Blob> {
    const plan = planOutput(ausschnitt, plattform);
    const roh = await renderImage(bild, plan);

    if (plattform.maxFileSizeMB === null) return roh;
    if (roh.size <= plattform.maxFileSizeMB * 1024 * 1024) return roh;

    return imageCompression(new File([roh], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: plattform.maxFileSizeMB,
      maxWidthOrHeight: Math.max(plan.width, plan.height),
      useWebWorker: true,
    });
  }
}
