import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { PlatformProfile } from '../models/platform-profile';

export interface ZipEntry {
  readonly folder: string;
  readonly file: string;
  readonly data: Blob;
}

/** Der Ordner, in dem die Bilder einer Plattform liegen. */
export function folderName(platform: PlatformProfile): string {
  return platform.name;
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
  async pack(entries: ZipEntry[]): Promise<Blob> {
    const archive = new JSZip();

    for (const entry of entries) {
      archive.folder(entry.folder)?.file(entry.file, entry.data);
    }

    return archive.generateAsync({ type: 'blob' });
  }
}
