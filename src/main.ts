import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { uebernehmeAltenBrowserSpeicherWennMoeglich } from './app/core/services/speicher-migration';

// Register German locale data for CurrencyPipe and DatePipe (NG0701 fix)
registerLocaleData(localeDe, 'de');

// Muss vor dem Start laufen: Mehrere Dienste lesen ihre Werte bereits im
// Konstruktor aus dem Browser-Speicher.
uebernehmeAltenBrowserSpeicherWennMoeglich();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
