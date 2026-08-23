import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';
import { PlattformProfil, Rechteck } from '../models/plattform-profile';
import { leiteAb } from './zuschnitt';

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
    const quelle = leiteAb(ausschnitt, plattform.exportVerhaeltnis);

    const flaeche = document.createElement('canvas');
    flaeche.width = plattform.exportBreite;
    flaeche.height = plattform.exportHoehe;

    const stift = flaeche.getContext('2d');
    if (!stift) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: Bei durchsichtigen PNG-Bereichen bliebe sonst Schwarz
    // stehen, sobald als JPEG kodiert wird.
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, flaeche.width, flaeche.height);
    stift.imageSmoothingQuality = 'high';
    stift.drawImage(
      bild,
      quelle.x,
      quelle.y,
      quelle.breite,
      quelle.hoehe,
      0,
      0,
      flaeche.width,
      flaeche.height,
    );

    const roh = await new Promise<Blob>((aufloesen, ablehnen) => {
      flaeche.toBlob(
        (b) => (b ? aufloesen(b) : ablehnen(new Error('Das Bild liess sich nicht erzeugen.'))),
        'image/jpeg',
        0.92,
      );
    });

    if (plattform.maxDateigroesseMB === null) return roh;
    if (roh.size <= plattform.maxDateigroesseMB * 1024 * 1024) return roh;

    return imageCompression(new File([roh], 'export.jpg', { type: 'image/jpeg' }), {
      maxSizeMB: plattform.maxDateigroesseMB,
      maxWidthOrHeight: Math.max(plattform.exportBreite, plattform.exportHoehe),
      useWebWorker: true,
    });
  }
}
