import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlattformProfil, Rechteck } from '../models/plattform-profile';
import { planeAusgabe, rendereBild } from './bild-renderer';

/** Name einer Exportdatei. Index 0 ist das Hauptbild. */
export function dateiName(index: number, _profil: PlattformProfil): string {
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
  async erzeuge(
    bild: HTMLImageElement,
    ausschnitt: Rechteck,
    plattform: PlattformProfil,
  ): Promise<Blob> {
    const plan = planeAusgabe(ausschnitt, plattform);
    const roh = await rendereBild(bild, plan);

    if (plattform.maxDateigroesseMB === null) return roh;
    if (roh.size <= plattform.maxDateigroesseMB * 1024 * 1024) return roh;

    return imageCompression(new File([roh], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: plattform.maxDateigroesseMB,
      maxWidthOrHeight: Math.max(plan.breite, plan.hoehe),
      useWebWorker: true,
    });
  }
}
