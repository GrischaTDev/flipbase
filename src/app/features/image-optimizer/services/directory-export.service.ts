import { Injectable } from '@angular/core';
import { freeFolderName } from './free-folder-name';

/** Was beim Schreiben herausgekommen ist. */
export type WriteResult =
  { readonly outcome: 'written'; readonly folder: string } | { readonly outcome: 'cancelled' };

/** Eine fertige Datei mit ihrem Plattformordner. */
export interface ExportEntry {
  readonly folder: string;
  readonly file: string;
  readonly data: Blob;
}

interface DirectoryPickerOptions {
  readonly mode?: 'read' | 'readwrite';
}

type DirectoryPicker = (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;

function picker(): DirectoryPicker | null {
  const candidate = (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker;

  return typeof candidate === 'function' ? (candidate as DirectoryPicker) : null;
}

/**
 * Ob dieser Browser direkt in einen Ordner schreiben kann.
 *
 * Chrome und Edge koennen es, Firefox und Safari nicht, Android gar nicht.
 * Wo es fehlt, faellt der Aufrufer auf das ZIP zurueck.
 */
export function canWriteDirectory(): boolean {
  return picker() !== null;
}

@Injectable({ providedIn: 'root' })
export class DirectoryExportService {
  /**
   * Fragt nach einem Zielordner und schreibt die Dateien hinein.
   *
   * Angelegt wird `<rootName>` und darin je ein Ordner pro Plattform. Ist
   * `<rootName>` schon vergeben, wird gezaehlt - es wird nie eine vorhandene
   * Datei ueberschrieben.
   *
   * `'cancelled'` heisst: Der Nutzer hat den Dialog geschlossen. Das ist kein
   * Fehler und darf keine Meldung ausloesen. Alles andere fliegt weiter nach
   * aussen, damit ein voller Datentraeger nicht als Abbruch durchgeht.
   *
   * Zurueck kommt der **tatsaechlich benutzte** Ordnername. Den gewuenschten
   * zu melden waere eine kleine Luege genau dann, wenn es darauf ankommt -
   * naemlich wenn der Zaehlsuffix gegriffen hat.
   */
  async write(
    entries: readonly ExportEntry[],
    rootName: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<WriteResult> {
    const open = picker();
    if (!open) throw new Error('Dieser Browser kann nicht direkt in einen Ordner schreiben.');

    let target: FileSystemDirectoryHandle;
    try {
      target = await open({ mode: 'readwrite' });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return { outcome: 'cancelled' };
      throw error;
    }

    const folderName = await freeFolderName(target, rootName);
    const root = await target.getDirectoryHandle(folderName, { create: true });

    // Je Plattform nur einmal anlegen; bei zwoelf Bildern waeren es sonst
    // zwoelf Anfragen fuer denselben Ordner.
    const folders = new Map<string, FileSystemDirectoryHandle>();

    let done = 0;
    for (const entry of entries) {
      let folder = folders.get(entry.folder);
      if (!folder) {
        folder = await root.getDirectoryHandle(entry.folder, { create: true });
        folders.set(entry.folder, folder);
      }

      const handle = await folder.getFileHandle(entry.file, { create: true });
      const stream = await handle.createWritable();
      await stream.write(entry.data);
      await stream.close();

      done++;
      onProgress(done, entries.length);
    }

    return { outcome: 'written', folder: folderName };
  }
}
