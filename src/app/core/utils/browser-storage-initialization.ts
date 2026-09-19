import { uebernehmeAltenBrowserSpeicher } from '../services/storage-migration';
import { removeLegacyBusinessCache } from './legacy-business-cache';

/** Bereitet den Browser-Speicher vollständig vor, bevor Angular Dienste erzeugt. */
export function prepareBrowserStorage(storage: Storage): void {
  uebernehmeAltenBrowserSpeicher(storage);
  removeLegacyBusinessCache(storage);
}

/** Gesperrter oder fehlender Browser-Speicher darf den Anwendungsstart nicht verhindern. */
export function prepareBrowserStorageIfAvailable(): void {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    prepareBrowserStorage(localStorage);
  } catch {
    // Die Anwendung startet auch ohne verfügbaren Browser-Speicher.
  }
}
