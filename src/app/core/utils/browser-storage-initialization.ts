import { uebernehmeAltenBrowserSpeicher } from '../services/storage-migration';
import { removeLegacyBusinessCache } from './legacy-business-cache';

/** Bereitet den Browser-Speicher vollständig vor, bevor Angular Dienste erzeugt. */
export function prepareBrowserStorage(storage: Storage): void {
  // Zugangsdaten vor der Präfix-Migration und auch ohne lazy Webhook-Dienst entfernen.
  storage.removeItem('flipbase_webhook_config');
  storage.removeItem('reflip_webhook_config');
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
