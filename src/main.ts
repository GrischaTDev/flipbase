import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { prepareBrowserStorageIfAvailable } from './app/core/utils/browser-storage-initialization';

// Register German locale data for CurrencyPipe and DatePipe (NG0701 fix)
registerLocaleData(localeDe, 'de');

// Muss vor Angular laufen: Einstellungen werden migriert und frühere globale
// Geschäftsdaten entfernt, bevor lazy geladene Dienste entstehen.
prepareBrowserStorageIfAvailable();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
