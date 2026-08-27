import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { PlatformProfile } from '../models/platform-profile';

export interface ZipEntry {
  readonly folder: string;
  readonly file: string;
  readonly data: Blob;
}

/** Der Ordner, in dem die Bilder einer Plattform liegen. */
export function folderName(plattform: PlatformProfile): string {
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
  async pack(eintraege: ZipEntry[]): Promise<Blob> {
    const archiv = new JSZip();

    for (const eintrag of eintraege) {
      archiv.folder(eintrag.folder)?.file(eintrag.file, eintrag.data);
    }

    return archiv.generateAsync({ type: 'blob' });
  }
}
