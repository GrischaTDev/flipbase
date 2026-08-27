import { Injectable } from '@angular/core';
import { Size } from '../models/platform-profile';

@Injectable({ providedIn: 'root' })
export class ImageRotationService {
  /**
   * Rendert `file` um `quarters` Viertelumdrehungen im Uhrzeigersinn gedreht in
   * eine neue Zeichenflaeche und liefert die Object-URL des Ergebnisses samt
   * resultierender Groesse.
   *
   * Gerendert wird immer aus der unveraenderten Originaldatei, nie aus dem
   * zuletzt gedrehten Ergebnis - sonst wuerde jede weitere Drehung erneut als
   * JPEG kodieren und das Bild verloere sichtbar an Qualitaet.
   */
  async rotate(file: File, quarters: 0 | 1 | 2 | 3): Promise<{ dataUrl: string; size: Size }> {
    const source = await this.loadOriginalFile(file);
    const width = source.width;
    const height = source.height;
    const swapped = quarters % 2 === 1;

    const canvas = document.createElement('canvas');
    canvas.width = swapped ? height : width;
    canvas.height = swapped ? width : height;

    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: wie beim Export bliebe sonst ein durchsichtiger
    // PNG-Bereich als Schwarz stehen, sobald als JPEG kodiert wird.
    pen.fillStyle = '#ffffff';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.imageSmoothingQuality = 'high';

    pen.translate(canvas.width / 2, canvas.height / 2);
    pen.rotate((quarters * 90 * Math.PI) / 180);
    pen.drawImage(source, -width / 2, -height / 2, width, height);

    if (source instanceof ImageBitmap) source.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Das gedrehte Bild liess sich nicht erzeugen.'))),
        'image/jpeg',
        0.92,
      );
    });

    return {
      dataUrl: URL.createObjectURL(blob),
      size: { width: canvas.width, height: canvas.height },
    };
  }

  /**
   * `createImageBitmap` wird bevorzugt (dekodiert ausserhalb des UI-Threads);
   * ohne diese API dient ein `<img>` an einer eigenen, danach wieder
   * freigegebenen Object-URL als Rueckfallebene.
   */
  private async loadOriginalFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);

    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Das Bild liess sich nicht lesen.'));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
