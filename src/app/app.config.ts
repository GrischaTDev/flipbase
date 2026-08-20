import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { SyncTranslateLoader } from './core/i18n/translations';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'de' },
    provideTranslateService({
      fallbackLang: 'de',
      lang: 'de',
      loader: {
        provide: TranslateLoader,
        useClass: SyncTranslateLoader,
      },
    }),
  ],
};
