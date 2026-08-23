import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { PlattformProfil } from '../models/plattform-profile';

export interface ZipEintrag {
  readonly ordner: string;
  readonly datei: string;
  readonly daten: Blob;
}

/** Der Ordner, in dem die Bilder einer Plattform liegen. */
export function ordnerName(plattform: PlattformProfil): string {
  return plattform.name;
}

@Injectable({
  providedIn: 'root',
})
export class ZipExportService {
  /**
   * Packt die Bilder in ein Archiv mit einem Ordner je Plattform.
   *
   * Der Grund fuer die Ordner: Beim Einstellen oeffnet man genau einen Ordner
   * und waehlt alles darin aus. Alle Bilder in einem Verzeichnis waeren beim
   * Hochladen ein Suchspiel.
   */
  async packe(eintraege: ZipEintrag[]): Promise<Blob> {
    const archiv = new JSZip();

    for (const eintrag of eintraege) {
      archiv.folder(eintrag.ordner)?.file(eintrag.datei, eintrag.daten);
    }

    return archiv.generateAsync({ type: 'blob' });
  }
}
