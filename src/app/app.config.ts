import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { SyncTranslateLoader } from './core/i18n/translations';
import { AppErrorHandler } from './core/errors/app-error-handler';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'de' },
    { provide: ErrorHandler, useClass: AppErrorHandler },
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
